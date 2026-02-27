'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        try {
            await queryInterface.addColumn('Connections', 'websiteUrl', {
                type: Sequelize.STRING,
                allowNull: true,
                comment: "Main URL of the connected website"
            });
        } catch (e) { console.log('Skipping 01_add_website_url as column exists'); }
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('Connections', 'websiteUrl');
    }
};
