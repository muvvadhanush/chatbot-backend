const express = require("express");
const router = express.Router();

const limiters = require("../middleware/rateLimiter");
const chatController = require("../controllers/chatController");
const Connection = require("../models/Connection");
const { URL } = require("url");

// ===============================
// 1️⃣ Chat Endpoints
// ===============================

// Basic health test
router.post("/chat", chatController.handleChat);

// Main chat endpoint
router.post(
    "/send",
    limiters.widgetChat,
    chatController.sendMessage
);

// ===============================
// 2️⃣ Welcome Endpoint (Widget)
// ===============================
router.get(
    "/welcome/:connectionId",
    limiters.widgetChat,
    async (req, res) => {
        try {
            const { connectionId } = req.params;

            if (!connectionId || connectionId.length > 64) {
                return res
                    .status(400)
                    .json({ error: "INVALID_CONNECTION_ID" });
            }

            const connection = await Connection.findOne({
                where: { connectionId }
            });

            if (!connection) {
                return res
                    .status(404)
                    .json({ error: "Connection not found" });
            }

            // ===== Secure Domain Validation =====
            const originHeader =
                req.headers.origin || req.headers.referer;

            if (connection.allowedDomains) {
                let domains = connection.allowedDomains;

                if (typeof domains === "string") {
                    try {
                        domains = JSON.parse(domains);
                    } catch {
                        domains = [domains];
                    }
                }

                if (!Array.isArray(domains)) {
                    domains = [domains];
                }

                if (!domains.includes("*")) {
                    if (!originHeader) {
                        return res.status(403).json({
                            error: "DOMAIN_NOT_ALLOWED"
                        });
                    }

                    const requestHost =
                        new URL(originHeader).hostname;

                    const isAllowed = domains.some((allowed) => {
                        try {
                            const allowedHost = new URL(
                                allowed.startsWith("http")
                                    ? allowed
                                    : `https://${allowed}`
                            ).hostname;

                            return requestHost === allowedHost;
                        } catch {
                            return false;
                        }
                    });

                    if (!isAllowed) {
                        return res.status(403).json({
                            error: "DOMAIN_NOT_ALLOWED"
                        });
                    }
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
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR"
            });
        }
    }
);

module.exports = router;
