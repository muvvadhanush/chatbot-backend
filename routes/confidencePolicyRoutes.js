const express = require('express');
const router = express.Router();
const ConfidencePolicy = require('../models/ConfidencePolicy');

/**
 * GET /:id/confidence-policy
 * Returns current policy or defaults
 */
router.get('/:id/confidence-policy', async (req, res) => {
    try {
        let policy = await ConfidencePolicy.findOne({
            where: { connectionId: req.params.id }
        });
        if (!policy) {
            // Return defaults without creating
            policy = {
                connectionId: req.params.id,
                minAnswerConfidence: 0.65,
                minSourceCount: 1,
                lowConfidenceAction: 'SOFT_ANSWER'
            };
        }
        res.json({ success: true, policy });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /:id/confidence-policy
 * Creates or updates policy
 */
router.put('/:id/confidence-policy', async (req, res) => {
    try {
        const { minAnswerConfidence, minSourceCount, lowConfidenceAction } = req.body;

        const [policy] = await ConfidencePolicy.upsert({
            connectionId: req.params.id,
            minAnswerConfidence: minAnswerConfidence !== undefined ? minAnswerConfidence : 0.65,
            minSourceCount: minSourceCount !== undefined ? minSourceCount : 1,
            lowConfidenceAction: lowConfidenceAction || 'SOFT_ANSWER'
        }, { returning: true });

        res.json({ success: true, policy });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
