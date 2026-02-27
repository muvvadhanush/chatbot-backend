/**
 * migrate_onboarding_v2.js
 * 
 * Migration script for Onboarding V2.
 * Alters Connection.status ENUM, adds new columns,
 * and maps existing data to new states.
 * 
 * Run: node backend/scripts/migrate_onboarding_v2.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sequelize = require('../config/db');

async function migrate() {
    const t = await sequelize.transaction();

    try {
        console.log('🔄 [MIGRATION] Onboarding V2 — Starting...');

        // ===== Step 1: Add new columns =====
        console.log('1️⃣  Adding new columns...');

        const columnsToAdd = [
            { name: 'onboardingStep', sql: `ALTER TABLE "Connections" ADD COLUMN IF NOT EXISTS "onboardingStep" INTEGER DEFAULT 1;` },
            { name: 'onboardingCompletedAt', sql: `ALTER TABLE "Connections" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP WITH TIME ZONE;` },
            { name: 'version', sql: `ALTER TABLE "Connections" ADD COLUMN IF NOT EXISTS "version" INTEGER DEFAULT 0;` },
            { name: 'stateLockedBy', sql: `ALTER TABLE "Connections" ADD COLUMN IF NOT EXISTS "stateLockedBy" VARCHAR(255);` },
            { name: 'stateLockedAt', sql: `ALTER TABLE "Connections" ADD COLUMN IF NOT EXISTS "stateLockedAt" TIMESTAMP WITH TIME ZONE;` },
            { name: 'onboardingMeta', sql: `ALTER TABLE "Connections" ADD COLUMN IF NOT EXISTS "onboardingMeta" JSONB DEFAULT '{}';` }
        ];

        for (const col of columnsToAdd) {
            try {
                await sequelize.query(col.sql, { transaction: t });
                console.log(`   ✅ ${col.name} added.`);
            } catch (e) {
                if (e.message.includes('already exists')) {
                    console.log(`   ⏭️  ${col.name} already exists, skipping.`);
                } else {
                    throw e;
                }
            }
        }

        // ===== Step 2: Alter status ENUM =====
        console.log('2️⃣  Altering status ENUM...');

        // PostgreSQL requires creating a new type and swapping
        const enumSteps = [
            // Create new ENUM type
            `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_Connections_status_v2') THEN
          CREATE TYPE "enum_Connections_status_v2" AS ENUM ('DRAFT', 'CONNECTED', 'DISCOVERING', 'TRAINED', 'TUNED', 'READY', 'LAUNCHED');
        END IF;
      END $$;`,

            // Map existing data to new states BEFORE changing type
            `UPDATE "Connections" SET "status" = 'CONNECTED' WHERE "status" = 'CONNECTED';`,
            `UPDATE "Connections" SET "status" = 'READY' WHERE "status" = 'READY';`,

            // Add temporary column with new type
            `ALTER TABLE "Connections" ADD COLUMN IF NOT EXISTS "status_new" "enum_Connections_status_v2" DEFAULT 'DRAFT';`,

            // Copy and transform data
            `UPDATE "Connections" SET "status_new" = CASE
        WHEN "status" = 'CREATED' THEN 'DRAFT'::"enum_Connections_status_v2"
        WHEN "status" = 'CONNECTED' THEN 'CONNECTED'::"enum_Connections_status_v2"
        WHEN "status" = 'READY' THEN 'READY'::"enum_Connections_status_v2"
        WHEN "status" = 'FAILED' THEN 'DRAFT'::"enum_Connections_status_v2"
        ELSE 'DRAFT'::"enum_Connections_status_v2"
      END;`,

            // Drop old column and rename new one
            `ALTER TABLE "Connections" DROP COLUMN "status";`,
            `ALTER TABLE "Connections" RENAME COLUMN "status_new" TO "status";`,

            // Drop old enum type (cleanup)
            `DROP TYPE IF EXISTS "enum_Connections_status";`,
            `ALTER TYPE "enum_Connections_status_v2" RENAME TO "enum_Connections_status";`
        ];

        for (let i = 0; i < enumSteps.length; i++) {
            try {
                await sequelize.query(enumSteps[i], { transaction: t });
                console.log(`   ✅ ENUM step ${i + 1}/${enumSteps.length} done.`);
            } catch (e) {
                console.error(`   ❌ ENUM step ${i + 1} failed:`, e.message);
                throw e;
            }
        }

        // ===== Step 3: Update onboardingStep based on status =====
        console.log('3️⃣  Mapping onboardingStep from status...');

        await sequelize.query(`
      UPDATE "Connections" SET "onboardingStep" = CASE
        WHEN "status" = 'DRAFT' THEN 1
        WHEN "status" = 'CONNECTED' THEN 2
        WHEN "status" = 'DISCOVERING' THEN 3
        WHEN "status" = 'TRAINED' THEN 4
        WHEN "status" = 'TUNED' THEN 5
        WHEN "status" = 'READY' THEN 6
        WHEN "status" = 'LAUNCHED' THEN 6
        ELSE 1
      END;
    `, { transaction: t });

        console.log('   ✅ onboardingStep mapped.');

        // ===== Step 4: Add index on status =====
        console.log('4️⃣  Creating index on status...');
        try {
            await sequelize.query(
                `CREATE INDEX IF NOT EXISTS "connections_status_idx" ON "Connections" ("status");`,
                { transaction: t }
            );
            console.log('   ✅ Index created.');
        } catch (e) {
            console.log('   ⏭️  Index already exists.');
        }

        // ===== Commit =====
        await t.commit();
        console.log('');
        console.log('✅ [MIGRATION] Onboarding V2 — Complete!');
        console.log('');

        // ===== Verify =====
        const [results] = await sequelize.query(`
      SELECT "status", COUNT(*) as count 
      FROM "Connections" 
      GROUP BY "status";
    `);
        console.log('📊 Status Distribution:');
        results.forEach(r => console.log(`   ${r.status}: ${r.count}`));

    } catch (error) {
        await t.rollback();
        console.error('');
        console.error('❌ [MIGRATION] FAILED — Transaction rolled back.');
        console.error('Error:', error.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

migrate();
