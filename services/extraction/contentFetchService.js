const axios = require('axios');

async function fetchPage(url) {
    if (!url) throw new Error("URL is required");

    try {
        const res = await axios.get(url, {
            timeout: 5000,
            maxContentLength: 1024 * 1024, // 1MB
            headers: {
                'User-Agent': 'UniversalAI-Crawler/1.0'
            }
        });

        const contentType = res.headers['content-type'] || '';
        if (!contentType.includes('text/html')) {
            throw new Error(`Invalid content type: ${contentType}`);
        }

        return res.data;
    } catch (err) {
        if (err.code === 'ECONNABORTED') {
            throw new Error("Request timed out");
        }
        if (err.response?.status === 413 || err.message.includes('maxContentLength')) {
            throw new Error("Page too large (>1MB)");
        }
        throw err;
    }
}

module.exports = { fetchPage };
