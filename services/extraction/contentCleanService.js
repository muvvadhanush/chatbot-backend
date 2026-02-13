const cheerio = require('cheerio');

function cleanHtml(html) {
    if (!html) return "";

    const $ = cheerio.load(html);

    // Remove unwanted elements
    $('script, style, nav, footer, iframe, noscript, svg, [hidden]').remove();

    // Remove Ads/Tracking (Basic patterns)
    $('.ad, .ads, .advertisement, [id*="google_ads"], [class*="popup"]').remove();

    // Get text
    let text = $('body').text();

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
}

module.exports = { cleanHtml };
