const Connection = require('./models/Connection');
const PageContent = require('./models/PageContent');
const PendingExtraction = require('./models/PendingExtraction');
const sequelize = require('./config/db');

// Define Associations for Test Context
PageContent.hasMany(PendingExtraction, { foreignKey: 'pageContentId', sourceKey: 'id' });
PendingExtraction.belongsTo(PageContent, { foreignKey: 'pageContentId', targetKey: 'id' });

async function testModels() {
    try {
        await sequelize.authenticate();
        console.log("DB Connected");

        const connId = 'test_integrity_' + Date.now();
        await Connection.create({
            connectionId: connId,
            websiteUrl: 'https://integrity.test'
        });

        console.log("Testing PageContent Create...");
        const pc = await PageContent.create({
            connectionId: connId,
            url: 'https://integrity.test/page1',
            status: 'FETCHED',
            cleanText: 'Integrity Test Content'
        });
        console.log("PageContent Created:", pc.id);

        console.log("Testing PendingExtraction Create...");
        const pe = await PendingExtraction.create({
            connectionId: connId,
            sourceType: 'AUTO',
            contentType: 'PAGE',
            pageContentId: pc.id,
            extractorType: 'KNOWLEDGE',
            rawData: { test: true },
            status: 'PENDING'
        });
        console.log("PendingExtraction Created:", pe.id);
        console.log("Associated PageContentId:", pe.pageContentId);

        // Verify Association
        const pcRef = await PageContent.findByPk(pc.id, {
            include: [PendingExtraction]
        });
        console.log("PageContent Includes PendingExtraction:", pcRef.PendingExtractions.length > 0);

        console.log("✅ Model Integrity Verified");
    } catch (e) {
        console.error("❌ Model Integrity Failed:", e);
        const fs = require('fs');
        fs.writeFileSync('integrity_error.log', JSON.stringify(e, Object.getOwnPropertyNames(e), 2));
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

testModels();
