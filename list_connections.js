
const sequelize = require('./config/db');
const Connection = require('./models/Connection');

async function listConnections() {
    try {
        await sequelize.authenticate();
        const connections = await Connection.findAll();
        console.log("--- CONNECTIONS ---");
        connections.forEach(c => {
            console.log(`${c.connectionId} | ${c.websiteName} | ${c.status}`);
        });
        console.log("-------------------");
    } catch (error) {
        console.error("Error:", error);
    } finally {
        await sequelize.close();
    }
}

listConnections();
