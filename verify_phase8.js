require("dotenv").config();
const sequelize = require("./config/db");
const Connection = require("./models/Connection");
const ConnectionKnowledge = require("./models/ConnectionKnowledge");

// Define Associations (same as app.js)
Connection.hasMany(ConnectionKnowledge, { foreignKey: 'connectionId', sourceKey: 'connectionId' });
ConnectionKnowledge.belongsTo(Connection, { foreignKey: 'connectionId', targetKey: 'connectionId' });

(async () => {
    try {
        console.log("🔄 Syncing DB...");
        await sequelize.sync({ alter: true }); // Ensure tables exist

        const setupId = "knowledge_test_" + Date.now();
        const otherId = "other_client_" + Date.now();

        // 1. Create Connections
        console.log("🛠️ Creating Connections...");
        const conn1 = await Connection.create({
            connectionId: setupId,
            connectionSecret: "sec1"
        });

        const conn2 = await Connection.create({
            connectionId: otherId,
            connectionSecret: "sec2"
        });

        // 2. Add Knowledge
        console.log("📚 Adding Knowledge...");
        await ConnectionKnowledge.create({
            connectionId: setupId,
            sourceType: "URL",
            sourceValue: "https://example.com/docs"
        });

        await ConnectionKnowledge.create({
            connectionId: setupId,
            sourceType: "TEXT",
            sourceValue: "Internal Wiki",
            rawText: "This is some internal knowledge."
        });

        // Add to other connection
        await ConnectionKnowledge.create({
            connectionId: otherId,
            sourceType: "URL",
            sourceValue: "https://competitor.com"
        });

        // 3. Verify Isolation
        console.log("🔍 Verifying Isolation...");

        // Fetch conn1 knowledge
        const k1 = await ConnectionKnowledge.findAll({ where: { connectionId: setupId } });
        console.log(`✅ Connection 1 has ${k1.length} entries.`);
        if (k1.length !== 2) throw new Error("Connection 1 should have 2 entries");

        // Fetch conn2 knowledge
        const k2 = await ConnectionKnowledge.findAll({ where: { connectionId: otherId } });
        console.log(`✅ Connection 2 has ${k2.length} entries.`);
        if (k2.length !== 1) throw new Error("Connection 2 should have 1 entry");

        // Verify Association Fetch
        const connWithK = await Connection.findOne({
            where: { connectionId: setupId },
            include: ConnectionKnowledge
        });

        if (!connWithK || !connWithK.ConnectionKnowledges || connWithK.ConnectionKnowledges.length !== 2) {
            console.error("DEBUG:", JSON.stringify(connWithK, null, 2));
            throw new Error("Association include failed");
        }
        console.log("✅ Association Include works!");

        console.log("✅ Phase 8 Verification PASSED");
        process.exit(0);

    } catch (e) {
        console.error("❌ Verification Failed:", e);
        process.exit(1);
    }
})();
