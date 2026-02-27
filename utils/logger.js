const winston = require('winston');
const path = require('path');

// Custom format for human readability in development
const devFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
});

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
        winston.format.json()
    ),
    transports: [
        // Consolidate all logs into combined.log
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // Errors only in error.log
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/error.log'),
            level: 'error',
            maxsize: 5242880,
            maxFiles: 5
        })
    ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            devFormat
        )
    }));
}

/**
 * Specialized loggers for Neural Bot metrics
 */

// AI Latency & Performance
logger.aiMetric = (connectionId, metric, durationMs, metadata = {}) => {
    logger.info(`AI_METRIC: ${metric}`, {
        connectionId,
        metric,
        durationMs,
        ...metadata,
        type: 'performance'
    });
};

// Token Usage & Cost Control
logger.tokenUsage = (connectionId, model, tokens, metadata = {}) => {
    logger.info(`TOKEN_USAGE: ${model}`, {
        connectionId,
        model,
        tokens,
        ...metadata,
        type: 'billing'
    });
};

// RAG Retrieval Monitoring
logger.retrieval = (connectionId, query, hitsCount, topScore, metadata = {}) => {
    logger.info(`RAG_RETRIEVAL`, {
        connectionId,
        query,
        hitsCount,
        topScore,
        ...metadata,
        type: 'retrieval'
    });
};

// ============================================================
// Onboarding Production Metrics
// ============================================================

// State transition events (success + failure)
logger.onboardingTransition = (connectionId, from, to, durationMs, metadata = {}) => {
    logger.info(`ONBOARDING_TRANSITION: ${from} → ${to}`, {
        connectionId,
        from,
        to,
        durationMs,
        ...metadata,
        type: 'onboarding_transition'
    });
};

// Slow query / slow operation warnings
logger.slowQuery = (connectionId, operation, durationMs, thresholdMs = 500) => {
    logger.warn(`SLOW_QUERY: ${operation} took ${durationMs}ms (threshold: ${thresholdMs}ms)`, {
        connectionId,
        operation,
        durationMs,
        thresholdMs,
        exceededBy: durationMs - thresholdMs,
        type: 'slow_query'
    });
};

// Drop-off detection — connection stale in non-LAUNCHED state
logger.onboardingDropoff = (connectionId, lastState, staleDays, metadata = {}) => {
    logger.warn(`ONBOARDING_DROPOFF: ${connectionId} stuck at ${lastState} for ${staleDays} days`, {
        connectionId,
        lastState,
        staleDays,
        ...metadata,
        type: 'onboarding_dropoff'
    });
};

// Activation success — full onboarding completed
logger.onboardingActivation = (connectionId, totalDurationMs, stepDurations = {}) => {
    logger.info(`ONBOARDING_ACTIVATION: ${connectionId} completed in ${totalDurationMs}ms`, {
        connectionId,
        totalDurationMs,
        stepDurations,
        type: 'onboarding_activation'
    });
};

module.exports = logger;
