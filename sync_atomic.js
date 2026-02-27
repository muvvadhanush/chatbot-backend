const sequelize = require('./config/db');
(async () => {
    try {
        console.log('Clearing sessions...');
        await sequelize.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'postgres' AND pid != pg_backend_pid()");
        console.log('Syncing...');
        await sequelize.sync({ alter: true });
        console.log('ATOMIC_SYNC_SUCCESS');
    } catch (e) {
        console.error('ATOMIC_SYNC_FAIL:' + e.message);
    } finally {
        await sequelize.close();
    }
})();
