const express = require("express");
const router = express.Router();
const ButtonSet = require("../models/ButtonSet");
const Connection = require("../models/Connection");
const authenticate = require("../middleware/auth");
const authorize = require("../middleware/rbac");
const limiters = require("../middleware/rateLimiter");

// ============================================================
// BUTTON SET CRUD — RBAC Protected, Rate Limited
// ============================================================

/**
 * GET /api/admin/connections/:connectionId/buttons
 * List all button sets for a connection.
 */
router.get(
    "/connections/:connectionId/buttons",
    authenticate,
    authorize(['VIEWER', 'EDITOR', 'OWNER']),
    limiters.adminActions,
    async (req, res) => {
        try {
            const { connectionId } = req.params;
            const { active } = req.query;

            const where = { connectionId };
            if (active !== undefined) where.active = active === 'true';

            const sets = await ButtonSet.findAll({
                where,
                order: [['createdAt', 'DESC']]
            });

            res.json(sets);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
);

/**
 * POST /api/admin/connections/:connectionId/buttons
 * Create a new button set.
 */
router.post(
    "/connections/:connectionId/buttons",
    authenticate,
    authorize(['OWNER']),
    limiters.adminActions,
    async (req, res) => {
        try {
            const { connectionId } = req.params;

            // Verify connection exists
            const conn = await Connection.findByPk(connectionId);
            if (!conn) return res.status(404).json({ error: "Connection not found" });

            const { name, buttons, isQuickReply, triggerType, triggerValue } = req.body;

            if (!name || !name.trim()) {
                return res.status(400).json({ error: "Name is required" });
            }
            if (!buttons || !Array.isArray(buttons) || buttons.length === 0) {
                return res.status(400).json({ error: "At least one button is required" });
            }
            if (buttons.length > 5) {
                return res.status(400).json({ error: "Maximum 5 buttons per set" });
            }

            // Validate each button
            const validation = validateButtons(buttons);
            if (!validation.valid) {
                return res.status(400).json({ error: validation.error });
            }

            // Assign stable IDs to buttons
            const processedButtons = buttons.map((btn, i) => ({
                id: btn.id || `btn_${Date.now()}_${i}`,
                label: btn.label.trim(),
                type: btn.type,
                payload: btn.payload || '',
                icon: btn.icon || '',
                order: btn.order || i + 1
            }));

            const set = await ButtonSet.create({
                connectionId,
                name: name.trim(),
                buttons: processedButtons,
                isQuickReply: !!isQuickReply,
                triggerType: triggerType || 'MANUAL',
                triggerValue: triggerValue || null
            });

            res.status(201).json(set);
        } catch (err) {
            // Handle validation errors from model
            if (err.name === 'SequelizeValidationError') {
                return res.status(400).json({ error: err.errors?.[0]?.message || err.message });
            }
            res.status(500).json({ error: err.message });
        }
    }
);

/**
 * PUT /api/admin/buttons/:setId
 * Update an existing button set.
 */
router.put(
    "/buttons/:setId",
    authenticate,
    authorize(['OWNER']),
    limiters.adminActions,
    async (req, res) => {
        try {
            const set = await ButtonSet.findByPk(req.params.setId);
            if (!set) return res.status(404).json({ error: "Button set not found" });

            const { name, buttons, isQuickReply, triggerType, triggerValue, active } = req.body;

            if (buttons !== undefined) {
                if (!Array.isArray(buttons)) {
                    return res.status(400).json({ error: "buttons must be an array" });
                }
                if (buttons.length > 5) {
                    return res.status(400).json({ error: "Maximum 5 buttons per set" });
                }
                if (buttons.length === 0) {
                    return res.status(400).json({ error: "At least one button is required" });
                }

                const validation = validateButtons(buttons);
                if (!validation.valid) {
                    return res.status(400).json({ error: validation.error });
                }

                set.buttons = buttons.map((btn, i) => ({
                    id: btn.id || `btn_${Date.now()}_${i}`,
                    label: btn.label.trim(),
                    type: btn.type,
                    payload: btn.payload || '',
                    icon: btn.icon || '',
                    order: btn.order || i + 1
                }));
            }

            if (name !== undefined) set.name = name.trim();
            if (isQuickReply !== undefined) set.isQuickReply = !!isQuickReply;
            if (triggerType !== undefined) set.triggerType = triggerType;
            if (triggerValue !== undefined) set.triggerValue = triggerValue;
            if (active !== undefined) set.active = !!active;

            await set.save();
            res.json(set);
        } catch (err) {
            if (err.name === 'SequelizeValidationError') {
                return res.status(400).json({ error: err.errors?.[0]?.message || err.message });
            }
            res.status(500).json({ error: err.message });
        }
    }
);

/**
 * DELETE /api/admin/buttons/:setId
 * Delete a button set.
 */
router.delete(
    "/buttons/:setId",
    authenticate,
    authorize(['OWNER']),
    limiters.adminActions,
    async (req, res) => {
        try {
            const set = await ButtonSet.findByPk(req.params.setId);
            if (!set) return res.status(404).json({ error: "Button set not found" });

            await set.destroy();
            res.json({ success: true, message: "Button set deleted" });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
);

// ============================================================
// VALIDATION HELPERS
// ============================================================

const VALID_TYPES = ['SEND_MESSAGE', 'GO_TO_BLOCK', 'OPEN_URL', 'PHONE_CALL', 'POSTBACK'];
const UNSAFE_PROTOCOLS = ['javascript:', 'data:', 'vbscript:', 'ftp:'];

function validateButtons(buttons) {
    for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i];

        // Label validation
        if (!btn.label || typeof btn.label !== 'string' || !btn.label.trim()) {
            return { valid: false, error: `Button ${i + 1}: label is required` };
        }
        if (btn.label.trim().length > 20) {
            return { valid: false, error: `Button ${i + 1}: label exceeds 20 characters (${btn.label.trim().length})` };
        }

        // Type validation
        if (!VALID_TYPES.includes(btn.type)) {
            return { valid: false, error: `Button ${i + 1}: invalid type "${btn.type}". Must be: ${VALID_TYPES.join(', ')}` };
        }

        // URL safety validation
        if (btn.type === 'OPEN_URL' && btn.payload) {
            try {
                const url = new URL(btn.payload);
                if (UNSAFE_PROTOCOLS.includes(url.protocol)) {
                    return { valid: false, error: `Button ${i + 1}: unsafe URL protocol "${url.protocol}"` };
                }
                if (!['http:', 'https:'].includes(url.protocol)) {
                    return { valid: false, error: `Button ${i + 1}: only http/https URLs allowed` };
                }
            } catch {
                return { valid: false, error: `Button ${i + 1}: invalid URL "${btn.payload}"` };
            }
        }

        // Phone validation
        if (btn.type === 'PHONE_CALL' && btn.payload) {
            const clean = btn.payload.replace(/[\s\-\(\)]/g, '');
            if (!/^\+?\d{7,15}$/.test(clean)) {
                return { valid: false, error: `Button ${i + 1}: invalid phone number "${btn.payload}"` };
            }
        }

        // Postback payload length
        if (btn.type === 'POSTBACK' && btn.payload && btn.payload.length > 256) {
            return { valid: false, error: `Button ${i + 1}: postback payload exceeds 256 characters` };
        }
    }

    return { valid: true };
}

module.exports = router;
