const BLOCKED_PATHS = [
    '/login',
    '/cart',
    '/checkout',
    '/admin',
    '/wp-admin',
    '/account',
    '/signin',
    '/signup',
    '/logout'
];

function isValidUrl(url, baseDomain) {
    try {
        const parsed = new URL(url);

        // Domain Check (Subdomains allowed? Prompt said "Only same domain", usually means hostname must watch baseDomain or be subdomain?)
        // User prompt code: `if (parsed.hostname !== baseDomain) return false;` -> Strict same hostname.
        if (parsed.hostname !== baseDomain) return false;

        // Blocked Paths
        if (BLOCKED_PATHS.some(path => parsed.pathname.toLowerCase().includes(path))) return false;

        // Extensions
        if (parsed.pathname.match(/\.(jpg|jpeg|png|gif|pdf|zip|mp4|avi|mov|css|js|json|xml|svg|ico|woff|woff2|ttf|eot)$/i)) return false;

        // Protocol
        if (!['http:', 'https:'].includes(parsed.protocol)) return false;

        return true;
    } catch {
        return false;
    }
}

function normalizeUrl(url) {
    try {
        const u = new URL(url);

        // 1. Remove Hash
        u.hash = '';

        // 2. Remove tracking params (utm_, etc.)
        const params = new URLSearchParams(u.search);
        const keys = Array.from(params.keys());
        for (const key of keys) {
            if (key.startsWith('utm_') || key.startsWith('fbclid') || key === 'ref') {
                params.delete(key);
            }
        }
        u.search = params.toString();

        // 3. Remove trailing slash (unless root)
        let clean = u.toString();
        if (clean.endsWith('/') && clean.length > u.origin.length + 1) {
            clean = clean.slice(0, -1);
        }

        return clean;
    } catch {
        return url;
    }
}

module.exports = { isValidUrl, normalizeUrl };
