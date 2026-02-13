const sequelize = require('../config/db');
const ConnectionBrandProfile = require('../models/ConnectionBrandProfile');
const BehaviorConfig = require('../models/BehaviorConfig');

async function syncBrandModels() {
    try {
        await sequelize.authenticate();
        console.log("✅ Database Connected");

        // Sync models
        await ConnectionBrandProfile.sync({ alter: true });
        console.log("✅ ConnectionBrandProfile Synced");

        await BehaviorConfig.sync({ alter: true });
        console.log("✅ BehaviorConfig Synced");

        console.log("🎉 Brand Detection Models Synced Successfully");
        process.exit(0);
    } catch (error) {
        console.error("❌ Sync Failed:", error);
        process.exit(1);
    }
}

syncBrandModels();
