const rateLimit = require("express-rate-limit");
const settings = require("../config/settings");
const logger = require("../utils/logger");

/**
 * Safely extract client IP
 */
const getClientIp = (req) => {
    return (
        req.ip ||
        req.headers["x-forwarded-for"]?.split(",")[0] ||
        req.connection?.remoteAddress ||
        "unknown"
    );
};

/**
 * Enhanced Limiter Factory
 */
const createLimiter = (windowMs, max, message, keyType = "ip") => {
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,

        keyGenerator: (req) => {
            const baseIp = getClientIp(req);

            if (keyType === "connection") {
                const connectionId =
                    req.headers["x-connection-id"] ||
                    req.body?.connectionId ||
                    req.params?.connectionId ||
                    "unknown";

                return `${connectionId}:${baseIp}`;
            }

            return baseIp;
        },

        handler: (req, res) => {
            logger.warn("Rate limit exceeded", {
                ip: getClientIp(req),
                path: req.originalUrl,
                connectionId:
                    req.headers["x-connection-id"] ||
                    req.body?.connectionId ||
                    req.params?.connectionId,
                requestId: req.requestId
            });

            res.setHeader("Retry-After", Math.ceil(windowMs / 1000));

            res.status(429).json({
                error: "RATE_LIMIT_EXCEEDED",
                message
            });
        }
    });
};

// ===========================
// Preconfigured Limiters
// ===========================

const limiters = {

    // Widget Chat (Connection-Aware)
    widgetChat: createLimiter(
        settings.rateLimits.widget.chat.windowMs,
        settings.rateLimits.widget.chat.max,
        "Chat rate limit exceeded.",
        "connection"
    ),

    // Extraction (Heavy)
    widgetExtraction: createLimiter(
        settings.rateLimits.widget.extraction.windowMs,
        settings.rateLimits.widget.extraction.max,
        "Extraction limit exceeded.",
        "connection"
    ),

    // Admin Actions
    adminActions: createLimiter(
        settings.rateLimits.admin.actions.windowMs,
        settings.rateLimits.admin.actions.max,
        "Admin action rate limit exceeded."
    ),

    // Authentication
    authLimits: createLimiter(
        settings.rateLimits.admin.auth.windowMs,
        settings.rateLimits.admin.auth.max,
        "Too many login attempts."
    ),

    // System Health
    systemHealth: createLimiter(
        settings.rateLimits.system.health.windowMs,
        settings.rateLimits.system.health.max,
        "Too many requests."
    )
};

module.exports = limiters;
