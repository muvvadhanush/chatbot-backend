const User = require("../models/User");
const settings = require("../config/settings");
const crypto = require("crypto");

const authenticate = async (req, res, next) => {
    // 1. Check for Bearer Token (Preferred)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        try {
            // Verify Token
            const decoded = Buffer.from(token, 'base64').toString('utf8');
            const parts = decoded.split('|');

            if (parts.length !== 5) throw new Error("Invalid token structure");

            const [userId, username, role, expiresAt, signature] = parts;

            // Check Expiry
            if (Date.now() > parseInt(expiresAt)) throw new Error("Token expired");

            // Verify Signature
            const hmac = crypto.createHmac('sha256', settings.jwtSecret);
            hmac.update(`${userId}|${username}|${role}|${expiresAt}`);
            const expectedSig = hmac.digest('hex');

            if (signature !== expectedSig) throw new Error("Invalid token signature");

            // Success - Attach User
            req.user = { id: userId, username, role };
            return next();

        } catch (err) {
            console.error("Token Auth Failed:", err.message);
            // Don't fall back to Basic Auth if a token was attempted but failed.
            return res.status(401).json({ error: "Invalid or expired token" });
        }
    }

    // 2. Fallback to Basic Auth (Legacy / Dev)
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    if (!b64auth) {
        // If neither token nor basic auth, reject.
        // But for browser navigation to /admin (if we still protect it), we might want to prompt.
        // However, we are moving to custom login page.
        // So we strictly return 401 JSON.
        res.set('WWW-Authenticate', 'Basic realm="Admin Access"'); // Optional, might trigger browser prompt
        return res.status(401).json({ error: "Authentication required" });
    }

    const [login, pwd] = Buffer.from(b64auth, 'base64').toString().split(':');
    if (!login || !pwd) {
        return res.status(401).json({ error: "Authentication required" });
    }

    try {
        const user = await User.findOne({ where: { username: login } });
        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const isValid = await user.validPassword(pwd);
        if (!isValid) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        req.user = {
            id: user.id,
            username: user.username,
            role: user.role
        };

        return next();

    } catch (error) {
        console.error("Basic Auth Error:", error);
        return res.status(500).json({ error: "Internal Server Error during Auth." });
    }
};

module.exports = authenticate;
