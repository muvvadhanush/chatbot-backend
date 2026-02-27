/**
 * onboardingRoutes.js
 * 
 * Dedicated API endpoints for the onboarding wizard.
 * All endpoints are authenticated and OWNER-only.
 *
 * PRODUCTION HARDENED — Step 8:
 * - Slow query detection on status/resume endpoints
 * - Analytics overview endpoint (aggregate metrics)
 * - Per-connection analytics endpoint (event timeline)
 */

const express = require('express');
const router = express.Router();
const Connection = require('../models/Connection');
const StateMachine = require('../services/OnboardingStateMachine');
const Analytics = require('../services/OnboardingAnalytics');
const basicAuth = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const logger = require('../utils/logger');

const SLOW_QUERY_THRESHOLD_MS = 500;

// ============================================================
// GET /onboarding/:connectionId/status
// Returns current onboarding state, step, version, and next steps.
// ============================================================
router.get('/:connectionId/status', basicAuth, authorize(['VIEWER', 'EDITOR', 'OWNER']), async (req, res) => {
    const startTime = process.hrtime.bigint();
    try {
        const { connectionId } = req.params;
        const connection = await Connection.findOne({ where: { connectionId } });

        if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
        }

        const validNext = StateMachine.getValidNextStates(connection);
        const canProceedChecks = {};

        // Check guards for each valid forward transition
        for (const next of validNext.filter(n => !n.isRollback)) {
            const check = await StateMachine.canTransition(connection, next.state);
            canProceedChecks[next.state] = check;
        }

        const durationMs = Math.round(Number(process.hrtime.bigint() - startTime) / 1e6 * 100) / 100;

        // Slow query detection
        if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
            logger.slowQuery(connectionId, 'onboarding:status', durationMs, SLOW_QUERY_THRESHOLD_MS);
        }

        res.json({
            connectionId: connection.connectionId,
            status: connection.status,
            onboardingStep: connection.onboardingStep,
            version: connection.version,
            isLaunched: connection.status === 'LAUNCHED',
            isLocked: !!connection.stateLockedBy,
            lockedBy: connection.stateLockedBy || null,
            onboardingCompletedAt: connection.onboardingCompletedAt,
            onboardingMeta: connection.onboardingMeta || {},
            resumePath: StateMachine.getPathForState(connection.status),
            validNextStates: validNext,
            canProceed: canProceedChecks,
            _perf: { durationMs }
        });

    } catch (error) {
        console.error('[ONBOARDING] Status Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// POST /onboarding/:connectionId/transition
// Attempts a state transition with optimistic locking.
// Body: { targetState: string, version: number, meta?: object }
// ============================================================
router.post('/:connectionId/transition', basicAuth, authorize(['OWNER']), async (req, res) => {
    try {
        const { connectionId } = req.params;
        const { targetState, version, meta } = req.body;

        if (!targetState) {
            return res.status(400).json({ error: 'targetState is required.' });
        }

        if (version === undefined || version === null) {
            return res.status(400).json({ error: 'version is required for optimistic locking.' });
        }

        const connection = await Connection.findOne({ where: { connectionId } });
        if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
        }

        const result = await StateMachine.transition(connection, targetState, {
            expectedVersion: version,
            meta
        });

        if (!result.success) {
            return res.status(result.statusCode).json({ error: result.error });
        }

        res.json({
            success: true,
            previousState: result.previousState,
            newState: result.newState,
            step: result.step,
            version: result.version,
            durationMs: result.durationMs,
            resumePath: StateMachine.getPathForState(result.newState)
        });

    } catch (error) {
        console.error('[ONBOARDING] Transition Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// GET /onboarding/:connectionId/resume
// Returns the path the UI should navigate to based on state.
// ============================================================
router.get('/:connectionId/resume', basicAuth, authorize(['VIEWER', 'EDITOR', 'OWNER']), async (req, res) => {
    const startTime = process.hrtime.bigint();
    try {
        const { connectionId } = req.params;
        const connection = await Connection.findOne({ where: { connectionId } });

        if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
        }

        const durationMs = Math.round(Number(process.hrtime.bigint() - startTime) / 1e6 * 100) / 100;

        if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
            logger.slowQuery(connectionId, 'onboarding:resume', durationMs, SLOW_QUERY_THRESHOLD_MS);
        }

        res.json({
            connectionId: connection.connectionId,
            status: connection.status,
            step: connection.onboardingStep,
            resumePath: StateMachine.getPathForState(connection.status),
            isComplete: connection.status === 'LAUNCHED',
            _perf: { durationMs }
        });

    } catch (error) {
        console.error('[ONBOARDING] Resume Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// POST /onboarding/:connectionId/lock
// Acquires a job lock for async operations.
// Body: { jobName: string }
// ============================================================
router.post('/:connectionId/lock', basicAuth, authorize(['OWNER']), async (req, res) => {
    try {
        const { connectionId } = req.params;
        const { jobName } = req.body;

        if (!jobName) {
            return res.status(400).json({ error: 'jobName is required.' });
        }

        const connection = await Connection.findOne({ where: { connectionId } });
        if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
        }

        const result = await StateMachine.acquireLock(connection, jobName);

        if (!result.acquired) {
            return res.status(423).json({ error: result.reason });
        }

        res.json({ success: true, lockedBy: jobName });

    } catch (error) {
        console.error('[ONBOARDING] Lock Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// DELETE /onboarding/:connectionId/lock
// Releases a job lock.
// ============================================================
router.delete('/:connectionId/lock', basicAuth, authorize(['OWNER']), async (req, res) => {
    try {
        const { connectionId } = req.params;
        const connection = await Connection.findOne({ where: { connectionId } });

        if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
        }

        await StateMachine.releaseLock(connection);
        res.json({ success: true, message: 'Lock released.' });

    } catch (error) {
        console.error('[ONBOARDING] Unlock Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// ANALYTICS ENDPOINTS — Production Observability
// ============================================================

/**
 * GET /onboarding/analytics/overview
 * System-wide onboarding metrics: completion rate, avg time,
 * drop-off by step, avg step timings.
 */
router.get('/analytics/overview', basicAuth, authorize(['OWNER']), async (req, res) => {
    const startTime = process.hrtime.bigint();
    try {
        const metrics = await Analytics.getAggregateMetrics();

        // Detect drop-offs (default: 3 days stale)
        const staleDays = parseInt(req.query.staleDays) || 3;
        const dropoffs = await Analytics.detectDropoffs(staleDays);

        const durationMs = Math.round(Number(process.hrtime.bigint() - startTime) / 1e6 * 100) / 100;

        if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
            logger.slowQuery('SYSTEM', 'onboarding:analytics_overview', durationMs, SLOW_QUERY_THRESHOLD_MS);
        }

        res.json({
            ...metrics,
            recentDropoffs: dropoffs.slice(0, 20),
            _perf: { durationMs }
        });

    } catch (error) {
        console.error('[ANALYTICS] Overview Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /onboarding/:connectionId/analytics
 * Per-connection analytics: event timeline, step timings,
 * activation report.
 */
router.get('/:connectionId/analytics', basicAuth, authorize(['VIEWER', 'EDITOR', 'OWNER']), async (req, res) => {
    const startTime = process.hrtime.bigint();
    try {
        const { connectionId } = req.params;
        const report = await Analytics.getActivationReport(connectionId);

        if (!report) {
            return res.status(404).json({ error: 'Connection not found' });
        }

        // Fetch event timeline
        const connection = await Connection.findOne({ where: { connectionId } });
        const meta = connection?.onboardingMeta || {};
        const events = meta.events || [];

        const durationMs = Math.round(Number(process.hrtime.bigint() - startTime) / 1e6 * 100) / 100;

        if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
            logger.slowQuery(connectionId, 'onboarding:connection_analytics', durationMs, SLOW_QUERY_THRESHOLD_MS);
        }

        res.json({
            ...report,
            events: events.slice(-50), // Last 50 events
            _perf: { durationMs }
        });

    } catch (error) {
        console.error('[ANALYTICS] Connection Error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
