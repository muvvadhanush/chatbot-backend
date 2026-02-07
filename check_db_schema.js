const sequelize = require("./config/db");
const Connection = require("./models/Connection");

async function check() {
    try {
        const tableInfo = await sequelize.getQueryInterface().describeTable("Connections");
        console.log("Table Columns:", JSON.stringify(tableInfo, null, 2));

        const count = await Connection.count();
        console.log("Connection Count:", count);

        if (count > 0) {
            const first = await Connection.findOne();
            console.log("First Connection Data:", JSON.stringify(first, null, 2));
        }
    } catch (err) {
        console.error("Error checking table:", err.message);
    } finally {
        process.exit();
    }
}

check();
