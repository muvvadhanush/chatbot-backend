const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { runDiscovery } = require('../services/discovery/discoveryService');
const Connection = require('../models/Connection');
const ConnectionCrawlSession = require('../models/ConnectionCrawlSession');
const ConnectionDiscovery = require('../models/ConnectionDiscovery');
const { v4: uuidv4 } = require('uuid');

// 1. Trigger Discovery
// POST /api/v1/connections/:id/discovery
router.post('/:id/discovery', async (req, res) => {
    console.log(`[ROUTE] POST /api/v1/connections/${req.params.id}/discovery - HIT`);
    try {
        const requestId = req.requestId || uuidv4();
        const connection = await Connection.findOne({
            where: { connectionId: req.params.id }
        });

        if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
        }

        // Safety: Check for running sessions
        const running = await ConnectionCrawlSession.findOne({
            where: {
                connectionId: req.params.id,
                status: 'RUNNING'
            }
        });

        if (running) {
            // Check if stale > 1 hour? For now strict block.
            return res.status(409).json({ error: 'Discovery already in progress', sessionId: running.id });
        }

        // Rate Limit Check
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const count = await ConnectionCrawlSession.count({
            where: {
                connectionId: req.params.id,
                createdAt: {
                    [Op.gte]: today
                }
            }
        });

        if (count >= 5) {
            return res.status(429).json({ error: 'Daily discovery limit reached (5/day)' });
        }

        // Run Sync (as per request/phase 1 simplicity)
        // Ideally this is background job, but we await it for now.
        const result = await runDiscovery(connection, requestId);

        res.json({
            success: true,
            data: result
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Get Status (Latest Session)
// GET /api/v1/connections/:id/discovery/status
router.get('/:id/discovery/status', async (req, res) => {
    try {
        const session = await ConnectionCrawlSession.findOne({
            where: { connectionId: req.params.id },
            order: [['createdAt', 'DESC']]
        });

        if (!session) {
            return res.status(404).json({ error: 'No discovery sessions found' });
        }

        res.json(session);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Get Results
// GET /api/v1/connections/:id/discovery/results
router.get('/:id/discovery/results', async (req, res) => {
    try {
        const results = await ConnectionDiscovery.findAll({
            where: {
                connectionId: req.params.id,
                status: 'DISCOVERED' // or ALL? Prompt said "Get .../results". Usually valid ones.
            },
            limit: 100 // Safety limit
        });

        res.json({
            count: results.length,
            items: results
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Approve All & Extract (Sync for Phase 3)
// POST /api/v1/connections/:id/discovery/approve-all
router.post('/:id/discovery/approve-all', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[APPROVE-ALL] Starting for ${id}`);

        // 1. Get Discovered URLs
        const discovered = await ConnectionDiscovery.findAll({
            where: { connectionId: id, status: 'DISCOVERED' },
            limit: 10 // Analyze top 10 pages for brand detection
        });

        console.log(`[APPROVE-ALL] Found ${discovered.length} rows for ${id}`);

        if (discovered.length === 0) {
            console.warn(`[APPROVE-ALL] No DISCOVERED items found for ${id}`);
            return res.json({ success: true, count: 0, message: "No items to approve" });
        }

        // 2. Trigger Extraction (Immediate Scrape)
        const scraperService = require('../services/scraperService');
        const PageContent = require('../models/PageContent');
        const Connection = require('../models/Connection'); // For association check

        let extractedCount = 0;
        console.log(`[APPROVE-ALL] Processing ${discovered.length} items...`);

        // Parallel processing with limit?
        // Let's do sequential for safety/simplicity in this route or Promise.all
        const results = await Promise.all(discovered.map(async (item) => {
            try {
                console.log(`[APPROVE-ALL] Scraping: ${item.discoveredUrl}`);
                // Scrape
                const scrapeResult = await scraperService.scrapeWebsite(item.discoveredUrl);
                if (scrapeResult.success) {
                    const text = scrapeResult.rawText || '';
                    console.log(`[APPROVE-ALL] Scrape SUCCESS for ${item.discoveredUrl} (${text.length} chars)`);

                    // Save to PageContent (Upsert to avoid unique constraint issues)
                    const contentHash = require('crypto').createHash('sha256').update(text).digest('hex');
                    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

                    try {
                        await PageContent.upsert({
                            connectionId: id,
                            url: item.discoveredUrl,
                            status: 'FETCHED',
                            rawHtml: 'SKIPPED_FOR_DB_SIZE',
                            cleanText: text,
                            contentHash: contentHash,
                            wordCount: wordCount,
                            fetchedAt: new Date()
                        });

                        console.log(`[APPROVE-ALL] Persistence SUCCESS for ${item.discoveredUrl}`);

                        // Update Discovery Status
                        await item.update({ status: 'INDEXED' });
                        return 1;
                    } catch (dbErr) {
                        console.error(`[APPROVE-ALL] DB Error for ${item.discoveredUrl}:`, dbErr.message);
                        return 0;
                    }
                } else {
                    console.error(`[APPROVE-ALL] Scrape FAILED for ${item.discoveredUrl}: ${scrapeResult.error}`);
                    await item.update({ status: 'FAILED' });
                }
            } catch (e) {
                console.error(`[APPROVE-ALL] Critical Failure ${item.discoveredUrl}:`, e.message);
            }
            return 0;
        }));

        extractedCount = results.reduce((a, b) => a + b, 0);
        console.log(`[APPROVE-ALL] Extraction finished. Count: ${extractedCount}/${discovered.length}`);

        if (extractedCount === 0) {
            return res.status(400).json({
                success: false,
                error: "Could not scrape any pages. Please ensure URLs are public and accessible."
            });
        }

        // 3. Enable Extraction on Connection if not already
        const conn = await Connection.findOne({
            where: { connectionId: id }
        });
        if (conn && !conn.extractionEnabled) {
            await conn.update({ extractionEnabled: true });
        }

        res.json({
            success: true,
            count: extractedCount,
            message: `Approved and extracted ${extractedCount} pages`
        });

    } catch (err) {
        console.error("Approve All Error:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
