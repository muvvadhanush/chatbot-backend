const axios = require('axios');
const cheerio = require('cheerio');
const { isValidUrl, normalizeUrl } = require('./urlFilterService');

async function crawlWebsite(startUrl, baseDomain, maxPages = 50) {
    const visited = new Set();
    const queue = [{ url: normalizeUrl(startUrl), depth: 0 }];
    const results = [];

    console.log(`[CRAWLER] Starting at ${startUrl}`);

    while (queue.length && visited.size < maxPages) {
        const { url, depth } = queue.shift();

        if (visited.has(url)) continue;
        visited.add(url);

        try {
            console.log(`[CRAWLER] Visiting: ${url} (Depth: ${depth})`);

            // 1. Safety: limit response size to 1MB
            const res = await axios.get(url, {
                timeout: 5000,
                maxContentLength: 1048576, // 1MB
                maxBodyLength: 1048576 // 1MB
            });

            // Store result
            results.push({ url, depth });

            // If depth < 2, extract links
            if (depth < 2) {
                const $ = cheerio.load(res.data);
                $('a[href]').each((_, el) => {
                    const link = $(el).attr('href');
                    if (!link) return;

                    try {
                        const fullUrl = new URL(link, url).href;
                        const normalized = normalizeUrl(fullUrl);
                        const fullUrlObj = new URL(normalized);

                        // Check domain match
                        if (fullUrlObj.hostname === baseDomain) {
                            // Check filter
                            if (isValidUrl(normalized, baseDomain)) {
                                // Check if already in queue to avoid dupes? 
                                // Queue can grow large, visited check handles infinite loops.
                                queue.push({ url: normalized, depth: depth + 1 });
                            }
                        }
                    } catch { }
                });
            }

            // Rate limit: 1s
            await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
            // Handle oversized payload specific error?
            if (err.code === 'ERR_FR_TOO_MANY_REDIRECTS' || err.response?.status === 413) {
                console.error(`[CRAWLER] Skipped ${url}: Payload too large or redirect loop.`);
            } else {
                console.error(`[CRAWLER] Failed ${url}: ${err.message}`);
            }
        }
    }

    return results;
}

module.exports = { crawlWebsite };
