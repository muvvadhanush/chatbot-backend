'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('MissedQuestions', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER
            },
            connectionId: {
                type: Sequelize.STRING,
                allowNull: false
            },
            question: {
                type: Sequelize.TEXT,
                allowNull: false
            },
            confidenceScore: {
                type: Sequelize.FLOAT,
                allowNull: true
            },
            contextUsed: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            status: {
                type: Sequelize.ENUM('PENDING', 'RESOLVED'),
                defaultValue: 'PENDING'
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE
            }
        });

        await queryInterface.addIndex('MissedQuestions', ['connectionId']);
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('MissedQuestions');
    }
};
