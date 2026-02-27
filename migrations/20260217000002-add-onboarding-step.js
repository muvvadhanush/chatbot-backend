'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tableInfo = await queryInterface.describeTable('Connections');
        if (!tableInfo.onboardingStep) {
            await queryInterface.addColumn('Connections', 'onboardingStep', {
                type: Sequelize.ENUM('SETUP', 'CONNECT_WEBSITE', 'LEARN_AI', 'BRANDING', 'CHAT_PREVIEW', 'DEPLOY', 'COMPLETE'),
                defaultValue: 'SETUP'
            });
        }
        if (!tableInfo.version) {
            await queryInterface.addColumn('Connections', 'version', {
                type: Sequelize.STRING,
                defaultValue: 'V1'
            });
        }
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('Connections', 'onboardingStep');
        await queryInterface.removeColumn('Connections', 'version');
    }
};
