'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        /**
         * 1. DROP LEGACY TABLES
         * These tables were part of the previous version's experimental features (Ideas, Behavior Metrics, etc.)
         * and are no longer used by the current Neural Bot architecture.
         */
        const legacyTables = [
            'BehaviorConfigs',
            'BehaviorMetrics',
            'BehaviorSuggestions',
            'BrandDriftLogs',
            'ConnectionBrandProfiles',
            'KnowledgeCategories',
            'KnowledgeCoverages'
        ];

        for (const table of legacyTables) {
            console.log(`Dropping legacy table: ${table}`);
            await queryInterface.dropTable(table).catch(err => {
                console.warn(`Could not drop ${table} (may not exist): ${err.message}`);
            });
        }

        /**
         * 2. FORMALIZE NEW CORE TABLES
         * These tables are active in the current codebase but might be missing from the baseline migration.
         * We ensure they exist with the correct schema.
         */

        // PageContents
        await queryInterface.createTable('PageContents', {
            id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
            connectionId: { type: Sequelize.STRING, allowNull: false },
            url: { type: Sequelize.TEXT, allowNull: false },
            rawHtml: { type: Sequelize.TEXT, allowNull: true },
            cleanText: { type: Sequelize.TEXT, allowNull: true },
            contentHash: { type: Sequelize.STRING(64), allowNull: true },
            wordCount: { type: Sequelize.INTEGER, defaultValue: 0 },
            status: { type: Sequelize.ENUM('FETCHED', 'FAILED', 'STALE'), defaultValue: 'FETCHED' },
            category: { type: Sequelize.STRING(50), allowNull: true },
            importanceScore: { type: Sequelize.FLOAT, defaultValue: 0.5 },
            fetchedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
            createdAt: { allowNull: false, type: Sequelize.DATE },
            updatedAt: { allowNull: false, type: Sequelize.DATE }
        }).catch(() => { });

        // ManualUploads
        await queryInterface.createTable('ManualUploads', {
            id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
            connectionId: { type: Sequelize.STRING, allowNull: false },
            filename: { type: Sequelize.STRING, allowNull: false },
            fileType: { type: Sequelize.STRING, allowNull: false },
            storagePath: { type: Sequelize.STRING, allowNull: false },
            fileSize: { type: Sequelize.INTEGER, allowNull: true },
            status: { type: Sequelize.ENUM('PENDING', 'PROCESSED', 'FAILED'), defaultValue: 'PENDING' },
            createdAt: { allowNull: false, type: Sequelize.DATE },
            updatedAt: { allowNull: false, type: Sequelize.DATE }
        }).catch(() => { });

        // ConnectionDiscoveries
        await queryInterface.createTable('ConnectionDiscoveries', {
            id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
            connectionId: { type: Sequelize.STRING, allowNull: false },
            discoveredUrl: { type: Sequelize.STRING, allowNull: false },
            sourceType: { type: Sequelize.ENUM('SITEMAP', 'CRAWLER', 'MANUAL'), defaultValue: 'SITEMAP' },
            status: { type: Sequelize.ENUM('DISCOVERED', 'PROCESSING', 'EXTRACTED', 'IGNORED'), defaultValue: 'DISCOVERED' },
            metadata: { type: Sequelize.JSON, allowNull: true },
            createdAt: { allowNull: false, type: Sequelize.DATE },
            updatedAt: { allowNull: false, type: Sequelize.DATE }
        }).catch(() => { });

        // ConnectionCrawlSessions
        await queryInterface.createTable('ConnectionCrawlSessions', {
            id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
            connectionId: { type: Sequelize.STRING, allowNull: false },
            startTime: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
            endTime: { type: Sequelize.DATE, allowNull: true },
            status: { type: Sequelize.ENUM('RUNNING', 'COMPLETED', 'FAILED'), defaultValue: 'RUNNING' },
            method: { type: Sequelize.ENUM('SITEMAP', 'CRAWLER'), defaultValue: 'SITEMAP' },
            totalUrls: { type: Sequelize.INTEGER, defaultValue: 0 },
            validUrls: { type: Sequelize.INTEGER, defaultValue: 0 },
            filteredUrls: { type: Sequelize.INTEGER, defaultValue: 0 },
            errorLog: { type: Sequelize.TEXT, allowNull: true },
            createdAt: { allowNull: false, type: Sequelize.DATE },
            updatedAt: { allowNull: false, type: Sequelize.DATE }
        }).catch(() => { });

        // ConfidencePolicies
        await queryInterface.createTable('ConfidencePolicies', {
            id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
            connectionId: { type: Sequelize.STRING, allowNull: false, unique: true },
            minAnswerConfidence: { type: Sequelize.FLOAT, defaultValue: 0.7 },
            minSourceCount: { type: Sequelize.INTEGER, defaultValue: 1 },
            lowConfidenceAction: { type: Sequelize.ENUM('REFUSE', 'CLARIFY', 'ESCALATE', 'SOFT_ANSWER'), defaultValue: 'SOFT_ANSWER' },
            autoEscalateToHuman: { type: Sequelize.BOOLEAN, defaultValue: false },
            createdAt: { allowNull: false, type: Sequelize.DATE },
            updatedAt: { allowNull: false, type: Sequelize.DATE }
        }).catch(() => { });
    },

    async down(queryInterface, Sequelize) {
        // Migration is mostly destructive on up, so down is not fully reversible without a backup.
    }
};
