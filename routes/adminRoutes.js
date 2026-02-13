const express = require("express");
const router = express.Router();
const ChatSession = require("../models/ChatSession");
const Connection = require("../models/Connection");
const ConnectionKnowledge = require("../models/ConnectionKnowledge");
const PendingExtraction = require("../models/PendingExtraction");
const connectionController = require("../controllers/connectionController");

const authorize = require("../middleware/rbac");
const basicAuth = require("../middleware/auth");

// Existing Analytics Route
router.get("/analytics", basicAuth, authorize(['VIEWER', 'EDITOR', 'OWNER']), async (req, res) => {
    try {
        const sessions = await ChatSession.findAll();

        // Calculate At-Risk (Global & Per Connection)
        let atRiskCount = 0;
        const riskMap = {}; // connectionId -> count

        sessions.forEach(s => {
            const msgs = s.messages || [];
            msgs.forEach(m => {
                if (m.role === 'assistant' && m.ai_metadata) {
                    if ((m.ai_metadata.confidenceScore || 1) < 0.7) {
                        atRiskCount++;
                        riskMap[s.connectionId] = (riskMap[s.connectionId] || 0) + 1;
                    }
                }
            });
        });

        res.json({
            totalSessions: sessions.length,
            totalMessages: sessions.reduce((a, s) => a + s.messages.length, 0),
            globalAtRiskCount: atRiskCount,
            riskMap: riskMap
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Phase 1.7: Admin Review ---

// 1.7.2 List Pending Extractions
router.get("/connections/:connectionId/extractions", basicAuth, authorize(['VIEWER', 'EDITOR', 'OWNER']), async (req, res) => {
    try {
        const { connectionId } = req.params;
        const { status } = req.query;

        const where = { connectionId };
        if (status) where.status = status;

        const extractions = await PendingExtraction.findAll({
            where,
            order: [['createdAt', 'DESC']]
        });

        res.json(extractions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 1.7.3 Review Extraction (Approve/Reject)
router.post("/extractions/:extractionId/review", basicAuth, authorize(['EDITOR', 'OWNER']), async (req, res) => {
    try {
        const { extractionId } = req.params;
        const { action, notes } = req.body; // action: "APPROVE" | "REJECT"

        const extraction = await PendingExtraction.findOne({ where: { id: extractionId } });
        if (!extraction) return res.status(404).json({ error: "Extraction not found" });

        if (extraction.status !== 'PENDING') {
            return res.status(400).json({ error: "Item already reviewed" });
        }

        if (action === 'REJECT') {
            extraction.status = 'REJECTED';
            extraction.reviewNotes = notes;
            extraction.reviewedAt = new Date();
            extraction.reviewedBy = req.user.username; // Log reviewer
            await extraction.save();
            return res.json({ success: true, status: 'REJECTED' });
        }

        if (action === 'APPROVE') {
            const connection = await Connection.findOne({ where: { connectionId: extraction.connectionId } });

            // PROMOTE DATA
            if (extraction.extractorType === 'METADATA') {
                if (extraction.rawData.websiteName) connection.websiteName = extraction.rawData.websiteName;
                if (extraction.rawData.assistantName) connection.assistantName = extraction.rawData.assistantName;
                await connection.save();
            }
            else if (extraction.extractorType === 'BRANDING') {
                // Assuming rawData has { favicon, logo }
                // For now, we update logoUrl as a simple string if provided
                if (extraction.rawData.logo) connection.logoUrl = extraction.rawData.logo;
                await connection.save();
            }
            else if (extraction.extractorType === 'KNOWLEDGE') {
                const item = extraction.rawData;
                await ConnectionKnowledge.create({
                    connectionId: extraction.connectionId,
                    sourceType: item.type === 'url' ? 'URL' : 'TEXT',
                    sourceValue: item.url || item.text,
                    status: 'READY', // Directly ready after approval
                    visibility: 'ACTIVE', // Phase 2: Active Knowledge
                    confidenceScore: 1.0, // Admin approved
                    metadata: { source: 'admin_approved', pageTitle: item.title }
                });
            }
            else if (extraction.extractorType === 'NAVIGATION') {
                // Phase 2: Store in separate Navigation model
            }
            else if (extraction.extractorType === 'DRIFT') {
                // Update Existing Knowledge
                const updateData = extraction.rawData; // { knowledgeId, newContent, newHash }
                if (updateData.knowledgeId) {
                    const knowledge = await ConnectionKnowledge.findOne({ where: { id: updateData.knowledgeId } });
                    if (knowledge) {
                        knowledge.cleanedText = updateData.newContent;
                        knowledge.contentHash = updateData.newHash;
                        knowledge.status = 'READY';
                        knowledge.lastCheckedAt = new Date();
                        await knowledge.save();
                    }
                }
            }

            extraction.status = 'APPROVED';
            extraction.reviewNotes = notes;
            extraction.reviewedAt = new Date();
            extraction.reviewedBy = req.user.username; // Log reviewer
            await extraction.save();

            return res.json({ success: true, status: 'APPROVED' });
        }

        res.status(400).json({ error: "Invalid action" });

    } catch (error) {
        console.error("Review Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- Phase 2.4: Feedback Loop ---
router.post("/chat-sessions/:sessionId/messages/:index/feedback", basicAuth, authorize(['EDITOR', 'OWNER']), async (req, res) => {
    try {
        const { sessionId, index } = req.params;
        const { rating, notes } = req.body; // rating: "CORRECT" | "INCORRECT"

        const session = await ChatSession.findOne({ where: { sessionId } });
        if (!session) return res.status(404).json({ error: "Session not found" });

        const messages = session.messages || [];
        const msgIndex = parseInt(index);

        if (isNaN(msgIndex) || msgIndex < 0 || msgIndex >= messages.length) {
            return res.status(400).json({ error: "Invalid message index" });
        }

        const targetMsg = messages[msgIndex];
        if (targetMsg.role !== 'assistant') {
            return res.status(400).json({ error: "Can only rate assistant messages" });
        }

        // 1. Update Message with Feedback
        targetMsg.feedback = {
            rating,
            notes,
            createdAt: new Date()
        };

        // Update the array in place
        messages[msgIndex] = targetMsg;
        session.messages = messages;
        session.changed('messages', true);
        await session.save();

        // 2. Adjust Intelligence (Confidence Score)
        if (targetMsg.ai_metadata && targetMsg.ai_metadata.sources) {
            for (const source of targetMsg.ai_metadata.sources) {
                if (source.sourceId) {
                    const knowledge = await ConnectionKnowledge.findOne({ where: { id: source.sourceId } });
                    if (knowledge) {
                        let score = knowledge.confidenceScore || 0.5;

                        if (rating === 'CORRECT') {
                            score = Math.min(score + 0.1, 1.0); // Boost
                        } else if (rating === 'INCORRECT') {
                            score = Math.max(score - 0.2, 0.0); // Penalize harder
                        }

                        knowledge.confidenceScore = score;
                        await knowledge.save();
                    }
                }
            }
        }

        res.json({ success: true, message: "Feedback recorded and intelligence updated." });

    } catch (error) {
        console.error("Feedback Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// 1.7.4 Admin Trigger Extraction (Wizard)
router.post("/connections/:connectionId/extract", basicAuth, authorize(['EDITOR', 'OWNER']), async (req, res) => {
    try {
        const { connectionId } = req.params;
        const { url } = req.body;

        if (!url) return res.status(400).json({ error: "URL is required" });

        const scraperService = require("../services/scraperService");

        // 1. Scrape
        const result = await scraperService.scrapeWebsite(url);
        if (!result.success) throw new Error(result.error);

        // 2. Create Pending Extractions

        // A. Metadata Proposal
        if (result.metadata && (result.metadata.title || result.metadata.description)) {
            await PendingExtraction.create({
                connectionId,
                extractorType: 'METADATA',
                status: 'PENDING',
                confidenceScore: 0.9,
                rawData: {
                    websiteName: result.metadata.title,
                    websiteDescription: result.metadata.description
                },
                metadata: { sourceUrl: url }
            });
        }

        // B. Knowledge Proposal
        if (result.rawText && result.rawText.length > 50) {
            await PendingExtraction.create({
                connectionId,
                extractorType: 'KNOWLEDGE',
                status: 'PENDING',
                confidenceScore: 0.85,
                rawData: {
                    title: result.metadata.title || "Scraped Content",
                    content: result.rawText,
                    url: url
                },
                metadata: { sourceUrl: url }
            });
        }

        res.json({ success: true, message: "Extraction started. Please review pending items." });

    } catch (error) {
        console.error("Extraction Error:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
