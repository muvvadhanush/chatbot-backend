'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const safeAddColumn = async (table, column, typeDef) => {
            try {
                await queryInterface.addColumn(table, column, typeDef);
            } catch (e) {
                if (!e.message.includes('already exists')) {
                    throw e;
                }
            }
        };

        // Add all potentially missing fields from Connection.js
        await safeAddColumn('Connections', 'onboardingCompletedAt', {
            type: Sequelize.DATE,
            allowNull: true,
            comment: 'Timestamp when onboarding reached LAUNCHED'
        });

        await safeAddColumn('Connections', 'stateLockedBy', {
            type: Sequelize.STRING,
            allowNull: true
        });

        await safeAddColumn('Connections', 'stateLockedAt', {
            type: Sequelize.DATE,
            allowNull: true
        });

        await safeAddColumn('Connections', 'allowedDomains', {
            type: Sequelize.JSONB,
            defaultValue: []
        });

        await safeAddColumn('Connections', 'theme', {
            type: Sequelize.JSONB,
            defaultValue: {
                primary: "#4f46e5",
                background: "#ffffff",
                text: "#111111"
            }
        });

        await safeAddColumn('Connections', 'extractedTools', {
            type: Sequelize.JSONB,
            defaultValue: []
        });

        await safeAddColumn('Connections', 'welcomeMessage', {
            type: Sequelize.STRING,
            defaultValue: "Hi! How can I help you today?"
        });

        await safeAddColumn('Connections', 'capabilities', {
            type: Sequelize.JSONB,
            defaultValue: ["general"]
        });

        await safeAddColumn('Connections', 'actionConfig', {
            type: Sequelize.JSONB,
            defaultValue: { type: "SAVE", config: {} }
        });

        await safeAddColumn('Connections', 'permissions', {
            type: Sequelize.JSONB,
            defaultValue: {
                modes: ["FREE_CHAT"],
                actions: ["SAVE"],
                aiEnabled: true
            }
        });

        await safeAddColumn('Connections', 'behaviorProfile', {
            type: Sequelize.JSONB,
            defaultValue: {}
        });

        await safeAddColumn('Connections', 'behaviorOverrides', {
            type: Sequelize.JSONB,
            defaultValue: []
        });

        await safeAddColumn('Connections', 'passwordHash', {
            type: Sequelize.STRING,
            allowNull: true
        });

        await safeAddColumn('Connections', 'extractionEnabled', {
            type: Sequelize.BOOLEAN,
            defaultValue: false
        });

        await safeAddColumn('Connections', 'policies', {
            type: Sequelize.JSONB,
            defaultValue: []
        });

        await safeAddColumn('Connections', 'widgetConfig', {
            type: Sequelize.JSONB,
            defaultValue: {}
        });

        await safeAddColumn('Connections', 'healthScore', {
            type: Sequelize.FLOAT,
            defaultValue: 100.0
        });

        await safeAddColumn('Connections', 'driftCount', {
            type: Sequelize.INTEGER,
            defaultValue: 0
        });

        await safeAddColumn('Connections', 'confidenceGateStatus', {
            type: Sequelize.ENUM('ACTIVE', 'WARNING', 'FAILED'),
            defaultValue: 'ACTIVE'
        });

        await safeAddColumn('Connections', 'lastActivityAt', {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
        });

        await safeAddColumn('Connections', 'launchStatus', {
            type: Sequelize.ENUM('DRAFT', 'LAUNCHED'),
            defaultValue: 'DRAFT'
        });
    },

    down: async (queryInterface, Sequelize) => {
        // We don't remove columns in down to avoid data loss in dev
    }
};
