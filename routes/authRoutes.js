const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const User = require("../models/User");
const settings = require("../config/settings");

// Secret for signing tokens (HMAC)
const JWT_SECRET = settings.jwtSecret;

router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: "Username and password required" });
        }

        const user = await User.findOne({ where: { username } });
        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const isValid = await user.validPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Generate Token
        // Payload: userId|username|role|expiresAt
        const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
        const payload = `${user.id}|${user.username}|${user.role}|${expiresAt}`;

        // Sign
        const hmac = crypto.createHmac('sha256', JWT_SECRET);
        hmac.update(payload);
        const signature = hmac.digest('hex');

        const token = Buffer.from(`${payload}|${signature}`).toString('base64');

        res.json({
            success: true,
            token: token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({
            error: "Login failed",
            details: error.message
        });
    }
});

router.get("/me", async (req, res) => {
    // This route expects the middleware to have attached user
    // But since we are defining routes, we need to apply middleware to this specific route
    // OR just handle verification here if middleware isn't applied globally to this router.
    // Ideally, middleware handles it.

    // Manual verification for now to avoid circular dependency or complex setup if middleware isn't ready
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const parts = decoded.split('|');
        if (parts.length !== 5) throw new Error("Invalid structure");

        const [userId, username, role, expiresAt, signature] = parts;

        // Verify Signature
        const hmac = crypto.createHmac('sha256', JWT_SECRET);
        hmac.update(`${userId}|${username}|${role}|${expiresAt}`);
        const expectedSig = hmac.digest('hex');

        if (signature !== expectedSig) throw new Error("Invalid signature");
        if (Date.now() > parseInt(expiresAt)) throw new Error("Token expired");

        res.json({
            user: { id: userId, username, role }
        });
    } catch (e) {
        res.status(401).json({ error: "Invalid token" });
    }
});

module.exports = router;
