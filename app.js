// ===== DNS IPv4 Enforcement ===== // Restart 2
const dns = require("dns");
try {
  dns.setDefaultResultOrder("ipv4first");
} catch (e) { }

// ===== Global Process Safety =====
process.on("uncaughtException", (err) => {
  console.error("🔥 UNCAUGHT EXCEPTION:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("🔥 UNHANDLED REJECTION:", reason);
  process.exit(1);
});

// ===== Core Imports =====
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const settings = require("./config/settings");
const logger = require("./utils/logger");
const sequelize = require("./config/db");
require("./models"); // Initialize Associations

// ===== Initialize App =====
const app = express();

// ===== Request ID + Logging =====
const requestLogger = require("./middleware/requestLogger");
app.use(requestLogger);

// ===== Secure CORS Configuration =====
const allowedOrigins = settings.allowedOrigins || [];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || settings.env === 'development') return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    logger.warn(`CORS Blocked: Origin "${origin}" is not in allowed list.`, { allowedOrigins });
    return callback(new Error("CORS_NOT_ALLOWED"));
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Security Headers
app.use(helmet({
  hsts: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://cdn-icons-png.flaticon.com", "https://*.flaticon.com"],
      connectSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"]
    }
  },
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use((req, res, next) => {
  // Custom headers if needed (Helmet covers most)
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

// ===== Body Parser =====
app.use(express.json({ limit: "1mb" }));

// ===== Static Files =====
app.use(express.static(path.join(__dirname, "public")));

// ===== Root Redirect =====
app.get("/", (req, res) => {
  res.redirect("/admin");
});

// ===== Health Endpoint =====
const rateLimiter = require("./middleware/rateLimiter");

app.get("/health", rateLimiter.systemHealth || ((req, res, next) => next()), (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "chatbot-backend",
    environment: settings.env,
    timestamp: new Date().toISOString(),
  });
});

// ===== API Versioning =====
const v1Router = require("./routes/v1");
app.use("/api/v1", v1Router);

// ===== Admin Panel Routes =====
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "admin.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "login.html"));
});

// ===== 404 Handler =====
app.use((req, res) => {
  const requestId = req.requestId || uuidv4();
  logger.warn(`404 Not Found: ${req.method} ${req.originalUrl}`, { requestId });

  res.status(404).json({
    error: "NOT_FOUND",
    message: "Resource not found",
    requestId,
  });
});

// ===== Central Error Handler =====
const errorHandler = require("./middleware/errorHandler");
app.use(errorHandler);

// ===== Database & Server Startup =====
const PORT = settings.port;

sequelize.authenticate()
  .then(() => {
    console.log("✅ Database connected successfully.");
    console.log("🛡️ Schema Lock Active: sequelize.sync() DISABLED.");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT} [${settings.env}]`);
      console.log(`📡 Health: http://localhost:${PORT}/health`);
    });
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err);
    process.exit(1);
  });
