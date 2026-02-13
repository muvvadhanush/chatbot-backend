const { Op } = require('sequelize');
const Connection = require('../models/Connection');
const ConnectionKnowledge = require('../models/ConnectionKnowledge');
const PendingExtraction = require('../models/PendingExtraction');
const ConnectionCrawlSession = require('../models/ConnectionCrawlSession');
const ConnectionDiscovery = require('../models/ConnectionDiscovery');
const PageContent = require('../models/PageContent');
const ConnectionBrandProfile = require('../models/ConnectionBrandProfile');
const BehaviorConfig = require('../models/BehaviorConfig');
const KnowledgeCoverage = require('../models/KnowledgeCoverage');
const KnowledgeCategory = require('../models/KnowledgeCategory');
const BehaviorMetrics = require('../models/BehaviorMetrics');
const BehaviorSuggestion = require('../models/BehaviorSuggestion');
const BrandDriftLog = require('../models/BrandDriftLog');
const ConfidencePolicy = require('../models/ConfidencePolicy');

const KEEP_IDS = [
    'cb_portal_v1',
    'conn_mlkgoqgx',
    'conn_mlkg9v2y'
];

async function cleanup() {
    try {
        console.log('--- Starting Connection Cleanup ---');

        // 1. Find connections to delete
        const toDelete = await Connection.findAll({
            where: {
                connectionId: {
                    [Op.notIn]: KEEP_IDS
                }
            },
            attributes: ['connectionId']
        });

        const deleteIds = toDelete.map(c => c.connectionId);
        console.log(`Found ${deleteIds.length} connections to delete.`);

        if (deleteIds.length === 0) {
            console.log('No connections to delete. Exiting.');
            return;
        }

        // 2. Delete related records for these IDs
        const models = [
            { name: 'ConnectionKnowledge', model: ConnectionKnowledge },
            { name: 'PendingExtraction', model: PendingExtraction },
            { name: 'ConnectionCrawlSession', model: ConnectionCrawlSession },
            { name: 'ConnectionDiscovery', model: ConnectionDiscovery },
            { name: 'PageContent', model: PageContent },
            { name: 'ConnectionBrandProfile', model: ConnectionBrandProfile },
            { name: 'BehaviorConfig', model: BehaviorConfig },
            { name: 'KnowledgeCoverage', model: KnowledgeCoverage },
            { name: 'KnowledgeCategory', model: KnowledgeCategory },
            { name: 'BehaviorMetrics', model: BehaviorMetrics },
            { name: 'BehaviorSuggestion', model: BehaviorSuggestion },
            { name: 'BrandDriftLog', model: BrandDriftLog },
            { name: 'ConfidencePolicy', model: ConfidencePolicy }
        ];

        for (const m of models) {
            const count = await m.model.destroy({
                where: { connectionId: { [Op.in]: deleteIds } }
            });
            console.log(`Deleted ${count} records from ${m.name}`);
        }

        // 3. Delete from Connections
        const connCount = await Connection.destroy({
            where: { connectionId: { [Op.in]: deleteIds } }
        });
        console.log(`Successfully deleted ${connCount} connections.`);

        console.log('--- Cleanup Complete ---');
        process.exit(0);

    } catch (error) {
        console.error('--- Cleanup Failed ---');
        console.error(error);
        process.exit(1);
    }
}

cleanup();
