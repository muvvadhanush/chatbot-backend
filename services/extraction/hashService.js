const crypto = require('crypto');

function hashContent(text) {
    if (!text) return null;
    return crypto
        .createHash('sha256')
        .update(text)
        .digest('hex');
}

module.exports = { hashContent };
