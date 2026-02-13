const axios = require('axios');
const xml2js = require('xml2js');
const { isValidUrl } = require('./urlFilterService');

async function fetchSitemap(baseUrl) {
    try {
        // Try standard sitemap.xml
        // Note: The prompt code used `${baseUrl}/sitemap.xml`.
        // Valid sitemap URL might be passed directly if discovered via robots.txt

        // Check if input is already a full sitemap URL or just base
        let target = baseUrl;
        if (!target.endsWith('.xml')) {
            target = `${baseUrl.replace(/\/$/, '')}/sitemap.xml`;
        }

        console.log(`[SITEMAP] Fetching ${target}`);
        const res = await axios.get(target, { timeout: 8000 });

        if (!res.data || typeof res.data !== 'string') return null;

        const parsed = await xml2js.parseStringPromise(res.data);

        // Handle standard sitemap
        if (parsed.urlset && parsed.urlset.url) {
            return parsed.urlset.url.map(u => u.loc[0]);
        }

        // Handle sitemap index
        if (parsed.sitemapindex && parsed.sitemapindex.sitemap) {
            // For Phase 1, we might just return the index or try to fetch first level?
            // Prompt implied simple list. Let's flatten if possible or just return sub-sitemaps?
            // Let's stick to simple "return URLs" logic. 
            // If it's an index, we might need recursive extraction.
            // For MVP/Phase 1 simplicity: verify if we should recurse.
            // The prompt code was simple: `parsed.urlset.url`.
            // I will stick to the prompts logic but add safety if urlset is missing.
            return [];
        }

        return null;
    } catch (err) {
        console.error(`[SITEMAP] Error: ${err.message}`);
        return null;
    }
}

module.exports = { fetchSitemap };
