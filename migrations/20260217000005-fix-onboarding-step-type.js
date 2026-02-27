'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Drop the ENUM column
        await queryInterface.removeColumn('Connections', 'onboardingStep');

        // Add as INTEGER
        await queryInterface.addColumn('Connections', 'onboardingStep', {
            type: Sequelize.INTEGER,
            defaultValue: 1,
            comment: 'Current wizard step (1-6)'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('Connections', 'onboardingStep');
        await queryInterface.addColumn('Connections', 'onboardingStep', {
            type: Sequelize.ENUM('SETUP', 'CONNECT_WEBSITE', 'LEARN_AI', 'BRANDING', 'CHAT_PREVIEW', 'DEPLOY', 'COMPLETE'),
            defaultValue: 'SETUP'
        });
    }
};
