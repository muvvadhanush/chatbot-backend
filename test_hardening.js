const { runDiscovery } = require('./services/discovery/discoveryService');
const Connection = require('./models/Connection');
const ConnectionDiscovery = require('./models/ConnectionDiscovery');
const ConnectionCrawlSession = require('./models/ConnectionCrawlSession');
const sequelize = require('./config/db');

async function test() {
    try {
        await sequelize.authenticate();
        console.log("DB Connected");

        let conn = await Connection.findOne();
        if (!conn) {
            console.log("Creating dummy connection for test...");
            conn = await Connection.create({
                connectionId: 'test_conn_' + Date.now(),
                websiteUrl: 'https://example.com'
            });
        } else {
            // Ensure it has a URL
            if (!conn.websiteUrl) {
                await conn.update({ websiteUrl: 'https://example.com' });
            }
        }

        console.log(`Testing discovery for ${conn.websiteUrl} (${conn.connectionId})`);

        // Run 1
        console.log("--- RUN 1 ---");
        const res1 = await runDiscovery(conn);
        console.log("Result 1:", res1);

        // Verify DB
        const count1 = await ConnectionDiscovery.count({ where: { connectionId: conn.connectionId } });
        console.log(`DB Count after Run 1: ${count1}`);

        // Run 2 (Should not duplicate)
        console.log("--- RUN 2 (Duplicate Check) ---");
        const res2 = await runDiscovery(conn);
        console.log("Result 2:", res2);

        const count2 = await ConnectionDiscovery.count({ where: { connectionId: conn.connectionId } });
        console.log(`DB Count after Run 2: ${count2}`);

        if (count1 === count2) {
            console.log("✅ Duplicate Check Passed (Counts match)");
        } else {
            console.error("❌ Duplicate Check Failed (Counts differ)");
        }

        // Check Session
        const session = await ConnectionCrawlSession.findOne({
            where: { connectionId: conn.connectionId },
            order: [['createdAt', 'DESC']]
        });
        console.log("Latest Session Status:", session.status);
        console.log("Latest Session Counts:", session.totalUrls, "Found,", session.validUrls, "Valid");

    } catch (e) {
        console.error("Test Failed:", e);
    } finally {
        await sequelize.close();
    }
}

test();
