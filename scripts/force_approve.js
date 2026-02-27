const sequelize = require('../config/db');
const ConnectionDiscovery = require('../models/ConnectionDiscovery');
const PageContent = require('../models/PageContent');
const Connection = require('../models/Connection');
const scraperService = require('../services/scraperService');
const crypto = require('crypto');

async function forceApprove(connectionId) {
    console.log(`🚀 Forcing approval and scrape for: ${connectionId}`);

    try {
        // 1. Get Discovered URLs
        const discovered = await ConnectionDiscovery.findAll({
            where: { connectionId, status: 'DISCOVERED' }
        });

        console.log(`Found ${discovered.length} pages to process.`);

        for (const item of discovered) {
            console.log(`Scraping: ${item.discoveredUrl}`);
            const result = await scraperService.scrapeWebsite(item.discoveredUrl);

            if (result.success) {
                const text = result.rawText || '';
                console.log(`✅ Scrape success: ${text.length} chars`);

                // Upsert PageContent
                await PageContent.upsert({
                    connectionId,
                    url: item.discoveredUrl,
                    status: 'FETCHED',
                    rawHtml: 'SKIPPED_FOR_DB_SIZE',
                    cleanText: text,
                    contentHash: crypto.createHash('sha256').update(text).digest('hex'),
                    wordCount: text.split(/\s+/).filter(w => w.length > 0).length,
                    fetchedAt: new Date()
                });

                // Update Discovery
                await item.update({ status: 'INDEXED' });
                console.log(`✅ Persisted and indexed ${item.discoveredUrl}`);
            } else {
                console.error(`❌ Scrape failed for ${item.discoveredUrl}: ${result.error}`);
            }
        }

        // 2. Enable Extraction
        const conn = await Connection.findOne({ where: { connectionId } });
        if (conn) {
            await conn.update({ extractionEnabled: true });
            console.log(`✅ Extraction enabled for connection.`);
        }

        console.log(`✨ Force approve complete for ${connectionId}`);

    } catch (err) {
        console.error(`💥 Critical error:`, err.message);
    } finally {
        await sequelize.close();
    }
}

const targetId = process.argv[2];
if (!targetId) {
    console.error("Usage: node force_approve.js <connectionId>");
    process.exit(1);
}

forceApprove(targetId);
