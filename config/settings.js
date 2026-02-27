require('dotenv').config();

// Force production mode if NODE_ENV is not explicitly set
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const validEnvironments = ['development', 'staging', 'production'];
const env = process.env.NODE_ENV;

// 1. Fail Fast on Invalid Environment
if (!validEnvironments.includes(env)) {
    console.error(`
    🛑 CRITICAL ERROR: Invalid NODE_ENV "${env}"
    Allowed values: ${validEnvironments.join(', ')}
    
    Fix: set NODE_ENV=development|staging|production
  `);
    process.exit(1);
}

console.log(`🚦 Environment: ${env.toUpperCase()}`);

const settings = {
    env,
    port: process.env.PORT || 5000,
    jwtSecret: process.env.JWT_SECRET || "dev_secret_key_change_in_prod",

    // 2. Database Config (Delegated to Sequelize)
    db: {
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        dialect: 'postgres',
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    },

    // 3. Environment-Scoped Defaults
    features: {
        aiEnabled: process.env.AI_ENABLED === 'true' || true, // Default ON

        // Extraction: Default ON (unless explicitly disabled)
        extractionEnabled: process.env.EXTRACTION_ENABLED !== 'false',

        // Widget: ON in dev, LIMITED in staging, OFF in prod (auto-features)
        widgetAutoFeatures: process.env.WIDGET_ENABLED === 'true' || (env === 'development')
    },

    // 4. Rate Limiting (Windows in ms)
    rateLimits: {
        widget: {
            chat: { windowMs: 60 * 1000, max: 60 }, // 60 per min
            extraction: { windowMs: 24 * 60 * 60 * 1000, max: 50 }, // 50 per day (Increased for testing)
        },
        admin: {
            actions: { windowMs: 60 * 1000, max: 30 }, // 30 per min
            auth: { windowMs: 60 * 60 * 1000, max: 20 } // 20 per hour (login attempts)
        },
        system: {
            health: { windowMs: 60 * 1000, max: 100 } // High limit for monitoring
        }
    },

    // 5. Logging Levels
    logging: {
        development: 'verbose',
        staging: 'info',
        production: 'warn'
    }[env],

    // 6. CORS Configuration
    allowedOrigins: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : [
            'http://localhost:3000',
            'http://localhost:5000',
            'http://localhost:5001',
            'http://localhost:5173',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:5000',
            'http://127.0.0.1:5001',
            'http://127.0.0.1:5173'
        ]
};

// Log Configuration (Sanitized)
const sanitizedSettings = { ...settings, db: { ...settings.db, password: '***' } };
console.log("⚙️  Active Configuration:", JSON.stringify(sanitizedSettings, null, 2));

module.exports = settings;
