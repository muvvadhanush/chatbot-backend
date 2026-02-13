const dns = require('dns');
// Force IPv4 to avoid ENOTFOUND on some Windows/Node setups with Supabase
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {
  // ignore
}

process.on("uncaughtException", (err) => {
  console.error("🔥 UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("🔥 UNHANDLED REJECTION:", reason);
});

require("dotenv").config();
const settings = require("./config/settings");
const logger = require("./utils/logger");
const express = require("express");
const cors = require("cors");

const sequelize = require("./config/db");
const chatRoutes = require("./routes/chatRoutes");
const connectionRoutes = require("./routes/connectionRoutes");
const widgetRoutes = require("./routes/widgetRoutes");
const adminRoutes = require("./routes/adminRoutes");
const Idea = require("./models/Idea");
const Connection = require("./models/Connection");
const ConnectionKnowledge = require("./models/ConnectionKnowledge");
const PendingExtraction = require("./models/PendingExtraction");
const User = require("./models/User");
const ConnectionCrawlSession = require("./models/ConnectionCrawlSession");
const ConnectionDiscovery = require("./models/ConnectionDiscovery");

// Associations
Connection.hasMany(ConnectionKnowledge, { foreignKey: 'connectionId', sourceKey: 'connectionId' });
ConnectionKnowledge.belongsTo(Connection, { foreignKey: 'connectionId', targetKey: 'connectionId' });
Connection.hasMany(PendingExtraction, { foreignKey: 'connectionId', sourceKey: 'connectionId' });
PendingExtraction.belongsTo(Connection, { foreignKey: 'connectionId', targetKey: 'connectionId' });

Connection.hasMany(ConnectionCrawlSession, { foreignKey: 'connectionId', sourceKey: 'connectionId' });
ConnectionCrawlSession.belongsTo(Connection, { foreignKey: 'connectionId', targetKey: 'connectionId' });

Connection.hasMany(ConnectionDiscovery, { foreignKey: 'connectionId', sourceKey: 'connectionId' });
ConnectionDiscovery.belongsTo(Connection, { foreignKey: 'connectionId', targetKey: 'connectionId' });

const PageContent = require("./models/PageContent");
const ManualUpload = require("./models/ManualUpload");

// PageContent Associations
Connection.hasMany(PageContent, { foreignKey: 'connectionId', sourceKey: 'connectionId' });
PageContent.belongsTo(Connection, { foreignKey: 'connectionId', targetKey: 'connectionId' });

// PendingExtraction Association to PageContent
// PendingExtraction Association to PageContent
PageContent.hasMany(PendingExtraction, { foreignKey: 'pageContentId', sourceKey: 'id' });
PendingExtraction.belongsTo(PageContent, { foreignKey: 'pageContentId', targetKey: 'id' });

const app = express();

// 2.1 Request Id & Logging (PR-5)
const requestLogger = require("./middleware/requestLogger");
app.use(requestLogger);

// CORS - Allow all origins with explicit headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('X-Content-Type-Options', 'nosniff');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(express.json());

// 4. Standard Error Handler (Must be last)
const errorHandler = require("./middleware/errorHandler");
// We need to mount this AFTER all routes. so I will place it at the end of the file.
// But wait, the JSON error handler should be early?
// The user instruction said "Create standardized error responses".
// The existing JSON error handler was for syntax errors. My new handler covers that.
// But middleware order matters. 
// Standard error handler usually goes at the *end*.
// Middleware for catching 404s goes before it.
// JSON parser is early. If it fails, it calls next(err).
// So I should put errorHandler at the very end of app.js.

// Serve static files (widget)
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

// ROOT ROUTE
app.get("/", (req, res) => {
  res.redirect("/admin");
});

const limiters = require("./middleware/rateLimiter");

// ROUTES
// 1. Internal / Health
app.get("/health", limiters.systemHealth, (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "chatbot-backend",
    timestamp: new Date().toISOString(),
  });
});

// 2. V1 API Router
const v1Router = require("./routes/v1");
app.use("/api/v1", v1Router);

// 3. Legacy Route Warning (Blocker)
app.use("/api", (req, res, next) => {
  // If it didn't match /api/v1, it falls through here (or if it's /api/chat etc)
  // But express routing matches /api/v1 first if defined first? 
  // Actually, /api matches /api/v1 too if we aren't careful? 
  // Express router matches strictly in order.
  // If we mount /api/v1 First, it handles those.
  // Then we mount /api... warning.

  // Check if it's a static file or something else? No, purely API.
  if (req.path.startsWith("/v1")) {
    return next();
  }

  res.status(410).json({
    error: "API_VERSION_REQUIRED",
    message: "This API endpoint has moved. Please migrate to /api/v1"
  });
});

// ADMIN PANEL (Protected)
const basicAuth = require("./middleware/auth");
app.get("/admin", basicAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "admin.html"));
});

// ERROR HANDLER (Last Middleware)
app.use((req, res, next) => {
  // 404 Handler
  const requestId = req.requestId || require('uuid').v4(); // Fallback if middleware failed
  logger.warn(`404 Not Found: ${req.method} ${req.originalUrl}`, { requestId });

  res.status(404).json({
    error: "NOT_FOUND",
    message: "Resource not found",
    requestId: requestId
  });
});
app.use(require("./middleware/errorHandler"));

// DATABASE STARTUP & BACKGROUND SYNC
const PORT = settings.port;

sequelize.authenticate()
  .then(async () => {
    console.log("✅ Database connected successfully.");

    // Check for pending migrations
    // In production, we assume migrations are run via deployment pipeline.
    // Locally, we might want to warn.
    // const { Umzug, SequelizeStorage } = require('umzug'); 

    // Actually, running full umzug check here might require more deps.
    // For now, let's just log and trust the migration process.
    console.log("🛡️ Schema Lock Active: sequelize.sync() is DISABLED.");

    app.listen(PORT, () => {
      console.log(`🚀 Server bound to port ${PORT} [Env: ${settings.env}]`);
      console.log(`📡 Health check: http://localhost:${PORT}/health`);

      // Keep keep-alive logic?
      // Yes, if needed.
    });
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err);
    process.exit(1);
  });

// KEEP PROCESS ALIVE (Windows safety)
setInterval(() => { }, 1000);
