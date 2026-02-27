module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tableInfo = await queryInterface.describeTable('Users');
        if (!tableInfo.email) {
            await queryInterface.addColumn('Users', 'email', {
                type: Sequelize.STRING,
                allowNull: true,
                unique: true
            });
        }
        if (!tableInfo.status) {
            await queryInterface.addColumn('Users', 'status', {
                type: Sequelize.ENUM('ACTIVE', 'DISABLED', 'LOCKED'),
                defaultValue: 'ACTIVE'
            });
        }
        if (!tableInfo.failedAttempts) {
            await queryInterface.addColumn('Users', 'failedAttempts', {
                type: Sequelize.INTEGER,
                defaultValue: 0
            });
        }
        if (!tableInfo.lockUntil) {
            await queryInterface.addColumn('Users', 'lockUntil', {
                type: Sequelize.DATE,
                allowNull: true
            });
        }
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('Users', 'email');
        await queryInterface.removeColumn('Users', 'status');
        await queryInterface.removeColumn('Users', 'failedAttempts');
        await queryInterface.removeColumn('Users', 'lockUntil');
    }
};
