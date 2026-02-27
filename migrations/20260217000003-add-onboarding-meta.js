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

        await safeAddColumn('Connections', 'onboardingMeta', {
            type: Sequelize.JSONB,
            defaultValue: {},
            comment: 'Stores per-step metadata like discoveryState, training stats'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('Connections', 'onboardingMeta');
    }
};
