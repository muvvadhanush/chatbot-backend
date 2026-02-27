const sequelize = require('../config/db');
const PageContent = require('../models/PageContent');
const ConnectionDiscovery = require('../models/ConnectionDiscovery');

async function check() {
    try {
        const discovery = await ConnectionDiscovery.findAll();
        console.log('\n--- ConnectionDiscovery ---');
        console.log('Total Discovered Rows:', discovery.length);
        discovery.forEach(d => {
            console.log(`- [${d.connectionId}] ${d.discoveredUrl} | Status: ${d.status}`);
        });

        const pages = await PageContent.findAll();
        console.log('\n--- PageContent ---');
        console.log('Total Pages in DB:', pages.length);
        pages.forEach(p => {
            console.log(`- [${p.connectionId}] ${p.url} | Status: ${p.status} | Length: ${(p.cleanText || '').length}`);
        });
    } catch (e) {
        console.error(e);
    } finally {
        await sequelize.close();
    }
}

check();
