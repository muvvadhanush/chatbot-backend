const sequelize = require('../config/db');
const PageContent = require('../models/PageContent');
const ManualUpload = require('../models/ManualUpload');
const PendingExtraction = require('../models/PendingExtraction');

async function sync() {
    try {
        await sequelize.authenticate();
        console.log("DB Connected");

        console.log("Syncing PageContent...");
        await PageContent.sync({ alter: true });

        console.log("Syncing ManualUpload...");
        await ManualUpload.sync({ alter: true });

        console.log("Syncing PendingExtraction...");
        await PendingExtraction.sync({ alter: true });

        console.log("✅ Extraction Models Synced");
    } catch (e) {
        console.error("Sync Failed:", e);
    } finally {
        await sequelize.close();
    }
}

sync();
