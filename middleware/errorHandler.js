const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

const errorHandler = (err, req, res, next) => {
    const requestId = req.requestId || req.headers['x-request-id'] || uuidv4();

    logger.error(`Error: ${err.message}`, {
        requestId,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method
    });

    console.error(`System Error [${requestId}]:`, err.message);

    // Default to 500
    let statusCode = err.status || 500;
    let errorCode = err.code || "INTERNAL_SERVER_ERROR";
    let message = err.message || "An unexpected error occurred.";

    // Handle known types
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        statusCode = 400;
        errorCode = "INVALID_JSON";
        message = "Malformed JSON body.";
    }

    if (res.headersSent) {
        return next(err);
    }

    res.status(statusCode).json({
        error: errorCode,
        message: message,
        requestId: requestId
    });
};

module.exports = errorHandler;
