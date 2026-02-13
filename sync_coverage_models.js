require('dotenv').config({ path: './.env' });
const db = require('./config/db');
const KnowledgeCoverage = require('./models/KnowledgeCoverage');
const KnowledgeCategory = require('./models/KnowledgeCategory');
const PageContent = require('./models/PageContent');

async function sync() {
    try {
        await db.authenticate();
        console.log("✅ DB Connected");

        // Sync new models
        await KnowledgeCoverage.sync({ alter: true });
        console.log("✅ KnowledgeCoverage synced");

        await KnowledgeCategory.sync({ alter: true });
        console.log("✅ KnowledgeCategory synced");

        // Alter PageContent to add new columns
        await PageContent.sync({ alter: true });
        console.log("✅ PageContent altered (category, importanceScore)");

        console.log("🎉 Phase 4 schema sync complete!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Sync failed:", err.message);
        if (err.original) console.error("Original:", err.original.message);
        process.exit(1);
    }
}

sync();
