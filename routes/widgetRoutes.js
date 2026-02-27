const express = require("express");
const router = express.Router();
const Connection = require("../models/Connection");
const ConnectionKnowledge = require("../models/ConnectionKnowledge");
const bcrypt = require("bcryptjs"); // Use bcryptjs
const StateMachine = require("../services/OnboardingStateMachine");

// 1.2 Widget Handshake
router.post("/hello", async (req, res) => {
    try {
        const { connectionId, password, origin, pageTitle } = req.body;

        if (!connectionId) return res.status(400).json({ error: "Missing connectionId" });

        const connection = await Connection.findOne({ where: { connectionId } });
        if (!connection) {
            console.warn(`⚠️ [WIDGET] Handshake failed: Connection ${connectionId} not found in DB.`);
            return res.status(404).json({ error: "Connection not found" });
        }

        // Validate Password (if hash exists)
        if (connection.passwordHash && password) {
            const isValid = await bcrypt.compare(password, connection.passwordHash);
            if (!isValid) {
                return res.status(403).json({ error: "Invalid password" });
            }
        }

        // Transition DRAFT → CONNECTED via state machine (if still in DRAFT)
        if (connection.status === 'DRAFT') {
            // Set websiteUrl from origin if not already set
            if (origin && !connection.websiteUrl) {
                await connection.update({ websiteUrl: origin });
            }

            const result = await StateMachine.transition(connection, 'CONNECTED', {
                expectedVersion: connection.version,
                meta: {
                    handshakeOrigin: origin || 'unknown',
                    handshakeAt: new Date().toISOString(),
                    pageTitle: pageTitle || null
                }
            });

            if (!result.success) {
                console.warn(`⚠️ [WIDGET] Handshake transition failed: ${result.error}`);
                // Don't block the widget — it can still operate, just log the issue
            }
        }

        // Update last activity
        connection.lastActivityAt = new Date();
        await connection.save();

        res.json({
            ok: true,
            extractionAllowed: connection.extractionEnabled,
            config: connection.widgetConfig || {} // Send config to widget
        });

    } catch (error) {
        console.error("Widget Hello Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// 1.5 Widget Extraction Submit -> 1.7 Pending Store
router.post("/extract", async (req, res) => {
    try {
        const { connectionId, token, data } = req.body;

        if (!connectionId || !data) return res.status(400).json({ error: "Missing data" });

        const connection = await Connection.findOne({ where: { connectionId } });
        if (!connection) return res.status(404).json({ error: "Connection not found" });

        // Validate Token
        if (connection.extractionToken !== token) {
            return res.status(403).json({ error: "Invalid extraction token" });
        }

        // Check Expiry
        if (connection.extractionTokenExpires && new Date() > connection.extractionTokenExpires) {
            return res.status(403).json({ error: "Extraction token expired" });
        }

        const PendingExtraction = require("../models/PendingExtraction");
        const pageUrl = data.pageUrl || null;

        // 1. Metadata (Site Name, Assistant Name)
        if (data.siteName || data.assistantName) {
            await PendingExtraction.create({
                connectionId,
                source: 'WIDGET',
                extractorType: 'METADATA',
                rawData: {
                    websiteName: data.siteName,
                    assistantName: data.assistantName
                },
                pageUrl,
                status: 'PENDING'
            });
        }

        // 2. Branding
        if (data.branding) {
            await PendingExtraction.create({
                connectionId,
                source: 'WIDGET',
                extractorType: 'BRANDING',
                rawData: data.branding,
                pageUrl,
                status: 'PENDING'
            });
        }

        // 3. Knowledge
        if (data.knowledge && Array.isArray(data.knowledge)) {
            for (const item of data.knowledge) {
                await PendingExtraction.create({
                    connectionId,
                    source: 'WIDGET',
                    extractorType: 'KNOWLEDGE',
                    rawData: item,
                    pageUrl,
                    status: 'PENDING'
                });
            }
        }

        // 4. Navigation (New)
        if (data.navigation && Array.isArray(data.navigation)) {
            for (const item of data.navigation) {
                await PendingExtraction.create({
                    connectionId,
                    source: 'WIDGET',
                    extractorType: 'NAVIGATION',
                    rawData: item, // { label, action, selector }
                    pageUrl,
                    status: 'PENDING'
                });
            }
        }

        // Update connection status
        if (connection.status === 'EXTRACTION_REQUESTED') {
            connection.status = 'READY';
            await connection.save();
        }

        res.json({ success: true, message: "Extraction received for review" });

    } catch (error) {
        console.error("Widget Extract Error:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
