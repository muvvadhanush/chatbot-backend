const express = require("express");
const router = express.Router();
const aiService = require("../services/aiservice");
const ChatSession = require("../models/ChatSession");
const Connection = require("../models/Connection");

console.log("🔥 chatRoutes.js LOADED");

// Main chat endpoint
// Main chat endpoint
const chatController = require("../controllers/chatController");
router.post("/send", chatController.sendMessage);
router.post("/feedback", chatController.submitFeedback);

// Get welcome message for a connection
router.get("/welcome/:connectionId", async (req, res) => {
    try {
        const connection = await Connection.findOne({
            where: { connectionId: req.params.connectionId }
        });

        if (!connection) {
            return res.status(404).json({ error: "Connection not found" });
        }

        // --- SECURITY: DOMAIN LOCKING ---
        const origin = req.headers.origin || req.headers.referer;
        if (connection.allowedDomains && connection.allowedDomains.length > 0) {
            const domains = Array.isArray(connection.allowedDomains) ? connection.allowedDomains : [connection.allowedDomains];
            const isAllowed = domains.includes('*') ||
                (origin && domains.some(d => origin.includes(d.replace(/^https?:\/\//, ''))));

            if (!isAllowed) {
                return res.status(403).json({ error: "This domain is not authorized." });
            }
        }

        return res.json({
            welcomeMessage: connection.welcomeMessage,
            assistantName: connection.assistantName,
            theme: connection.theme,
            logoUrl: connection.logoUrl
        });

    } catch (error) {
        console.error("❌ Welcome error:", error);
        return res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;
