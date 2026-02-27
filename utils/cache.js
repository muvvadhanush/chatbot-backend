const { createClient } = require("redis");
const logger = require("../utils/logger");

let redisClient = null;
let isConnected = false;

// Export wrapper immediately
const cacheWrapper = {
    get: async (key) => {
        if (!connected()) return null;
        try {
            return await redisClient.get(key);
        } catch (e) {
            return null;
        }
    },

    set: async (key, value, options) => {
        if (!connected()) return;
        try {
            await redisClient.set(key, value, options);
        } catch (e) {
            // Ignore cache write errors
        }
    },

    del: async (key) => {
        if (!connected()) return;
        try {
            await redisClient.del(key);
        } catch (e) {
            // Ignore
        }
    },

    getOrSet: async (key, ttlSeconds, factoryFn) => {
        // 1. Try Cache
        if (connected()) {
            try {
                const cached = await redisClient.get(key);
                if (cached) {
                    try {
                        return JSON.parse(cached);
                    } catch (e) {
                        return cached;
                    }
                }
            } catch (e) {
                logger.warn(`Cache read failed for ${key}`, { error: e.message });
            }
        }

        // 2. Refresh / Execute
        const result = await factoryFn();

        // 3. Set Cache (Async, don't block)
        if (connected() && result !== undefined && result !== null) {
            try {
                const val = typeof result === 'object' ? JSON.stringify(result) : String(result);
                // Don't await - fire and forget
                redisClient.set(key, val, { EX: ttlSeconds }).catch(e => {
                    logger.warn(`Cache write failed for ${key}`, { error: e.message });
                });
            } catch (e) {
                logger.warn(`Cache serialization failed for ${key}`, { error: e.message });
            }
        }

        return result;
    }
};

module.exports = cacheWrapper;

// Initialize Redis
if (process.env.REDIS_ENABLED === "true") {
    redisClient = createClient({
        url: process.env.REDIS_URL
    });

    redisClient.on("error", (err) => {
        logger.error("Redis Client Error", { error: err.message });
        isConnected = false;
    });

    redisClient.connect()
        .then(() => {
            logger.info("✅ Redis Connected");
            isConnected = true;
        })
        .catch((err) => {
            logger.error("Redis Connection Failed", { error: err.message });
            redisClient = null;
            isConnected = false;
        });
} else {
    // logger.info("🛑 Redis Disabled (REDIS_ENABLED=false)");
}

function connected() {
    return redisClient && isConnected && redisClient.isOpen;
}
