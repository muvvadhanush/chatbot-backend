const express = require('express');
const router = express.Router();
const sequelize = require('../config/db');
const { Op } = require('sequelize');
const Connection = require('../models/Connection');
const ChatSession = require('../models/ChatSession');
const ConnectionKnowledge = require('../models/ConnectionKnowledge');
const basicAuth = require('../middleware/auth');
const authorize = require('../middleware/rbac');

// Endpoint: /api/v1/analytics/dashboard
router.get('/dashboard', basicAuth, authorize(['VIEWER', 'EDITOR', 'OWNER']), async (req, res) => {
    try {
        const { period, connectionId } = req.query; // period: '7d', '30d', 'all'

        // Date Filter
        let dateFilter = {};
        if (period === '7d') {
            dateFilter = { createdAt: { [Op.gte]: new Date(new Date() - 7 * 24 * 60 * 60 * 1000) } };
        } else if (period === '30d') {
            dateFilter = { createdAt: { [Op.gte]: new Date(new Date() - 30 * 24 * 60 * 60 * 1000) } };
        }

        // Connection Filter
        let connFilter = {};
        if (connectionId && connectionId !== 'ALL') {
            connFilter = { connectionId };
        }

        // 1. Total Conversations
        const totalConversations = await ChatSession.count({ where: { ...dateFilter, ...connFilter } });

        // 2. Avg Confidence (Mocked calculation or aggregations if supported)
        // For MVP, we might need a separate table for message-level analytics or scan ChatSession messages (expensive)
        // We'll return a placeholder or aggregate if possible.
        // Let's rely on a 'Metadata' table if it existed, otherwise mock for now or do a light scan.
        const avgConfidence = 0.88; // Placeholder

        // 3. Gated Responses % (Blocked responses)
        const gatedPercent = 12.5; // Placeholder

        // 4. Drift Events
        // Count ConnectionKnowledge where status='FAILED' or drift detected
        const driftEvents = await ConnectionKnowledge.count({
            where: {
                ...connFilter,
                // Assuming we track drift in status or metadata
                status: 'FAILED' // simplistic proxy
            }
        });

        // 5. Sales Trigger %
        const salesPercent = 5.2;

        // 6. Coverage Over Time (Mock data for chart)
        const coverageHistory = [
            { date: '2023-10-01', coverage: 20 },
            { date: '2023-10-05', coverage: 45 },
            { date: '2023-10-10', coverage: 80 },
            { date: '2023-10-15', coverage: 92 }
        ];

        // 7. Top Unanswered Questions
        const topUnanswered = [
            { question: "What is your refund policy for enterprise?", count: 15 },
            { question: "Do you support SSO?", count: 8 },
            { question: "How to export data?", count: 5 }
        ];

        res.json({
            totalConversations,
            avgConfidence,
            gatedPercent,
            driftEvents,
            salesPercent,
            coverageHistory,
            topUnanswered
        });

    } catch (e) {
        console.error("Analytics Error:", e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
