/**
 * OnboardingAnalytics.js
 *
 * Production analytics for the onboarding funnel.
 * Tracks events, step timings, drop-offs, and activation metrics.
 */

const { Op } = require('sequelize');
const Connection = require('../models/Connection');
const logger = require('../utils/logger');

// Max events to keep per connection (ring buffer)
const MAX_EVENTS = 200;

class OnboardingAnalytics {

    /**
     * Track an onboarding event and persist to onboardingMeta.events[].
     * @param {object} connection - Sequelize Connection instance
     * @param {string} event - Event name (e.g. TRANSITION, GUARD_FAILED, LOCK_ACQUIRED)
     * @param {object} data - Event-specific data
     */
    static async trackEvent(connection, event, data = {}) {
        try {
            const meta = connection.onboardingMeta || {};
            const events = meta.events || [];

            events.push({
                event,
                ...data,
                at: new Date().toISOString()
            });

            // Ring buffer — keep last MAX_EVENTS
            if (events.length > MAX_EVENTS) {
                events.splice(0, events.length - MAX_EVENTS);
            }

            meta.events = events;
            connection.onboardingMeta = meta;
            await connection.update({ onboardingMeta: meta });
        } catch (err) {
            // Analytics should never break core flow
            console.error('[ANALYTICS] trackEvent error:', err.message);
        }
    }

    /**
     * Record step timing (time spent in a step before transitioning).
     * @param {object} connection - Sequelize Connection instance
     * @param {number} step - Step number (1-6)
     * @param {number} durationMs - Duration in milliseconds
     */
    static async trackStepTiming(connection, step, durationMs) {
        try {
            const meta = connection.onboardingMeta || {};
            const timings = meta.stepTimings || {};

            timings[String(step)] = durationMs;
            meta.stepTimings = timings;
            connection.onboardingMeta = meta;
            await connection.update({ onboardingMeta: meta });
        } catch (err) {
            console.error('[ANALYTICS] trackStepTiming error:', err.message);
        }
    }

    /**
     * Detect drop-offs: connections stuck in non-LAUNCHED states.
     * @param {number} staleDays - Days of inactivity threshold (default: 3)
     * @returns {Array} List of dropped-off connections
     */
    static async detectDropoffs(staleDays = 3) {
        try {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - staleDays);

            const staleConnections = await Connection.findAll({
                where: {
                    status: { [Op.notIn]: ['LAUNCHED', 'DRAFT'] },
                    lastActivityAt: { [Op.lt]: cutoff }
                },
                attributes: ['connectionId', 'status', 'onboardingStep', 'lastActivityAt', 'createdAt'],
                order: [['lastActivityAt', 'ASC']]
            });

            // Log each drop-off
            for (const conn of staleConnections) {
                const daysSinceActivity = Math.floor(
                    (Date.now() - new Date(conn.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24)
                );
                logger.onboardingDropoff(conn.connectionId, conn.status, daysSinceActivity, {
                    step: conn.onboardingStep,
                    lastActivity: conn.lastActivityAt
                });
            }

            return staleConnections.map(c => ({
                connectionId: c.connectionId,
                status: c.status,
                step: c.onboardingStep,
                lastActivity: c.lastActivityAt,
                staleDays: Math.floor(
                    (Date.now() - new Date(c.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24)
                )
            }));
        } catch (err) {
            console.error('[ANALYTICS] detectDropoffs error:', err.message);
            return [];
        }
    }

    /**
     * Get activation report for a single connection.
     * @param {string} connectionId
     * @returns {object} Activation metrics
     */
    static async getActivationReport(connectionId) {
        try {
            const connection = await Connection.findOne({ where: { connectionId } });
            if (!connection) return null;

            const meta = connection.onboardingMeta || {};
            const events = meta.events || [];
            const stepTimings = meta.stepTimings || {};

            // Total onboarding duration: createdAt → onboardingCompletedAt
            const totalDurationMs = connection.onboardingCompletedAt
                ? new Date(connection.onboardingCompletedAt).getTime() - new Date(connection.createdAt).getTime()
                : null;

            // Count transitions, guard failures, lock events
            const transitionCount = events.filter(e => e.event === 'TRANSITION').length;
            const guardFailures = events.filter(e => e.event === 'GUARD_FAILED').length;
            const rollbacks = events.filter(e => e.event === 'ROLLBACK').length;

            return {
                connectionId,
                status: connection.status,
                isActivated: connection.status === 'LAUNCHED',
                totalDurationMs,
                totalDurationHuman: totalDurationMs ? formatDuration(totalDurationMs) : null,
                stepTimings,
                transitionCount,
                guardFailures,
                rollbacks,
                eventCount: events.length,
                createdAt: connection.createdAt,
                completedAt: connection.onboardingCompletedAt
            };
        } catch (err) {
            console.error('[ANALYTICS] getActivationReport error:', err.message);
            return null;
        }
    }

    /**
     * System-wide aggregate metrics.
     * @returns {object} Aggregate onboarding metrics
     */
    static async getAggregateMetrics() {
        try {
            // Total connections by status
            const allConnections = await Connection.findAll({
                attributes: ['connectionId', 'status', 'onboardingStep', 'createdAt',
                    'onboardingCompletedAt', 'lastActivityAt', 'onboardingMeta']
            });

            const total = allConnections.length;
            const launched = allConnections.filter(c => c.status === 'LAUNCHED').length;
            const completionRate = total > 0 ? ((launched / total) * 100).toFixed(1) : 0;

            // Status breakdown
            const statusBreakdown = {};
            for (const c of allConnections) {
                statusBreakdown[c.status] = (statusBreakdown[c.status] || 0) + 1;
            }

            // Average completion time (for LAUNCHED connections)
            const launchedConns = allConnections.filter(c => c.status === 'LAUNCHED' && c.onboardingCompletedAt);
            let avgCompletionMs = 0;
            if (launchedConns.length > 0) {
                const totalMs = launchedConns.reduce((sum, c) => {
                    return sum + (new Date(c.onboardingCompletedAt).getTime() - new Date(c.createdAt).getTime());
                }, 0);
                avgCompletionMs = totalMs / launchedConns.length;
            }

            // Drop-off by step (non-LAUNCHED, inactive > 3 days)
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 3);
            const dropoffs = allConnections.filter(c =>
                c.status !== 'LAUNCHED' && c.status !== 'DRAFT' &&
                c.lastActivityAt && new Date(c.lastActivityAt) < cutoff
            );
            const dropoffByStep = {};
            for (const c of dropoffs) {
                const step = c.onboardingStep || 0;
                dropoffByStep[step] = (dropoffByStep[step] || 0) + 1;
            }

            // Avg step timings across all connections
            const avgStepTimings = {};
            const stepCounts = {};
            for (const c of allConnections) {
                const timings = (c.onboardingMeta || {}).stepTimings || {};
                for (const [step, ms] of Object.entries(timings)) {
                    avgStepTimings[step] = (avgStepTimings[step] || 0) + ms;
                    stepCounts[step] = (stepCounts[step] || 0) + 1;
                }
            }
            for (const step of Object.keys(avgStepTimings)) {
                avgStepTimings[step] = Math.round(avgStepTimings[step] / stepCounts[step]);
            }

            return {
                total,
                launched,
                completionRate: `${completionRate}%`,
                statusBreakdown,
                avgCompletionMs: Math.round(avgCompletionMs),
                avgCompletionHuman: formatDuration(avgCompletionMs),
                dropoffs: dropoffs.length,
                dropoffByStep,
                avgStepTimings
            };
        } catch (err) {
            console.error('[ANALYTICS] getAggregateMetrics error:', err.message);
            return { error: err.message };
        }
    }
}

/**
 * Format ms to human-readable string.
 */
function formatDuration(ms) {
    if (!ms || ms <= 0) return '0s';
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ${secs % 60}s`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ${mins % 60}m`;
    const days = Math.floor(hrs / 24);
    return `${days}d ${hrs % 24}h`;
}

module.exports = OnboardingAnalytics;
