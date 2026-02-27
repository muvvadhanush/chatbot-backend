const scraperService = require('../services/scraperService');

async function testScrape() {
    const url = 'https://techbprojects.vercel.app/';
    console.log(`Testing scrape for ${url}...`);
    const result = await scraperService.scrapeWebsite(url);
    console.log('Result:', JSON.stringify(result, null, 2));
}

testScrape();
