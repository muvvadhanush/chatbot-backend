const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const sequelize = require('../config/db');

// Import models from index to get all entities and associations
const {
    Connection,
    ConnectionKnowledge,
    ChatSession,
    MissedQuestion,
    PendingExtraction,
    ConfidencePolicy,
    ConnectionDiscovery,
    ConnectionCrawlSession,
    ManualUpload,
    PageContent,
    User,
    ButtonSet
} = require('../models');

async function runSync() {
    try {
        console.log('Authenticating...');
        await sequelize.authenticate();
        console.log('Connected.');

        console.log('Syncing Database...');
        // Use alter: true to update tables if they exist but mismatch, or create if missing.
        // This is safer than force: true (drops data) and stronger than just sync()
        await sequelize.sync({ alter: true });
        console.log('Database synced successfully.');

        // Verify table creation
        const [results] = await sequelize.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = 'ConnectionKnowledges'
        `);

        if (results.length > 0) {
            console.log('SUCCESS: Table "ConnectionKnowledges" exists.');
        } else {
            console.error('FAILURE: Table "ConnectionKnowledges" still NOT found.');
        }

    } catch (error) {
        console.error('Sync failed:', error);
    } finally {
        await sequelize.close();
    }
}

runSync();
