const express = require("express");
const router = express.Router();
const ChatSession = require("../models/ChatSession");
const Connection = require("../models/Connection");
const ConnectionKnowledge = require("../models/ConnectionKnowledge");
const PendingExtraction = require("../models/PendingExtraction");
const MissedQuestion = require("../models/MissedQuestion");
const connectionController = require("../controllers/connectionController");

const authorize = require("../middleware/rbac");
const basicAuth = require("../middleware/auth");

// Existing Analytics Route
router.get("/analytics", basicAuth, authorize(['VIEWER', 'EDITOR', 'OWNER']), async (req, res) => {
    try {
        // Parallel Fetch for Performance
        const [totalConnections, totalSessions, totalKnowledge, missedGaps, sessions] = await Promise.all([
            Connection.count(),
            ChatSession.count(),
            ConnectionKnowledge.count(),
            MissedQuestion.count({ where: { status: 'PENDING' } }),
            ChatSession.findAll({ limit: 50, order: [['updatedAt', 'DESC']] }) // Sample for health
        ]);

        let totalTokens = 0;
        let atRiskCount = 0;
        const riskMap = {};
        let totalMsgCount = 0;
        const confidenceScores = [];

        sessions.forEach(s => {
            const msgs = s.messages || [];
            totalMsgCount += msgs.length;

            msgs.forEach(m => {
                if (m.role === 'assistant' && m.ai_metadata) {
                    const tokens = m.ai_metadata.totalTokens || m.ai_metadata.usage?.total_tokens || 0;
                    totalTokens += tokens;

                    const conf = m.ai_metadata.confidenceScore;
                    if (conf !== undefined && conf !== null) {
                        confidenceScores.push(conf);
                    }

                    if ((m.ai_metadata.confidenceScore || 1) < 0.65) {
                        atRiskCount++;
                        riskMap[s.connectionId] = (riskMap[s.connectionId] || 0) + 1;
                    }
                }
            });
        });

        // FIX: Compute avgMessages and avgConfidence for frontend analytics view
        const avgMessages = sessions.length > 0 ? totalMsgCount / sessions.length : 0;
        const avgConfidence = confidenceScores.length > 0
            ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
            : 0;

        // Heuristic: Health starts at 100, drops by 5 for every at-risk interaction in sample
        const healthScore = Math.max(0, 100 - (atRiskCount * 2));
        const estimatedCost = (totalTokens / 1000) * 0.02; // Roughly $0.02 per 1k tokens (GPT-4o avg)

        res.json({
            totalConnections,
            totalSessions,
            totalKnowledge,
            pendingGaps: missedGaps,
            healthScore,
            totalTokens,
            estimatedCost: estimatedCost.toFixed(2),
            globalAtRiskCount: atRiskCount,
            riskMap: riskMap,
            avgMessages,
            avgConfidence
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

// Gap Closure: Update Widget Config
router.patch("/connections/:connectionId/config", basicAuth, authorize(['EDITOR', 'OWNER']), async (req, res) => {
    try {
        const { connectionId } = req.params;
        const configUpdates = req.body; // Partial updates allowed

        const connection = await Connection.findOne({ where: { connectionId } });
        if (!connection) return res.status(404).json({ error: "Connection not found" });

        // Merge existing config with updates
        const currentConfig = connection.widgetConfig || {
            primaryColor: "#4f46e5",
            launcherIcon: "DEFAULT",
            botAvatar: "DEFAULT",
            title: "AI Assistant",
            welcomeMessage: "Hi! How can I help you today?",
            timeOnPage: 0,
            pageUrl: "",
            socialLinks: []
        };

        connection.widgetConfig = {
            ...currentConfig,
            ...configUpdates
        };

        // If specific fields are updated, we can also sync to top-level fields (optional)
        // e.g., if config.title changes, update connection.assistantName?
        // For now, keep them separate or sync:
        if (configUpdates.title) connection.assistantName = configUpdates.title;

        await connection.save();

        res.json({ success: true, config: connection.widgetConfig });

    } catch (error) {
        console.error("Config Update Error:", error);
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
        const { metadata, forms, navigation, rawText, success, error: scrapeError } = await scraperService.scrapeWebsite(url);
        if (!success) throw new Error(scrapeError);

        // 2. Create Pending Extractions

        // A. Metadata Proposal
        if (metadata && (metadata.title || metadata.description)) {
            await PendingExtraction.create({
                connectionId,
                extractorType: 'METADATA',
                status: 'PENDING',
                confidenceScore: 0.95,
                rawData: metadata, // Store full metadata object
                metadata: { sourceUrl: url }
            });
        }

        // B. Forms Proposal
        if (forms && forms.length > 0) {
            for (const form of forms) {
                await PendingExtraction.create({
                    connectionId,
                    extractorType: 'FORM',
                    status: 'PENDING',
                    confidenceScore: 0.9,
                    rawData: form,
                    metadata: { sourceUrl: url }
                });
            }
        }

        // C. Navigation Proposal
        if (navigation && navigation.length > 0) {
            // Group navigation into one record or multiple? 
            // Better to grouping to avoid spam.
            await PendingExtraction.create({
                connectionId,
                extractorType: 'NAVIGATION',
                status: 'PENDING',
                confidenceScore: 0.85,
                rawData: { links: navigation },
                metadata: { sourceUrl: url, count: navigation.length }
            });
        }

        // D. Knowledge Proposal
        if (rawText && rawText.length > 50) {
            await PendingExtraction.create({
                connectionId,
                extractorType: 'KNOWLEDGE',
                status: 'PENDING',
                confidenceScore: 0.85,
                rawData: {
                    title: metadata.title || "Scraped Content",
                    content: rawText,
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

// --- Phase 3: AI Intelligence (Missed Questions) ---
router.get("/connections/:connectionId/missed-questions", basicAuth, authorize(['VIEWER', 'EDITOR', 'OWNER']), async (req, res) => {
    try {
        const { connectionId } = req.params;
        const { status } = req.query;

        const where = { connectionId };
        if (status) where.status = status;

        const missed = await MissedQuestion.findAll({
            where,
            order: [['createdAt', 'DESC']]
        });

        res.json(missed);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.patch("/missed-questions/:id", basicAuth, authorize(['EDITOR', 'OWNER']), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const missed = await MissedQuestion.findOne({ where: { id } });
        if (!missed) return res.status(404).json({ error: "Missed question not found" });

        if (status) missed.status = status;
        await missed.save();

        res.json({ success: true, status: missed.status });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
