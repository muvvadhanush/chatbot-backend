const express = require('express');
const router = express.Router();
const { detectBrandProfile } = require('../services/brand/brandDetectionService');
const ConnectionBrandProfile = require('../models/ConnectionBrandProfile');
const BehaviorConfig = require('../models/BehaviorConfig');

// 1. Trigger Brand Detection (Analysis)
// POST /api/v1/connections/:id/detect-brand
router.post('/:id/detect-brand', async (req, res) => {
    try {
        const { id } = req.params;
        // Optionally allow force re-detection?
        const result = await detectBrandProfile(id, 'MANUAL');

        res.json({
            success: true,
            message: "Brand analysis complete",
            profile: result.profile,
            recommendation: result.behavior
        });
    } catch (err) {
        console.error("[BRAND] Detection API Error:", err.message);
        if (err.message.includes('Insufficient content')) {
            return res.status(400).json({ error: "No content found for analysis. Please ensure pages are discovered and approved first." });
        }
        res.status(500).json({ error: err.message });
    }
});

// 2. Get Brand Profile & current Behavior Config
// GET /api/v1/connections/:id/brand-profile
router.get('/:id/brand-profile', async (req, res) => {
    try {
        const { id } = req.params;

        const profile = await ConnectionBrandProfile.findOne({ where: { connectionId: id } });
        const config = await BehaviorConfig.findOne({ where: { connectionId: id } });

        res.json({
            profile: profile || null,
            behaviorConfig: config || null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Update Behavior Config (Admin Override)
// PUT /api/v1/connections/:id/behavior-config
router.put('/:id/behavior-config', async (req, res) => {
    try {
        const { id } = req.params;
        const { role, tone, salesIntensity, responseLength } = req.body;

        const [config, created] = await BehaviorConfig.upsert({
            connectionId: id,
            role,
            tone,
            salesIntensity,
            responseLength,
            source: 'MANUAL', // Mark as manual override
            updatedAt: new Date()
        });

        res.json({
            success: true,
            config: config
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
