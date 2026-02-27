const express = require("express");
const router = express.Router();
const limiters = require("../../middleware/rateLimiter");

// ===== Route Imports =====
const chatRoutes = require("../chatRoutes");
const widgetRoutes = require("../widgetRoutes");
const authRoutes = require("../authRoutes");
const adminRoutes = require("../adminRoutes");
const analyticsRoutes = require("../analyticsRoutes");

// Connection Submodules
const connectionRoutes = require("../connectionRoutes");
const discoveryRoutes = require("../discoveryRoutes");
const extractionRoutes = require("../extractionRoutes");
const confidencePolicyRoutes = require("../confidencePolicyRoutes");

// Button System
const buttonRoutes = require("../buttonRoutes");

// Onboarding State Machine
const onboardingRoutes = require("../onboardingRoutes");

// ===================================================
// 1️⃣ Public Widget & Chat (High Volume)
// ===================================================
router.use(
  "/chat",
  limiters.widgetChat,
  chatRoutes
);

router.use(
  "/widget",
  limiters.widgetChat,
  widgetRoutes
);

// ===================================================
// 2️⃣ Admin & Auth (Sensitive)
// ===================================================
router.use(
  "/auth",
  limiters.adminActions,
  authRoutes
);

router.use(
  "/admin",
  limiters.adminActions,
  adminRoutes
);

router.use(
  "/admin",
  limiters.adminActions,
  buttonRoutes
);

router.use(
  "/analytics",
  limiters.adminActions,
  analyticsRoutes
);

// ===================================================
// 3️⃣ Connection Scoped Router
// ===================================================

// Create scoped router for all connection-related endpoints
const connectionsRouter = express.Router();

// Optional: apply baseline limiter to all connection routes
connectionsRouter.use(limiters.connectionBaseline || ((req, res, next) => next()));

// Mount submodules
connectionsRouter.use("/", connectionRoutes);
connectionsRouter.use("/", discoveryRoutes);
connectionsRouter.use("/", extractionRoutes);
connectionsRouter.use("/", confidencePolicyRoutes);

// Mount under /connections
router.use("/connections", connectionsRouter);

// ===================================================
// 4️⃣ Onboarding State Machine
// ===================================================
router.use(
  "/onboarding",
  limiters.adminActions,
  onboardingRoutes
);

module.exports = router;
