
const sequelize = require('./config/db');
const migration = require('./migrations/01_add_website_url');

(async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Connected to DB');

        const queryInterface = sequelize.getQueryInterface();
        await migration.up(queryInterface, sequelize.Sequelize);

        console.log('✅ Migration 01 Applied Successfully');
    } catch (err) {
        if (err.message.includes('Duplicate column name')) {
            console.log('⚠️ Column already exists, skipping.');
        } else {
            console.error('❌ Migration Failed:', err);
        }
    } finally {
        await sequelize.close();
    }
})();
