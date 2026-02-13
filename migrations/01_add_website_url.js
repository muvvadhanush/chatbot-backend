'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('Connections', 'websiteUrl', {
            type: Sequelize.STRING,
            allowNull: true,
            comment: "Main URL of the connected website"
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('Connections', 'websiteUrl');
    }
};
