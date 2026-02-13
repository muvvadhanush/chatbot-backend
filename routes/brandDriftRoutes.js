const express = require('express');
const router = express.Router();
const { checkBrandDrift, confirmDrift, ignoreDrift } = require('../services/brand/brandDriftService');
const { detectBrandProfile } = require('../services/brand/brandDetectionService');
const BrandDriftLog = require('../models/BrandDriftLog');
const ConnectionBrandProfile = require('../models/ConnectionBrandProfile');

/**
 * POST /:id/check-brand-drift
 * Triggers brand drift detection
 */
router.post('/:id/check-brand-drift', async (req, res) => {
    try {
        const result = await checkBrandDrift(req.params.id);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[BRAND-DRIFT] Check error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /:id/brand-drift
 * Returns drift logs and current status
 */
router.get('/:id/brand-drift', async (req, res) => {
    try {
        const { id } = req.params;

        const logs = await BrandDriftLog.findAll({
            where: { connectionId: id },
            order: [['createdAt', 'DESC']],
            limit: 10
        });

        const profile = await ConnectionBrandProfile.findOne({ where: { connectionId: id } });

        const pendingDrift = logs.find(l => l.status === 'PENDING');

        res.json({
            success: true,
            hasPendingDrift: !!pendingDrift,
            latestDrift: pendingDrift ? {
                id: pendingDrift.id,
                driftScore: pendingDrift.driftScore,
                severity: pendingDrift.severity,
                driftDetails: pendingDrift.driftDetails,
                createdAt: pendingDrift.createdAt
            } : null,
            lastAnalysis: profile ? profile.detectedAt : null,
            profileHash: profile ? profile.profileHash : null,
            logs: logs.map(l => ({
                id: l.id,
                driftScore: l.driftScore,
                severity: l.severity,
                status: l.status,
                createdAt: l.createdAt
            }))
        });
    } catch (err) {
        console.error('[BRAND-DRIFT] Fetch error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /:id/reanalyze-brand
 * Re-runs brand detection and clears pending drift
 */
router.post('/:id/reanalyze-brand', async (req, res) => {
    try {
        const { id } = req.params;

        // Clear pending drift logs
        await BrandDriftLog.update(
            { status: 'CONFIRMED' },
            { where: { connectionId: id, status: 'PENDING' } }
        );

        // Re-run brand detection
        const result = await detectBrandProfile(id, 'MANUAL');

        res.json({
            success: true,
            message: 'Brand re-analysis complete',
            profile: result.profile,
            behavior: result.behavior
        });
    } catch (err) {
        console.error('[BRAND-DRIFT] Re-analyze error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /:id/brand-drift/:driftId/ignore
 * Admin ignores a drift event
 */
router.post('/:id/brand-drift/:driftId/ignore', async (req, res) => {
    try {
        const result = await ignoreDrift(req.params.driftId);
        res.json({ success: true, status: result.status });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
