'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        // 1. Create BehaviorDocuments table
        await queryInterface.createTable('BehaviorDocuments', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true,
                allowNull: false
            },
            connectionId: {
                type: Sequelize.STRING,
                allowNull: false
            },
            fileName: {
                type: Sequelize.STRING,
                allowNull: false
            },
            fileType: {
                type: Sequelize.ENUM('PDF', 'DOCX', 'TEXT'),
                allowNull: false
            },
            fileSize: {
                type: Sequelize.INTEGER,
                allowNull: false
            },
            extractedText: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            classification: {
                type: Sequelize.ENUM('SALES_GUIDE', 'SUPPORT_SCRIPT', 'BRAND_GUIDELINES', 'COMPLIANCE_POLICY', 'UNKNOWN'),
                defaultValue: 'UNKNOWN'
            },
            classificationConfidence: {
                type: Sequelize.FLOAT,
                defaultValue: 0.0
            },
            signals: {
                type: Sequelize.JSONB,
                defaultValue: {}
            },
            processingStatus: {
                type: Sequelize.ENUM('PENDING', 'PROCESSING', 'DONE', 'FAILED'),
                defaultValue: 'PENDING'
            },
            errorMessage: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            createdAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW
            },
            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW
            }
        });

        await queryInterface.addIndex('BehaviorDocuments', ['connectionId']);
        await queryInterface.addIndex('BehaviorDocuments', ['processingStatus']);

        // 2. Create BehaviorSuggestions table
        await queryInterface.createTable('BehaviorSuggestions', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true,
                allowNull: false
            },
            connectionId: {
                type: Sequelize.STRING,
                allowNull: false
            },
            documentId: {
                type: Sequelize.UUID,
                allowNull: false
            },
            suggestedTone: {
                type: Sequelize.STRING,
                allowNull: true
            },
            suggestedSalesIntensity: {
                type: Sequelize.STRING,
                allowNull: true
            },
            suggestedResponseLength: {
                type: Sequelize.STRING,
                allowNull: true
            },
            suggestedEmpathyLevel: {
                type: Sequelize.STRING,
                allowNull: true
            },
            suggestedComplianceStrictness: {
                type: Sequelize.STRING,
                allowNull: true
            },
            reasoning: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            confidenceScore: {
                type: Sequelize.FLOAT,
                defaultValue: 0.0
            },
            diff: {
                type: Sequelize.JSONB,
                defaultValue: {}
            },
            status: {
                type: Sequelize.ENUM('PENDING', 'ACCEPTED', 'REJECTED'),
                defaultValue: 'PENDING'
            },
            reviewedBy: {
                type: Sequelize.STRING,
                allowNull: true
            },
            reviewedAt: {
                type: Sequelize.DATE,
                allowNull: true
            },
            reviewNotes: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            createdAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW
            },
            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW
            }
        });

        await queryInterface.addIndex('BehaviorSuggestions', ['connectionId']);
        await queryInterface.addIndex('BehaviorSuggestions', ['documentId']);
        await queryInterface.addIndex('BehaviorSuggestions', ['status']);
    },

    async down(queryInterface) {
        await queryInterface.dropTable('BehaviorSuggestions');
        await queryInterface.dropTable('BehaviorDocuments');
    }
};
