const sequelize = require('../config/db');
const ConnectionCrawlSession = require('../models/ConnectionCrawlSession');
const ConnectionDiscovery = require('../models/ConnectionDiscovery');

async function sync() {
    try {
        await sequelize.authenticate();
        console.log("DB Connected");

        console.log("Syncing ConnectionCrawlSession...");
        await ConnectionCrawlSession.sync({ alter: true });

        console.log("Syncing ConnectionDiscovery...");
        await ConnectionDiscovery.sync({ alter: true });

        console.log("✅ Models Synced");
    } catch (e) {
        console.error("Sync Failed:", e);
    } finally {
        await sequelize.close();
    }
}

sync();
