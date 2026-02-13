const axios = require('axios');
const fs = require('fs');
const Connection = require('./models/Connection');
const ConnectionDiscovery = require('./models/ConnectionDiscovery');
const PageContent = require('./models/PageContent');
const PendingExtraction = require('./models/PendingExtraction');
const sequelize = require('./config/db');

// Define Associations for Test Context
PageContent.hasMany(PendingExtraction, { foreignKey: 'pageContentId', sourceKey: 'id' });
PendingExtraction.belongsTo(PageContent, { foreignKey: 'pageContentId', targetKey: 'id' });
Connection.hasMany(ConnectionDiscovery, { foreignKey: 'connectionId', sourceKey: 'connectionId' });
ConnectionDiscovery.belongsTo(Connection, { foreignKey: 'connectionId', targetKey: 'connectionId' });
const { extractFromDiscovery } = require('./services/extraction/extractionService');

async function unitTest() {
    try {
        await sequelize.authenticate();
        const logStream = fs.createWriteStream('extraction_test.log', { flags: 'w' });
        const originalLog = console.log;
        const originalError = console.error;
        console.log = function (...args) {
            logStream.write(args.join(' ') + '\n');
            originalLog.apply(console, args);
        };
        console.error = function (...args) {
            logStream.write('[ERROR] ' + args.join(' ') + '\n');
            originalError.apply(console, args);
        };

        console.log("DB Connected");

        let conn = await Connection.findOne({ where: { connectionId: 'test_extract_1' } });
        if (!conn) {
            console.log("Creating Connection...");
            conn = await Connection.create({
                connectionId: 'test_extract_1',
                websiteUrl: 'https://example.com'
            });
        }

        // CLEANUP
        console.log("Cleaning old data...");
        await ConnectionDiscovery.destroy({ where: { connectionId: conn.connectionId } });
        await PageContent.destroy({ where: { connectionId: conn.connectionId } });
        await PendingExtraction.destroy({ where: { connectionId: conn.connectionId } });

        // CREATE DISCOVERY
        console.log("Creating Discovery Records...");
        await ConnectionDiscovery.bulkCreate([
            { connectionId: conn.connectionId, discoveredUrl: 'https://example.com', status: 'DISCOVERED', sourceType: 'SITEMAP' },
            { connectionId: conn.connectionId, discoveredUrl: 'https://example.com/about', status: 'DISCOVERED', sourceType: 'SITEMAP' }
        ]);

        const count = await ConnectionDiscovery.count({ where: { connectionId: conn.connectionId } });
        console.log(`Discovery Records: ${count}`);

        // TEST MANUAL PAGE CONTENT
        console.log("Testing Manual PageContent Creation...");
        try {
            const pc = await PageContent.create({
                connectionId: conn.connectionId,
                url: 'https://manual-test.com',
                status: 'FETCHED',
                cleanText: 'Manual test content'
            });
            console.log("Manual PageContent Created ID:", pc.id);
        } catch (e) {
            console.error("❌ Manual PageContent Creation Failed:", e);
        }

        // RUN EXTRACTOR
        console.log("Running Extractor Service...");
        try {
            const result = await extractFromDiscovery(conn);
            console.log("Service Result:", result);
        } catch (e) {
            console.error("❌ Service Execution Failed:", e);
        }

        const pages = await PageContent.findAll({ where: { connectionId: conn.connectionId } });
        console.log(`Total PageContents: ${pages.length}`);

        pages.forEach(p => {
            console.log(`[PAGE] URL: ${p.url} | Status: ${p.status} | Words: ${p.wordCount} | Hash: ${p.contentHash}`);
        });

        if (pages.length > 0) {
            // Check for a FETCHED page if any
            const successPage = pages.find(p => p.status === 'FETCHED' && p.url !== 'https://manual-test.com');

            if (successPage) {
                console.log("Checking PendingExtraction for Page:", successPage.id);
                try {
                    const pending = await PendingExtraction.findOne({ where: { connectionId: conn.connectionId, pageContentId: successPage.id } });
                    console.log("Pending Extraction Created:", pending ? "YES" : "NO");
                    if (pending) console.log("SourceType:", pending.sourceType);
                } catch (e) {
                    console.error("❌ PendingExtraction Check Failed:", e);
                }
            } else {
                console.log("No successful auto-extracted pages to check (likely thin content or 404s). System behavior is CORRECT if 'example.com' is FAILED.");
            }
        }

    } catch (e) {
        console.error("❌ Test Failed:", e);
    } finally {
        await sequelize.close();
    }
}

unitTest();
