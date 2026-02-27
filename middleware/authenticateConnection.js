const crypto = require("crypto");
const { URL } = require("url");
const Connection = require("../models/Connection");

module.exports = async (req, res, next) => {
    try {
        const connectionId = req.headers["x-connection-id"];
        const providedSecret = req.headers["x-connection-secret"];

        if (!connectionId || !providedSecret) {
            return res.status(401).json({
                error: "Missing chatbot credentials"
            });
        }

        const connection = await Connection.findOne({
            where: { connectionId }
        });

        if (!connection) {
            return res.status(401).json({
                error: "Invalid connection"
            });
        }

        // ===== Constant-time Secret Validation =====
        const hash = crypto.createHash("sha256").update(providedSecret).digest("hex");


        if (hash !== connection.connectionSecretHash) {
            return res.status(401).json({
                error: "Invalid chatbot credentials"
            });
        }

        // ===== Domain Validation =====
        const originHeader = req.headers.origin || req.headers.referer;

        if (!originHeader) {
            return res.status(403).json({
                error: "Origin header missing"
            });
        }

        let requestHost;
        try {
            requestHost = new URL(originHeader).hostname;
        } catch {
            return res.status(403).json({
                error: "Invalid origin format"
            });
        }

        let allowedDomains = connection.allowedDomains;

        if (typeof allowedDomains === "string") {
            try {
                allowedDomains = JSON.parse(allowedDomains);
            } catch {
                allowedDomains = [allowedDomains];
            }
        }

        if (!Array.isArray(allowedDomains)) {
            allowedDomains = [allowedDomains];
        }

        if (!allowedDomains.includes("*")) {
            const match = allowedDomains.some(domain => {
                try {
                    const allowedHost = new URL(
                        domain.startsWith("http") ? domain : `https://${domain}`
                    ).hostname;

                    return requestHost === allowedHost;
                } catch {
                    return false;
                }
            });

            if (!match) {
                return res.status(403).json({
                    error: "This domain is not allowed"
                });
            }
        }

        req.connection = connection;
        next();

    } catch (error) {
        console.error("Authentication Middleware Error:", error);
        return res.status(500).json({
            error: "Authentication failure"
        });
    }
};
