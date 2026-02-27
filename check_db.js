
require('dotenv').config();
const sequelize = require('./config/db');
const Connection = require('./models/Connection');

async function checkConnection() {
    try {
        await sequelize.authenticate();
        console.log('✅ MySQL Connection has been established successfully.');

        const count = await Connection.count();
        console.log(`📊 There are currently ${count} connections in the database.`);

        const connections = await Connection.findAll({ attributes: ['connectionId', 'websiteName'] });
        console.log('🔗 Current connections:');
        connections.forEach(c => console.log(`   - ${c.connectionId} (${c.websiteName})`));

    } catch (error) {
        console.error('❌ Unable to connect to the database:', error);
    } finally {
        await sequelize.close();
    }
}

checkConnection();
