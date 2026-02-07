require("dotenv").config();
const sequelize = require("./config/db");

async function migrate() {
    try {
        console.log("🛠️ Starting Phase 1 migration...");

        await sequelize.query(`ALTER TABLE "Connections" ADD COLUMN IF NOT EXISTS "passwordHash" VARCHAR(255);`);
        console.log("✅ Added passwordHash");

        // Using VARCHAR for status to avoid ENUM complexity in raw SQL for now.
        // Sequelize will treat it as ENUM application-side.
        await sequelize.query(`ALTER TABLE "Connections" ADD COLUMN IF NOT EXISTS "status" VARCHAR(255) DEFAULT 'CREATED';`);
        console.log("✅ Added status");

        await sequelize.query(`ALTER TABLE "Connections" ADD COLUMN IF NOT EXISTS "widgetSeen" BOOLEAN DEFAULT FALSE;`);
        console.log("✅ Added widgetSeen");

        await sequelize.query(`ALTER TABLE "Connections" ADD COLUMN IF NOT EXISTS "extractionEnabled" BOOLEAN DEFAULT FALSE;`);
        console.log("✅ Added extractionEnabled");

        await sequelize.query(`ALTER TABLE "Connections" ADD COLUMN IF NOT EXISTS "allowedExtractors" JSONB DEFAULT '[]';`);
        console.log("✅ Added allowedExtractors");

        await sequelize.query(`ALTER TABLE "Connections" ADD COLUMN IF NOT EXISTS "extractionToken" VARCHAR(255);`);
        console.log("✅ Added extractionToken");

        await sequelize.query(`ALTER TABLE "Connections" ADD COLUMN IF NOT EXISTS "extractionTokenExpires" TIMESTAMPTZ;`);
        console.log("✅ Added extractionTokenExpires");

        console.log("🏁 Phase 1 Migration complete.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration failed:", err);
        process.exit(1);
    }
}

migrate();
