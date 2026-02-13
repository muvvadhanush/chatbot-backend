const { fetchSitemap } = require('./sitemapService');
const { fetchRobotsSitemap } = require('./robotsService');
const { crawlWebsite } = require('./crawlerService');
const { isValidUrl, normalizeUrl } = require('./urlFilterService');
const ConnectionCrawlSession = require('../../models/ConnectionCrawlSession');
const ConnectionDiscovery = require('../../models/ConnectionDiscovery');
const { v4: uuidv4 } = require('uuid');

async function runDiscovery(connection, requestId = uuidv4()) {
    const baseUrl = connection.websiteUrl;
    let baseDomain;
    try {
        baseDomain = new URL(baseUrl).hostname;
    } catch (e) {
        throw new Error(`Invalid Base URL: ${baseUrl}`);
    }

    const log = (msg) => console.log(`[DISCOVERY] [${requestId}] ${msg}`);
    log(`Started for connection ${connection.connectionId} (${baseUrl})`);

    // 1. Create Session
    let session;
    try {
        session = await ConnectionCrawlSession.create({
            connectionId: connection.connectionId,
            method: "SITEMAP",
            status: "RUNNING"
        });
        log(`Created crawl session: ${session.id}`);
    } catch (e) {
        console.error(`[DISCOVERY] [${requestId}] Session creation failed: ${e.message}`);
        throw e;
    }

    try {
        // 2. Strategy Execution
        log(`Executing strategy: SITEMAP`);
        let urls = await fetchSitemap(baseUrl);
        let method = 'SITEMAP';

        if (!urls || urls.length === 0) {
            log(`Checking robots.txt strategy...`);
            const robotsSitemap = await fetchRobotsSitemap(baseUrl);
            if (robotsSitemap) {
                log(`Found sitemap via robots: ${robotsSitemap}`);
                urls = await fetchSitemap(robotsSitemap);
                method = 'ROBOTS';
            }
        }

        if (!urls || urls.length === 0) {
            log(`Fallback strategy: CRAWLER`);
            method = 'CRAWLER';
            const crawlResults = await crawlWebsite(baseUrl, baseDomain);
            urls = crawlResults.map(r => r.url);
        }

        if (!urls) urls = [];
        log(`Discovered ${urls.length} raw URLs using ${method}`);

        // 3. Normalize & Filter
        const uniqueUrls = new Set();
        const validUrls = [];

        for (const rawUrl of urls) {
            const normalized = normalizeUrl(rawUrl);
            if (uniqueUrls.has(normalized)) continue;
            uniqueUrls.add(normalized);

            if (isValidUrl(normalized, baseDomain)) {
                validUrls.push(normalized);
            }
        }

        const filteredCount = uniqueUrls.size - validUrls.length;
        log(`Valid URLs: ${validUrls.length} | Filtered: ${filteredCount}`);

        // 4. DB Persistence
        if (validUrls.length > 0) {
            log(`Persisting ${validUrls.length} discovery records...`);
            const records = validUrls.map(u => ({
                connectionId: connection.connectionId,
                sourceType: method === 'ROBOTS' ? 'SITEMAP' : method,
                discoveredUrl: u,
                status: 'DISCOVERED'
            }));

            try {
                await ConnectionDiscovery.bulkCreate(records, { ignoreDuplicates: true });
                log(`Bulk persistence complete.`);
            } catch (dbErr) {
                console.error(`[DISCOVERY] [${requestId}] DB Persistence error: ${dbErr.message}`);
                throw new Error(`Database error during discovery: ${dbErr.message}`);
            }
        }

        // 5. Update Session
        log(`Finalizing session status...`);
        await session.update({
            method: method === 'ROBOTS' ? 'SITEMAP' : method,
            totalUrls: uniqueUrls.size,
            validUrls: validUrls.length,
            filteredUrls: filteredCount,
            status: 'COMPLETED'
        });

        log(`Discovery finished successfully.`);

        return {
            total: uniqueUrls.size,
            valid: validUrls.length,
            method
        };

    } catch (error) {
        console.error(`[DISCOVERY] [${requestId}] Process failed: ${error.message}`);
        if (session) await session.update({ status: 'FAILED' }).catch(() => { });
        throw error;
    }
}

module.exports = { runDiscovery };
