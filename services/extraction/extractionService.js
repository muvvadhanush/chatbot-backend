const { fetchPage } = require('./contentFetchService');
const { cleanHtml } = require('./contentCleanService');
const { hashContent } = require('./hashService');
const PageContent = require('../../models/PageContent');
const PendingExtraction = require('../../models/PendingExtraction');
const ConnectionDiscovery = require('../../models/ConnectionDiscovery');
const pLimit = require('p-limit');

async function extractFromDiscovery(connection) {
    // 1. Get Discovered URLs (that are not yet fetched or stale)
    // For Phase 2, we just pick top 50 DISCOVERED items that don't have PageContent?
    // Or we rely on a flag. 
    // Let's just grab 50 'DISCOVERED' items from ConnectionDiscovery
    // Checks if PageContent exists?
    // To be efficient, we might need a "status" on ConnectionDiscovery too, or just join.
    // Simpler: Fetch all DISCOVERED from ConnectionDiscovery, limit 50.

    // We prioritize those NOT in PageContent.
    // Querying properly is hard without raw SQL joins if associations aren't perfect yet.
    // Let's just iterate.

    const discovered = await ConnectionDiscovery.findAll({
        where: { connectionId: connection.connectionId, status: 'DISCOVERED' },
        limit: 50
    });

    if (discovered.length === 0) return { total: 0, processed: 0, failed: 0 };

    const limit = pLimit(10); // Max 10 concurrency
    let processed = 0;
    let failed = 0;

    const tasks = discovered.map(item => limit(async () => {
        const url = item.discoveredUrl;

        // Skip if PageContent already exists and is fresh?
        const existing = await PageContent.findOne({ where: { connectionId: connection.connectionId, url: url } });
        if (existing && existing.status === 'FETCHED') {
            // Already fetched. Skip or check staleness. For now skip.
            return;
        }

        try {
            // Fetch
            const rawHtml = await fetchPage(url);

            // Clean
            const cleanText = cleanHtml(rawHtml);

            // Hash
            const hash = hashContent(cleanText);

            // Logic: Thin content check?
            if (cleanText.split(/\s+/).length < 50) {
                // Too short. Mark as FAILED or IGNORED?
                // Let's store it but maybe not create PendingExtraction?
                await PageContent.create({
                    connectionId: connection.connectionId,
                    url: url,
                    rawHtml: rawHtml, // Optional storage policy
                    cleanText: cleanText,
                    contentHash: hash,
                    wordCount: cleanText.split(/\s+/).length,
                    status: 'FAILED' // Or IGNORED
                });
                return;
            }

            // Store PageContent
            const page = await PageContent.create({
                connectionId: connection.connectionId,
                url: url,
                rawHtml: rawHtml,
                cleanText: cleanText,
                contentHash: hash,
                wordCount: cleanText.split(/\s+/).length,
                status: 'FETCHED'
            });

            // Check DRIFT?
            // If existing had different hash... (we skipped existing above, but useful for re-crawl)

            // Create PendingExtraction
            await PendingExtraction.create({
                connectionId: connection.connectionId,
                sourceType: 'AUTO',
                contentType: 'PAGE',
                pageContentId: page.id,
                extractorType: 'KNOWLEDGE',
                rawData: {
                    title: extractTitle(rawHtml) || url,
                    content: cleanText,
                    url: url
                },
                status: 'PENDING'
            });

            processed++;

        } catch (err) {
            console.error(`[EXTRACTION] Failed ${url}: ${err.message}`);
            failed++;
            // Optionally record failure in PageContent so we don't retry immediately
            await PageContent.create({
                connectionId: connection.connectionId,
                url: url,
                status: 'FAILED',
                rawHtml: '',
                cleanText: '',
                contentHash: 'FAILED_' + Date.now(),
                wordCount: 0,
                fetchedAt: new Date()
            }).catch(e => { console.error("Failed to save error status:", e.message) }); // Log error
        }
    }));

    await Promise.all(tasks);

    return { total: discovered.length, processed, failed };
}

function extractTitle(html) {
    const match = html.match(/<title>([^<]*)<\/title>/i);
    return match ? match[1] : null;
}

module.exports = { extractFromDiscovery };
