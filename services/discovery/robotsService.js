const axios = require('axios');

async function fetchRobotsSitemap(baseUrl) {
    try {
        const target = `${baseUrl.replace(/\/$/, '')}/robots.txt`;
        console.log(`[ROBOTS] Fetching ${target}`);

        const res = await axios.get(target, { timeout: 5000 });
        const lines = res.data.split('\n');

        const sitemapLine = lines.find(line =>
            line.toLowerCase().startsWith('sitemap:')
        );

        if (!sitemapLine) return null;

        const sitemapUrl = sitemapLine.split(':')[1].trim();
        return sitemapUrl;
    } catch (err) {
        console.error(`[ROBOTS] Error: ${err.message}`);
        return null;
    }
}

module.exports = { fetchRobotsSitemap };
