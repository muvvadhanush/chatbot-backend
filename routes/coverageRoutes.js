const express = require('express');
const router = express.Router();
const { categorizePages, calculateCoverage, getLaunchReadiness } = require('../services/coverage/knowledgeCoverageService');

/**
 * POST /:id/recalculate-coverage
 * Triggers full categorization + coverage calculation
 */
router.post('/:id/recalculate-coverage', async (req, res) => {
    try {
        const { id } = req.params;

        // Step 1: Categorize uncategorized pages
        const catResult = await categorizePages(id);

        // Step 2: Calculate coverage scores
        const coverage = await calculateCoverage(id);

        // Step 3: Get readiness
        const readiness = await getLaunchReadiness(id);

        res.json({
            success: true,
            categorization: catResult,
            coverage,
            readiness
        });
    } catch (err) {
        console.error('[COVERAGE] Recalculation error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /:id/coverage
 * Returns current coverage snapshot + category breakdown + readiness
 */
router.get('/:id/coverage', async (req, res) => {
    try {
        const { id } = req.params;
        const KnowledgeCoverage = require('../models/KnowledgeCoverage');
        const KnowledgeCategory = require('../models/KnowledgeCategory');

        const coverage = await KnowledgeCoverage.findOne({ where: { connectionId: id } });
        const categories = await KnowledgeCategory.findAll({
            where: { connectionId: id },
            order: [['pageCount', 'DESC']]
        });

        const readiness = await getLaunchReadiness(id);

        res.json({
            success: true,
            coverage: coverage || {
                connectionId: id,
                totalDiscoveredPages: 0,
                approvedPages: 0,
                indexedPages: 0,
                coverageScore: 0,
                criticalCoverageScore: 0,
                riskLevel: 'HIGH'
            },
            categories: categories.map(c => ({
                category: c.category,
                pageCount: c.pageCount,
                confidence: c.confidence
            })),
            readiness
        });
    } catch (err) {
        console.error('[COVERAGE] Fetch error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
