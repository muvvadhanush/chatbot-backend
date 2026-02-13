const { runDiscovery } = require('./services/discovery/discoveryService');
const Connection = require('./models/Connection');
const sequelize = require('./config/db');

async function test() {
    try {
        await sequelize.authenticate();
        console.log("DB Connected");

        // Find a connection to test
        // If none, we can't test fully connected logic, but we can verify imports work.
        const conn = await Connection.findOne();

        if (!conn) {
            console.log("No connections found in DB to test.");
            // Create a dummy one?
            // Connection.create({...})
            // For now, just exit if empty.
            return;
        }

        console.log(`Testing discovery for ${conn.websiteUrl}`);

        try {
            const result = await runDiscovery(conn);
            console.log("Discovery Result:", result);
        } catch (e) {
            console.error("Discovery Failed:", e);
        }

    } catch (e) {
        console.error("Test Setup Failed:", e);
    } finally {
        await sequelize.close();
    }
}

test();
