/**
 * jobLock.js
 * 
 * Express middleware that prevents double-execution of async jobs
 * by checking and acquiring job locks on the Connection.
 * 
 * Usage:
 *   const jobLock = require('../middleware/jobLock');
 *   router.post('/discovery', jobLock('discovery'), async (req, res) => { ... });
 */

const Connection = require('../models/Connection');
const StateMachine = require('../services/OnboardingStateMachine');

const jobLock = (jobPrefix) => {
    return async (req, res, next) => {
        try {
            const connectionId = req.params.connectionId || req.params.id || req.body.connectionId;

            if (!connectionId) {
                return res.status(400).json({ error: 'connectionId is required for job lock.' });
            }

            const connection = await Connection.findOne({ where: { connectionId } });
            if (!connection) {
                return res.status(404).json({ error: 'Connection not found.' });
            }

            // Generate unique job name
            const jobName = `${jobPrefix}:${Date.now()}`;

            // Attempt to acquire lock
            const lockResult = await StateMachine.acquireLock(connection, jobName);

            if (!lockResult.acquired) {
                console.warn(`🔒 [JOB_LOCK] BLOCKED: ${connectionId} - ${lockResult.reason}`);
                return res.status(423).json({
                    error: 'Job already in progress.',
                    detail: lockResult.reason
                });
            }

            // Store reference for cleanup
            req._jobLock = { connectionId, jobName };

            // Auto-release lock when response finishes
            res.on('finish', async () => {
                try {
                    const conn = await Connection.findOne({ where: { connectionId } });
                    if (conn && conn.stateLockedBy === jobName) {
                        await StateMachine.releaseLock(conn);
                    }
                } catch (e) {
                    console.error(`[JOB_LOCK] Auto-release failed for ${connectionId}:`, e.message);
                }
            });

            next();

        } catch (error) {
            console.error('[JOB_LOCK] Middleware Error:', error);
            res.status(500).json({ error: 'Job lock error: ' + error.message });
        }
    };
};

module.exports = jobLock;
