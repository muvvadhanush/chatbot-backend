const Connection = require('./models/Connection');
const sequelize = require('./config/db');

async function updateStatus() {
    try {
        await sequelize.authenticate();
        console.log("DB Authenticated");

        const connectionId = process.argv[2];
        if (!connectionId) {
            console.error("Please provide connection ID as argument");
            process.exit(1);
        }

        const [updated] = await Connection.update({ status: 'CONNECTED' }, {
            where: { connectionId }
        });

        if (updated) {
            console.log(`Connection ${connectionId} updated to CONNECTED.`);
        } else {
            console.error(`Connection ${connectionId} not found.`);
        }

        process.exit(0);
    } catch (error) {
        console.error('Error updating status:', error);
        process.exit(1);
    }
}

updateStatus();
