'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        try {
            // Add category and importanceScore to PageContents
            await queryInterface.addColumn('PageContents', 'category', {
                type: Sequelize.STRING(50),
                allowNull: true
            });
            await queryInterface.addColumn('PageContents', 'importanceScore', {
                type: Sequelize.FLOAT,
                defaultValue: 0.5
            });

            // Create KnowledgeCoverages table
            await queryInterface.createTable('KnowledgeCoverages', {
                connectionId: {
                    type: Sequelize.STRING,
                    primaryKey: true,
                    allowNull: false
                },
                totalDiscoveredPages: { type: Sequelize.INTEGER, defaultValue: 0 },
                approvedPages: { type: Sequelize.INTEGER, defaultValue: 0 },
                indexedPages: { type: Sequelize.INTEGER, defaultValue: 0 },
                coverageScore: { type: Sequelize.FLOAT, defaultValue: 0.0 },
                criticalCoverageScore: { type: Sequelize.FLOAT, defaultValue: 0.0 },
                riskLevel: {
                    type: Sequelize.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
                    defaultValue: 'HIGH'
                },
                lastCalculatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
                createdAt: { type: Sequelize.DATE, allowNull: false },
                updatedAt: { type: Sequelize.DATE, allowNull: false }
            });

            // Create KnowledgeCategories table
            await queryInterface.createTable('KnowledgeCategories', {
                id: {
                    type: Sequelize.UUID,
                    defaultValue: Sequelize.UUIDV4,
                    primaryKey: true
                },
                connectionId: { type: Sequelize.STRING, allowNull: false },
                category: {
                    type: Sequelize.ENUM(
                        'PRICING', 'SUPPORT', 'ABOUT', 'LEGAL',
                        'FAQ', 'BLOG', 'PRODUCT', 'OTHER'
                    ),
                    allowNull: false
                },
                pageCount: { type: Sequelize.INTEGER, defaultValue: 0 },
                confidence: { type: Sequelize.FLOAT, defaultValue: 0.0 },
                createdAt: { type: Sequelize.DATE, allowNull: false },
                updatedAt: { type: Sequelize.DATE, allowNull: false }
            });

            await queryInterface.addIndex('KnowledgeCategories', ['connectionId', 'category'], {
                unique: true,
                name: 'knowledge_categories_conn_cat_unique'
            });
        } catch (e) {
            console.log('Skipping 02_add_coverage_fields: ' + e.message);
        }
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('PageContents', 'category');
        await queryInterface.removeColumn('PageContents', 'importanceScore');
        await queryInterface.dropTable('KnowledgeCategories');
        await queryInterface.dropTable('KnowledgeCoverages');
    }
};
