const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const requestLogger = (req, res, next) => {
    req.requestId = req.headers['x-request-id'] || uuidv4();
    res.setHeader('X-Request-ID', req.requestId);

    const startTime = Date.now();

    res.on('finish', () => {
        try {
            const duration = Date.now() - startTime;

            const level =
                res.statusCode >= 500 ? 'error' :
                    res.statusCode >= 400 ? 'warn' :
                        'info';

            const connectionId =
                req.body?.connectionId ||
                req.params?.connectionId ||
                req.headers['x-connection-id'] ||
                'SYSTEM';

            logger.log({
                level,
                message: `${req.method} ${req.originalUrl}`,
                requestId: req.requestId,
                status: res.statusCode,
                duration: `${duration}ms`,
                ip: req.ip,
                userAgent: req.get('user-agent'),
                connectionId
            });
        } catch (err) {
            console.warn('requestLogger skipped:', err.message);
        }
    });

    next();
};

module.exports = requestLogger;
