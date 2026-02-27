/**
 * OnboardingStateMachine.js
 * 
 * Strict state machine for the 6-step admin onboarding flow.
 * Enforces transition guards, optimistic locking, job locks,
 * transition logging, and launch immutability.
 *
 * PRODUCTION HARDENED — Step 8:
 * - Performance timing (process.hrtime)
 * - Structured logging (logger.onboardingTransition)
 * - Slow query detection (>500ms threshold)
 * - Event emission (OnboardingAnalytics.trackEvent)
 * - Step timing + activation analytics
 */

const logger = require('../utils/logger');
const SLOW_QUERY_THRESHOLD_MS = 500;

const STATES = {
    DRAFT: 'DRAFT',
    CONNECTED: 'CONNECTED',
    DISCOVERING: 'DISCOVERING',
    TRAINED: 'TRAINED',
    TUNED: 'TUNED',
    READY: 'READY',
    LAUNCHED: 'LAUNCHED'
};

const STATE_TO_STEP = {
    [STATES.DRAFT]: 1,
    [STATES.CONNECTED]: 2,
    [STATES.DISCOVERING]: 3,
    [STATES.TRAINED]: 4,
    [STATES.TUNED]: 5,
    [STATES.READY]: 6,
    [STATES.LAUNCHED]: 6
};

const STATE_TO_PATH = {
    [STATES.DRAFT]: '/setup/identity',
    [STATES.CONNECTED]: '/setup/discovery',
    [STATES.DISCOVERING]: '/setup/discovery',
    [STATES.TRAINED]: '/setup/behavior',
    [STATES.TUNED]: '/setup/verify',
    [STATES.READY]: '/setup/launch',
    [STATES.LAUNCHED]: '/dashboard'
};

const STALE_LOCK_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Allowed transitions map.
 * Key: "FROM->TO"
 * Value: { guard: async (connection) => { ok, reason }, isRollback }
 */
const TRANSITIONS = {
    // === Forward Path ===
    'DRAFT->CONNECTED': {
        guard: async (conn) => {
            if (!conn.websiteUrl || conn.websiteUrl.trim() === '') {
                return { ok: false, reason: 'Website URL is required before proceeding.' };
            }
            return { ok: true };
        },
        isRollback: false
    },

    'CONNECTED->DISCOVERING': {
        guard: async (conn) => {
            // Branding should be at least attempted
            if (!conn.websiteName || conn.websiteName.trim() === '') {
                return { ok: false, reason: 'Website name is required.' };
            }
            return { ok: true };
        },
        isRollback: false
    },

    'DISCOVERING->TRAINED': {
        guard: async (conn) => {
            // Must have at least 1 knowledge chunk
            const ConnectionKnowledge = require('../models/ConnectionKnowledge');
            const count = await ConnectionKnowledge.count({
                where: { connectionId: conn.connectionId, status: 'READY' }
            });
            if (count < 1) {
                return { ok: false, reason: 'At least 1 knowledge chunk must be extracted.' };
            }
            return { ok: true };
        },
        isRollback: false
    },

    'TRAINED->TUNED': {
        guard: async (conn) => {
            // Behavior profile must have at least one key set
            const bp = conn.behaviorProfile || {};
            if (Object.keys(bp).length === 0 && !conn.temperature && !conn.responseLength) {
                return { ok: false, reason: 'Behavior settings must be configured.' };
            }
            return { ok: true };
        },
        isRollback: false
    },

    'TUNED->READY': {
        guard: async (conn) => {
            // Must have at least 1 chat session (sandbox verification)
            const ChatSession = require('../models/ChatSession');
            const count = await ChatSession.count({
                where: { connectionId: conn.connectionId }
            });
            if (count < 1) {
                return { ok: false, reason: 'At least 1 test chat is required for verification.' };
            }
            return { ok: true };
        },
        isRollback: false
    },

    'READY->LAUNCHED': {
        guard: async (conn) => {
            if (conn.healthScore < 80) {
                return { ok: false, reason: `Health score must be ≥ 80%. Current: ${conn.healthScore}%` };
            }
            return { ok: true };
        },
        isRollback: false
    },

    // === Rollback Paths ===
    'DISCOVERING->CONNECTED': {
        guard: async () => ({ ok: true }),
        isRollback: true
    },

    'TRAINED->DISCOVERING': {
        guard: async () => ({ ok: true }),
        isRollback: true
    },

    'TUNED->TRAINED': {
        guard: async () => ({ ok: true }),
        isRollback: true
    },

    'READY->TUNED': {
        guard: async () => ({ ok: true }),
        isRollback: true
    }
};

// ============================================================
// Core State Machine
// ============================================================

class OnboardingStateMachine {

    /**
     * Attempt a state transition.
     * @param {object} connection - Sequelize Connection instance
     * @param {string} targetState - Target state
     * @param {object} options - { expectedVersion, meta }
     * @returns {{ success, connection, error, statusCode }}
     */
    static async transition(connection, targetState, options = {}) {
        const startTime = process.hrtime.bigint();
        const { expectedVersion, meta } = options;
        const currentState = connection.status;
        const transitionKey = `${currentState}->${targetState}`;
        const connId = connection.connectionId;

        // Lazy-load analytics to avoid circular dependencies
        const Analytics = require('./OnboardingAnalytics');

        // 1. Launch lock — nothing can change after LAUNCHED
        if (currentState === STATES.LAUNCHED) {
            const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;
            logger.onboardingTransition(connId, currentState, targetState, durationMs, {
                result: 'BLOCKED', reason: 'LAUNCHED_LOCK'
            });
            Analytics.trackEvent(connection, 'BLOCKED_LAUNCHED', { targetState }).catch(() => { });
            return {
                success: false,
                error: 'Connection is LAUNCHED and locked. No further state changes allowed.',
                statusCode: 423
            };
        }

        // 2. Check if transition is defined
        const rule = TRANSITIONS[transitionKey];
        if (!rule) {
            const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;
            logger.onboardingTransition(connId, currentState, targetState, durationMs, {
                result: 'INVALID', reason: 'UNDEFINED_TRANSITION'
            });
            Analytics.trackEvent(connection, 'INVALID_TRANSITION', {
                from: currentState, to: targetState
            }).catch(() => { });
            return {
                success: false,
                error: `Invalid transition: ${currentState} → ${targetState}. Not allowed.`,
                statusCode: 400
            };
        }

        // 3. Optimistic locking — version check
        if (expectedVersion !== undefined && expectedVersion !== null) {
            if (connection.version !== expectedVersion) {
                const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;
                logger.onboardingTransition(connId, currentState, targetState, durationMs, {
                    result: 'VERSION_CONFLICT',
                    expectedVersion, actualVersion: connection.version
                });
                Analytics.trackEvent(connection, 'VERSION_CONFLICT', {
                    from: currentState, to: targetState,
                    expected: expectedVersion, actual: connection.version
                }).catch(() => { });
                return {
                    success: false,
                    error: `Version conflict. Expected v${expectedVersion}, but current is v${connection.version}. Refresh and retry.`,
                    statusCode: 409
                };
            }
        }

        // 4. Check job lock (only for forward transitions)
        if (!rule.isRollback) {
            const lockCheck = this.checkLock(connection);
            if (!lockCheck.ok) {
                const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;
                logger.onboardingTransition(connId, currentState, targetState, durationMs, {
                    result: 'LOCKED', lockedBy: connection.stateLockedBy
                });
                Analytics.trackEvent(connection, 'LOCK_BLOCKED', {
                    from: currentState, to: targetState,
                    lockedBy: connection.stateLockedBy
                }).catch(() => { });
                return {
                    success: false,
                    error: lockCheck.reason,
                    statusCode: 423
                };
            }
        }

        // 5. Run guard
        const guardResult = await rule.guard(connection);
        if (!guardResult.ok) {
            const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;
            logger.onboardingTransition(connId, currentState, targetState, durationMs, {
                result: 'GUARD_FAILED', reason: guardResult.reason
            });
            Analytics.trackEvent(connection, 'GUARD_FAILED', {
                from: currentState, to: targetState,
                reason: guardResult.reason
            }).catch(() => { });
            return {
                success: false,
                error: guardResult.reason,
                statusCode: 422
            };
        }

        // 6. Perform transition
        const previousState = currentState;
        const previousStep = connection.onboardingStep;
        const newStep = STATE_TO_STEP[targetState] || previousStep;

        // Calculate step timing: time spent in the previous state
        let stepDurationMs = null;
        if (connection.lastActivityAt) {
            stepDurationMs = Date.now() - new Date(connection.lastActivityAt).getTime();
        }

        const updatePayload = {
            status: targetState,
            onboardingStep: newStep,
            version: connection.version + 1,
            lastActivityAt: new Date()
        };

        // Launch-specific updates
        if (targetState === STATES.LAUNCHED) {
            updatePayload.onboardingCompletedAt = new Date();
            updatePayload.launchStatus = 'LAUNCHED';
        }

        // Merge meta into onboardingMeta
        if (meta) {
            updatePayload.onboardingMeta = { ...(connection.onboardingMeta || {}), ...meta };
        }

        // Clear job lock on successful transition
        updatePayload.stateLockedBy = null;
        updatePayload.stateLockedAt = null;

        await connection.update(updatePayload);

        // 7. Performance metrics
        const durationMs = Math.round(Number(process.hrtime.bigint() - startTime) / 1e6 * 100) / 100;
        const direction = rule.isRollback ? 'ROLLBACK' : 'FORWARD';

        // Structured transition log
        logger.onboardingTransition(connId, previousState, targetState, durationMs, {
            result: 'SUCCESS', direction,
            previousStep, newStep,
            version: connection.version,
            stepDurationMs
        });

        // Slow query detection
        if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
            logger.slowQuery(connId, `transition:${transitionKey}`, durationMs, SLOW_QUERY_THRESHOLD_MS);
        }

        // Event tracking (fire-and-forget)
        Analytics.trackEvent(connection, direction === 'ROLLBACK' ? 'ROLLBACK' : 'TRANSITION', {
            from: previousState, to: targetState,
            durationMs, stepDurationMs
        }).catch(() => { });

        // Step timing tracking
        if (stepDurationMs !== null && previousStep) {
            Analytics.trackStepTiming(connection, previousStep, stepDurationMs).catch(() => { });
        }

        // Activation analytics — log when onboarding completes
        if (targetState === STATES.LAUNCHED) {
            const totalDurationMs = connection.onboardingCompletedAt && connection.createdAt
                ? new Date(connection.onboardingCompletedAt).getTime() - new Date(connection.createdAt).getTime()
                : null;
            const stepTimings = (connection.onboardingMeta || {}).stepTimings || {};
            if (totalDurationMs) {
                logger.onboardingActivation(connId, totalDurationMs, stepTimings);
            }
        }

        return {
            success: true,
            connection,
            previousState,
            newState: targetState,
            step: newStep,
            version: connection.version,
            durationMs
        };
    }

    /**
     * Check if a transition is possible (read-only, no side effects).
     */
    static async canTransition(connection, targetState) {
        const transitionKey = `${connection.status}->${targetState}`;

        if (connection.status === STATES.LAUNCHED) {
            return { allowed: false, reason: 'Connection is LAUNCHED and locked.' };
        }

        const rule = TRANSITIONS[transitionKey];
        if (!rule) {
            return { allowed: false, reason: `Transition ${transitionKey} is not defined.` };
        }

        const guardResult = await rule.guard(connection);
        return { allowed: guardResult.ok, reason: guardResult.reason || null };
    }

    /**
     * Get the wizard step number for a given state.
     */
    static getStepForState(state) {
        return STATE_TO_STEP[state] || 1;
    }

    /**
     * Get the UI path for a given state (resume logic).
     */
    static getPathForState(state) {
        return STATE_TO_PATH[state] || '/setup/identity';
    }

    /**
     * Acquire a job lock on the connection.
     */
    static async acquireLock(connection, jobName) {
        const lockCheck = this.checkLock(connection);

        // If locked by a non-stale job, reject
        if (connection.stateLockedBy && !lockCheck.stale) {
            logger.warn(`LOCK_DENIED: ${connection.connectionId} already locked by ${connection.stateLockedBy}`, {
                connectionId: connection.connectionId, lockedBy: connection.stateLockedBy, type: 'onboarding_lock'
            });
            return {
                acquired: false,
                reason: `Locked by job: ${connection.stateLockedBy}`
            };
        }

        // Acquire
        await connection.update({
            stateLockedBy: jobName,
            stateLockedAt: new Date()
        });

        logger.info(`LOCK_ACQUIRED: ${connection.connectionId} by ${jobName}`, {
            connectionId: connection.connectionId, jobName, type: 'onboarding_lock'
        });
        return { acquired: true };
    }

    /**
     * Release the job lock.
     */
    static async releaseLock(connection) {
        const who = connection.stateLockedBy;
        await connection.update({
            stateLockedBy: null,
            stateLockedAt: null
        });
        logger.info(`LOCK_RELEASED: ${connection.connectionId} (was: ${who})`, {
            connectionId: connection.connectionId, releasedJob: who, type: 'onboarding_lock'
        });
    }

    /**
     * Check if the connection is locked and whether the lock is stale.
     */
    static checkLock(connection) {
        if (!connection.stateLockedBy) {
            return { ok: true, locked: false, stale: false };
        }

        const lockAge = Date.now() - new Date(connection.stateLockedAt).getTime();
        const isStale = lockAge > STALE_LOCK_MS;

        if (isStale) {
            logger.warn(`LOCK_STALE: ${connection.connectionId} lock by ${connection.stateLockedBy} expired (${Math.round(lockAge / 60000)}m)`, {
                connectionId: connection.connectionId, lockedBy: connection.stateLockedBy,
                lockAgeMinutes: Math.round(lockAge / 60000), type: 'onboarding_lock'
            });
            return { ok: true, locked: true, stale: true };
        }

        return {
            ok: false,
            locked: true,
            stale: false,
            reason: `State is locked by job: ${connection.stateLockedBy}. Try again later.`
        };
    }

    /**
     * Get all valid next states for the current connection.
     */
    static getValidNextStates(connection) {
        const current = connection.status;
        if (current === STATES.LAUNCHED) return [];

        return Object.keys(TRANSITIONS)
            .filter(key => key.startsWith(`${current}->`))
            .map(key => {
                const target = key.split('->')[1];
                const rule = TRANSITIONS[key];
                return { state: target, isRollback: rule.isRollback };
            });
    }
}

// Export everything
OnboardingStateMachine.STATES = STATES;
OnboardingStateMachine.STATE_TO_STEP = STATE_TO_STEP;
OnboardingStateMachine.STATE_TO_PATH = STATE_TO_PATH;

module.exports = OnboardingStateMachine;
