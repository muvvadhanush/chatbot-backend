const express = require("express");
const router = express.Router();
const Connection = require("../models/Connection");
const ConnectionKnowledge = require("../models/ConnectionKnowledge");
const bcrypt = require("bcryptjs"); // Use bcryptjs

// 1.2 Widget Handshake
router.post("/hello", async (req, res) => {
    try {
        const { connectionId, password, origin, pageTitle } = req.body;

        if (!connectionId) return res.status(400).json({ error: "Missing connectionId" });

        const connection = await Connection.findOne({ where: { connectionId } });
        if (!connection) {
            return res.status(404).json({ error: "Connection not found" });
        }

        // Validate Password (if hash exists)
        if (connection.passwordHash && password) {
            const isValid = await bcrypt.compare(password, connection.passwordHash);
            if (!isValid) {
                return res.status(403).json({ error: "Invalid password" });
            }
        }

        // Update Status
        connection.status = "CONNECTED";
        connection.widgetSeen = true;
        // Optionally store last seen origin if we add that field later

        await connection.save();

        res.json({
            ok: true,
            extractionAllowed: connection.extractionEnabled
        });

    } catch (error) {
        console.error("Widget Hello Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// 1.5 Widget Extraction Submit
router.post("/extract", async (req, res) => {
    try {
        // Payload: { connectionId, token, data: { siteName, assistantName, branding, knowledge, forms } }
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

        // Process Incoming Data
        // 1. Branding / Metadata
        if (data.siteName) connection.websiteName = data.siteName;
        if (data.assistantName) connection.assistantName = data.assistantName;
        // if (data.branding) ... handle branding object

        // 2. Knowledge
        if (data.knowledge && Array.isArray(data.knowledge)) {
            for (const item of data.knowledge) {
                // Check dupes based on URL/Value?
                const exists = await ConnectionKnowledge.findOne({
                    where: { connectionId, sourceValue: item.url || item.text }
                });

                if (!exists) {
                    await ConnectionKnowledge.create({
                        connectionId,
                        sourceType: item.type === 'url' ? 'URL' : 'TEXT',
                        sourceValue: item.url || item.text,
                        status: 'PENDING',
                        metadata: { source: 'widget_extract', pageTitle: item.title }
                    });
                }
            }
        }

        // 3. Forms (Future Phase)
        // if (data.forms) ...

        await connection.save();

        res.json({ success: true, message: "Extraction received" });

    } catch (error) {
        console.error("Widget Extract Error:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
