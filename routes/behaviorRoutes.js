const express = require('express');
const router = express.Router();
const { collectMetrics, detectDrift, applySuggestion, rejectSuggestion } = require('../services/behavior/behaviorRefinementService');
const BehaviorMetrics = require('../models/BehaviorMetrics');
const BehaviorSuggestion = require('../models/BehaviorSuggestion');

/**
 * GET /:id/behavior-metrics
 * Recalculates and returns aggregated behavior metrics
 */
router.get('/:id/behavior-metrics', async (req, res) => {
    try {
        const { id } = req.params;

        // Recalculate fresh metrics
        const metrics = await collectMetrics(id);

        // Also detect drift and generate suggestions
        const suggestions = await detectDrift(id);

        res.json({
            success: true,
            metrics,
            newSuggestions: suggestions.length
        });
    } catch (err) {
        console.error('[BEHAVIOR] Metrics error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /:id/behavior-suggestions
 * Returns all suggestions for a connection
 */
router.get('/:id/behavior-suggestions', async (req, res) => {
    try {
        const { id } = req.params;
        const suggestions = await BehaviorSuggestion.findAll({
            where: { connectionId: id },
            order: [['createdAt', 'DESC']]
        });

        res.json({
            success: true,
            suggestions: suggestions.map(s => ({
                id: s.id,
                field: s.suggestedField,
                currentValue: s.currentValue,
                recommendedValue: s.recommendedValue,
                reason: s.reason,
                confidence: s.confidence,
                status: s.status,
                createdAt: s.createdAt
            }))
        });
    } catch (err) {
        console.error('[BEHAVIOR] Suggestions fetch error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /:id/behavior-suggestions/:suggestionId/accept
 * Admin accepts a suggestion → BehaviorConfig is updated
 */
router.post('/:id/behavior-suggestions/:suggestionId/accept', async (req, res) => {
    try {
        const result = await applySuggestion(req.params.suggestionId);
        res.json({ success: true, applied: result });
    } catch (err) {
        console.error('[BEHAVIOR] Accept error:', err);
        res.status(400).json({ error: err.message });
    }
});

/**
 * POST /:id/behavior-suggestions/:suggestionId/reject
 * Admin rejects a suggestion
 */
router.post('/:id/behavior-suggestions/:suggestionId/reject', async (req, res) => {
    try {
        const result = await rejectSuggestion(req.params.suggestionId);
        res.json({ success: true, rejected: result });
    } catch (err) {
        console.error('[BEHAVIOR] Reject error:', err);
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
