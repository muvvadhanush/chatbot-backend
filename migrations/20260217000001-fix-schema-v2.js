module.exports = {
    up: async (queryInterface, Sequelize) => {
        const safeAddColumn = async (table, column, typeDef) => {
            try {
                await queryInterface.addColumn(table, column, typeDef);
            } catch (e) {
                // Ignore column already exists error
                if (!e.message.includes('already exists')) {
                    throw e;
                }
            }
        };

        // 1. ChatSessions
        await safeAddColumn('ChatSessions', 'memory', {
            type: Sequelize.JSONB,
            allowNull: true
        });
        await safeAddColumn('ChatSessions', 'lastMessageAt', {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
        });

        // 2. Connections
        await safeAddColumn('Connections', 'responseLength', {
            type: Sequelize.STRING,
            defaultValue: "medium"
        });
        await safeAddColumn('Connections', 'temperature', {
            type: Sequelize.FLOAT,
            defaultValue: 0.3
        });
        await safeAddColumn('Connections', 'connectionSecretHash', {
            type: Sequelize.STRING,
            allowNull: true
        });

        // 3. Migrate connectionSecret to connectionSecretHash
        // (Wait, connectionSecret might be the legacy name, let's verify if the column exists)
        const tableInfo = await queryInterface.describeTable('Connections');
        if (tableInfo.connectionSecret) {
            await queryInterface.sequelize.query(
                'UPDATE "Connections" SET "connectionSecretHash" = "connectionSecret"'
            );
        }
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('ChatSessions', 'memory');
        await queryInterface.removeColumn('ChatSessions', 'lastMessageAt');
        await queryInterface.removeColumn('Connections', 'responseLength');
        await queryInterface.removeColumn('Connections', 'temperature');
        await queryInterface.removeColumn('Connections', 'connectionSecretHash');
    }
};
