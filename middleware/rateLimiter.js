const rateLimit = require('express-rate-limit');
const settings = require('../config/settings');
const logger = require('../utils/logger');

/**
 * Factory to create a limiter
 */
const createLimiter = (windowMs, max, message) => {
    return rateLimit({
        windowMs,
        max,
        message,
        standardHeaders: true,
        legacyHeaders: false,
        // Do NOT use custom keyGenerator - let express-rate-limit handle IPv6 automatically
        handler: (req, res) => {
            logger.warn(`Rate limit exceeded`, {
                ip: req.ip,
                path: req.path,
                requestId: req.requestId
            });
            res.status(429).json({ error: message });
        }
    });
};

// Pre-configured Limiters
const limiters = {
    widgetChat: createLimiter(
        settings.rateLimits.widget.chat.windowMs,
        settings.rateLimits.widget.chat.max,
        "Chat rate limit exceeded."
    ),
    widgetExtraction: createLimiter(
        settings.rateLimits.widget.extraction.windowMs,
        settings.rateLimits.widget.extraction.max,
        "Extraction limit exceeded (max 5/day)."
    ),
    adminActions: createLimiter(
        settings.rateLimits.admin.actions.windowMs,
        settings.rateLimits.admin.actions.max,
        "Admin action rate limit exceeded."
    ),
    authLimits: createLimiter(
        settings.rateLimits.admin.auth.windowMs,
        settings.rateLimits.admin.auth.max,
        "Too many login attempts."
    ),
    systemHealth: createLimiter(
        settings.rateLimits.system.health.windowMs,
        settings.rateLimits.system.health.max,
        "Too many requests."
    )
};

module.exports = limiters;
