/**
 * Scraper Service
 * Handles safe fetching and cleaning of content for Knowledge Ingestion.
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { pipeline } = require('stream/promises');

class ScraperService {

    constructor() {
        this.TIMEOUT_MS = 30000; // 30s
        this.MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
        this.MAX_IMG_BYTES = 5 * 1024 * 1024; // 5MB
    }

    /**
     * Fetch Branding (Favicon/Logo)
     * @param {string} rawUrl - Website URL
     * @param {string} connectionId - For folder storage
     */
    async fetchBranding(rawUrl, connectionId) {
        if (!rawUrl || !connectionId) throw new Error("URL and ConnectionID required");

        const targetDir = path.join(__dirname, '..', 'public', 'branding', connectionId);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const report = {
            faviconPath: null,
            logoPath: null,
            logoBase64: null,
            status: 'FAILED'
        };

        try {
            const urlObj = new URL(rawUrl);
            const baseUrl = urlObj.origin;

            // 1. Fetch HTML to find tags
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

            let html = "";
            try {
                const res = await fetch(rawUrl, { signal: controller.signal });
                if (res.ok) html = await res.text();
            } catch (e) {
                console.warn("HTML fetch failed, trying default favicon only");
            } finally {
                clearTimeout(timeout);
            }

            // 2. Favicon Strategy
            // A. Try /favicon.ico
            let faviconUrl = `${baseUrl}/favicon.ico`;
            if (await this._downloadImage(faviconUrl, path.join(targetDir, 'favicon.ico'))) {
                report.faviconPath = `/branding/${connectionId}/favicon.ico`;
            }
            // B. Try <link rel="icon">
            else {
                const linkIconMatch = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i);
                if (linkIconMatch && linkIconMatch[1]) {
                    const absIconUrl = new URL(linkIconMatch[1], baseUrl).href;
                    if (await this._downloadImage(absIconUrl, path.join(targetDir, 'favicon.ico'))) {
                        report.faviconPath = `/branding/${connectionId}/favicon.ico`;
                    }
                }
            }

            // 3. Logo Strategy
            // A. Try <meta property="og:image">
            const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
            if (ogImageMatch && ogImageMatch[1]) {
                const absLogoUrl = new URL(ogImageMatch[1], baseUrl).href;
                if (await this._downloadImage(absLogoUrl, path.join(targetDir, 'logo.png'))) {
                    report.logoPath = `/branding/${connectionId}/logo.png`;
                }
            }

            // B. Try 'logo' keyword in img tags (Simple Regex fallback)
            if (!report.logoPath) {
                const imgMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)];
                for (const match of imgMatches) {
                    if (match[0].toLowerCase().includes('logo') || match[1].toLowerCase().includes('logo')) {
                        const absLogoUrl = new URL(match[1], baseUrl).href;
                        if (await this._downloadImage(absLogoUrl, path.join(targetDir, 'logo.png'))) {
                            report.logoPath = `/branding/${connectionId}/logo.png`;
                            break;
                        }
                    }
                }
            }

            // C. Convert Logo to Base64 (to fix Mixed Content issues in local dev)
            if (report.logoPath) {
                try {
                    const fullLogoPath = path.join(targetDir, 'logo.png');
                    if (fs.existsSync(fullLogoPath)) {
                        const buffer = fs.readFileSync(fullLogoPath);
                        report.logoBase64 = `data:image/png;base64,${buffer.toString('base64')}`;
                    }
                } catch (e) {
                    console.warn("Base64 Logo conversion failed:", e.message);
                }
            }

            // Determine Status
            if (report.faviconPath && report.logoPath) report.status = 'READY';
            else if (report.faviconPath || report.logoPath) report.status = 'PARTIAL';
            else report.status = 'FAILED';

        } catch (err) {
            console.error("Branding Fetch Error:", err);
            report.status = 'FAILED';
        }

        return report;
    }

    async _downloadImage(url, destPath) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);

            if (!res.ok) return false;

            const type = res.headers.get("content-type") || "";
            if (!type.startsWith("image/")) return false;

            const buffer = Buffer.from(await res.arrayBuffer());
            if (buffer.length > this.MAX_IMG_BYTES) return false;

            fs.writeFileSync(destPath, buffer);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Scrape Website (Identity Scan)
     * Fetches homepage and extracts metadata/content for bot identity suggestions.
     */
    async scrapeWebsite(url) {
        try {
            const response = await fetch(url, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
            });

            if (!response.ok) throw new Error("Failed to fetch website");

            const html = await response.text();
            const $ = cheerio.load(html);

            // 1. Metadata Extraction
            const metadata = {
                title: $('title').text() || $('meta[property="og:title"]').attr('content') || "",
                description: $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || "",
                ogImage: $('meta[property="og:image"]').attr('content'),
                favicon: $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href'),
                jsonLd: []
            };

            // Extract JSON-LD
            $('script[type="application/ld+json"]').each((i, el) => {
                try {
                    metadata.jsonLd.push(JSON.parse($(el).html()));
                } catch (e) { }
            });

            // 2. Form Extraction
            const forms = [];
            $('form').each((i, el) => {
                const form = $(el);
                const inputs = [];
                form.find('input, textarea, select').each((j, inp) => {
                    const iEl = $(inp);
                    inputs.push({
                        name: iEl.attr('name') || iEl.attr('id'),
                        type: iEl.attr('type') || iEl.prop('tagName').toLowerCase(),
                        placeholder: iEl.attr('placeholder'),
                        required: iEl.attr('required') !== undefined
                    });
                });
                forms.push({
                    action: form.attr('action'),
                    method: form.attr('method') || 'GET',
                    inputs: inputs,
                    id: form.attr('id')
                });
            });

            // 3. Navigation Extraction
            const navigation = [];
            $('nav a, header a, footer a').each((i, el) => {
                const link = $(el);
                const href = link.attr('href');
                const text = link.text().trim();
                if (href && text && !href.startsWith('#') && !href.startsWith('javascript:')) {
                    navigation.push({ text, href: new URL(href, url).href });
                }
            });

            // 4. Clean Text (Preserve structure better than regex?)
            // Remove scripts/styles
            $('script, style, noscript, svg').remove();
            const cleanText = $('body').text().replace(/\s+/g, ' ').trim();

            return {
                success: true,
                metadata,
                forms,
                navigation,
                rawText: cleanText
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Ingest URL: Fetch, validate, and extract clean text.
     * @param {string} url 
     * @returns {Promise<{rawText: string, cleanedText: string}>}
     */
    async ingestURL(url) {
        // 1. Validate Protocol
        if (!url.startsWith("http")) {
            throw new Error("Invalid protocol. Only HTTP/HTTPS allowed.");
        }

        try {
            // Re-use scrapeWebsite for consistency and robustness
            // Note: `scrapeWebsite` returns clean body text in `rawText`
            const result = await this.scrapeWebsite(url);

            if (!result.success) {
                console.error(`Scrape failed for ${url}:`, result.error);
                throw new Error(result.error || "Scraping failed");
            }

            return {
                rawText: result.rawText,
                cleanedText: result.rawText,
                metadata: result.metadata,
                forms: result.forms,
                navigation: result.navigation
            };

        } catch (error) {
            console.error(`IngestURL Error for ${url}:`, error.message);
            throw error;
        }
    }

    /**
     * Ingest Text: Normalize manual input.
     * @param {string} text 
     * @returns {{rawText: string, cleanedText: string}}
     */
    ingestText(text) {
        if (!text || text.length === 0) throw new Error("Empty text provided.");

        const cleaned = text
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();

        return {
            rawText: text,
            cleanedText: cleaned
        };
    }

    /**
     * Simple HTML Stripper (Regex-based for Phase 9)
     * Removes <script>, <style>, tags, and excess whitespace.
     */
    _cleanHTML(html) {
        let text = html || "";

        // Remove Head (CSS/Scripts usually here)
        text = text.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');

        // Remove Scripts & Styles
        text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
        text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
        text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ');

        // Remove HTML Tags
        text = text.replace(/<[^>]+>/g, ' ');

        // Decode Entities (Basic ones)
        text = text
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"');

        // Normalize Whitespace
        text = text.replace(/\s+/g, ' ').trim();

        return text;
    }
}

module.exports = new ScraperService();
