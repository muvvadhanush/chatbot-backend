const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const fs = require("fs");
const sequelize = require("../config/db");
const router = express.Router();
const Connection = require("../models/Connection");
const ConnectionKnowledge = require("../models/ConnectionKnowledge");
const PendingExtraction = require("../models/PendingExtraction");
const BehaviorDocument = require("../models/BehaviorDocument");
const BehaviorSuggestion = require("../models/BehaviorSuggestion");
const scraperService = require("../services/scraperService");
const aiService = require("../services/aiService");
const { parseFile } = require("../services/extraction/uploadService");
const { sanitize } = require("../services/extraction/sanitizer");
const authorize = require("../middleware/rbac");
const basicAuth = require("../middleware/auth");

// Multer config for image uploads (Favicon/Logo)
const imageUpload = multer({
  dest: 'uploads/',
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  }
});

// Multer config for behavior document uploads
const behaviorUpload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF, DOCX, and TXT files are allowed'), false);
  }
});

console.log("🔥 connectionRoutes.js LOADED");

router.use((req, res, next) => {
  console.log(`[DEBUG] Connection Route Hit: ${req.method} ${req.path}`);
  next();
});

// --- SECTION: PUBLIC WIDGET ENDPOINTS (HIGH PRIORITY) ---
// These must be defined first to avoid shadowing and authentication blockers.

/**
 * AUTO EXTRACT (ADMIN SETUP)
 * Goal: Full knowledge ingestion for training.
 * Rule: Authenticated ADMIN only.
 */
/**
 * DELETE CONNECTION
 */
router.delete("/:connectionId", basicAuth, authorize(['OWNER']), async (req, res) => {
  try {
    const { connectionId } = req.params;
    const connection = await Connection.findOne({ where: { connectionId } });

    if (!connection) {
      return res.status(404).json({ error: "Connection not found" });
    }

    // Cascade delete related data (Optional: Soft delete preferred in prod, but hard delete for now)
    await ConnectionKnowledge.destroy({ where: { connectionId } });
    await PendingExtraction.destroy({ where: { connectionId } });
    // ChatSession? Maybe keep for audit, but usually delete for privacy.
    // await ChatSession.destroy({ where: { connectionId } }); 

    await connection.destroy();
    res.json({ success: true, message: "Connection deleted" });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * AUTO EXTRACT (ADMIN SETUP)
 * Goal: Full knowledge ingestion for training.
 * Rule: Authenticated ADMIN only.
 */
router.post("/setup/auto-extract", basicAuth, authorize(['OWNER']), async (req, res) => {
  try {
    const { connectionId, hostUrl } = req.body;

    if (!connectionId || !hostUrl) {
      return res.status(400).json({ error: "connectionId and hostUrl are required" });
    }

    console.log(`🔍 Auto-extract for connection: ${connectionId}, URL: ${hostUrl}`);

    // Find the connection
    const connection = await Connection.findOne({
      where: { connectionId }
    });

    if (!connection) {
      return res.status(404).json({ error: "Connection not found" });
    }

    // Use ScraperService to get full content
    const result = await scraperService.ingestURL(hostUrl);

    // Update connection status and extracted tools
    await connection.update({
      knowledgeBase: result.cleanedText, // Keep legacy
      status: 'READY',
      extractedTools: {
        forms: result.forms || [],
        navigation: result.navigation || [],
        metadata: result.metadata || {}
      }
    });

    // CRITICAL FIX: Save to ConnectionKnowledge table for AI Service
    // Check if exists
    const [knowledge, created] = await ConnectionKnowledge.findOrCreate({
      where: {
        connectionId,
        sourceType: 'URL',
        sourceValue: hostUrl
      },
      defaults: {
        rawText: result.rawText,
        cleanedText: result.cleanedText,
        contentHash: crypto.createHash('sha256').update(result.cleanedText).digest('hex'),
        status: 'READY',
        visibility: 'ACTIVE', // Auto-approved for owner setup
        confidenceScore: 1.0,  // It's the source of truth!
        metadata: { source: 'auto-extract' }
      }
    });

    if (!created) {
      await knowledge.update({
        rawText: result.rawText,
        cleanedText: result.cleanedText,
        contentHash: crypto.createHash('sha256').update(result.cleanedText).digest('hex'),
        status: 'READY',
        visibility: 'ACTIVE',
        confidenceScore: 1.0
      });
    }

    console.log(`✅ [ADMIN] Auto-extract complete for ${connectionId}`);
    res.json({
      success: true,
      message: "Knowledge base extracted and saved",
      length: result.cleanedText.length,
      stats: {
        forms: (result.forms || []).length,
        nav: (result.navigation || []).length,
        images: (result.metadata && result.metadata.images ? result.metadata.images.length : 0)
      }
    });

  } catch (error) {
    console.error("🔥 [ADMIN] Auto-Extract Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * AUTO EXTRACT (Widget-side / Public)
 * Goal: Initialize Bot Identity for the widget.
 * Rule: Identity fields ONLY. No training data.
 */
router.post("/:connectionId/auto-extract",
  require("../middleware/rateLimiter").widgetExtraction,
  async (req, res) => {
    try {
      const { connectionId } = req.params;
      const { url } = req.body;
      const isTemp = connectionId === 'temp';

      // FEATURE FLAG CHECK
      const settings = require("../config/settings");
      if (!settings.features.extractionEnabled) {
        console.warn(`🛑 [BLOCKED] Public auto-extract attempted in ${settings.env} mode for ${connectionId}.`);
        return res.status(403).json({ error: "Feature Disabled: Auto-Extraction is OFF in this environment." });
      }

      console.log(`📡 [WIDGET] Public Auto-Extract started for connectionId: ${connectionId}, url: ${url}`);

      let connection = null;
      if (!isTemp) {
        connection = await Connection.findOne({ where: { connectionId } });
        if (!connection) {
          console.warn(`⚠️ [WIDGET] Connection NOT FOUND for ID: ${connectionId}`);
          return res.status(404).json({ error: `Connection ${connectionId} not found in database.` });
        }
      }

      if (!url) return res.status(400).json({ error: "URL is required" });

      // 1. Scrape Metadata & Text
      const result = await scraperService.scrapeWebsite(url);
      if (!result.success) {
        console.error(`🔥 [WIDGET] Scraping Failed for ${url}: ${result.error}`);
        return res.status(500).json({ error: result.error });
      }

      // 2. Fetch Branding (Images)
      const branding = await scraperService.fetchBranding(url, connectionId);

      // 3. AI Inference for Identity
      let identity = null;
      try {
        identity = await aiService.inferBotIdentity(result.rawText);
      } catch (aiErr) {
        console.error("🔥 AI Inference failed during public extract:", aiErr.message);
      }

      // 4. In-Memory Identity object
      const botIdentity = {
        assistantName: identity?.bot_name || result.metadata?.title || "AI Assistant",
        welcomeMessage: identity?.welcome_message || `Welcome to ${result.metadata?.title || 'our site'}!`,
        tone: identity?.tone || "neutral",
        websiteDescription: identity?.site_summary || result.metadata?.description || "",
        logoUrl: branding.logoPath || branding.faviconPath || null,
        brandingStatus: branding.status
      };

      // 5. Update DB ONLY if not temp
      if (connection) {
        await connection.update({
          assistantName: botIdentity.assistantName,
          welcomeMessage: botIdentity.welcomeMessage,
          tone: botIdentity.tone,
          websiteDescription: botIdentity.websiteDescription,
          logoUrl: botIdentity.logoUrl,
          brandingStatus: botIdentity.brandingStatus
        });
      }

      console.log(`✅ [WIDGET] Public Auto-Extract complete for ${connectionId}`);
      res.json({
        status: "initialized",
        isTemp,
        bot_identity: {
          name: botIdentity.assistantName,
          welcomeMessage: botIdentity.welcomeMessage,
          tone: botIdentity.tone,
          summary: botIdentity.websiteDescription,
          logoUrl: botIdentity.logoUrl,
          logoBase64: branding.logoBase64 || null
        }
      });

    } catch (error) {
      console.error("🔥 [WIDGET] CRITICAL LOG - Public Auto-Extract Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

/**
 * DRIFT CHECK (Widget-side / Public)
 */
router.post("/:connectionId/drift-check",
  require("../middleware/rateLimiter").widgetExtraction,
  async (req, res) => {
    try {
      const { connectionId } = req.params;
      const { url, currentHash } = req.body;

      if (!url || !currentHash) {
        return res.status(400).json({ error: "Missing url or hash" });
      }

      const knowledge = await ConnectionKnowledge.findOne({
        where: { connectionId, sourceType: 'URL', sourceValue: url }
      });

      if (!knowledge) {
        return res.json({ status: "uknown", monitored: false });
      }

      if (knowledge.contentHash !== currentHash) {
        console.warn(`⚠️ [AUDIT] DRIFT DETECTED for ${url} (Connection: ${connectionId})`);
        await knowledge.update({
          status: 'STALE',
          lastCheckedAt: new Date(),
          metadata: { ...knowledge.metadata, driftDetected: true, lastDriftAt: new Date() }
        });
        return res.json({ status: "drifted", monitored: true });
      }

      await knowledge.update({ lastCheckedAt: new Date() });
      res.json({ status: "synced", monitored: true });

    } catch (error) {
      console.error("Drift Check Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

// --- SECTION: PROTECTED ADMIN ENDPOINTS ---


// ============================================================
// ONBOARDING STEP 1: Initialize Connection (Name Only)
// Generates connectionId + apiKey. Returns embed snippet.
// State remains DRAFT until handshake confirms installation.
// ============================================================
router.post("/setup/init", basicAuth, authorize(['OWNER']), async (req, res) => {
  try {
    const { websiteName } = req.body;

    if (!websiteName || websiteName.trim().length < 2) {
      return res.status(400).json({ error: "Connection name is required (min 2 characters)." });
    }

    // Auto-generate connectionId and apiKey
    const connectionId = `cb_${crypto.randomBytes(8).toString('hex')}`;
    const apiKey = `key_${crypto.randomBytes(24).toString('hex')}`;

    // Hash the apiKey for storage (plain-text returned ONCE to admin)
    const apiKeyHash = await bcrypt.hash(apiKey, 10);

    const connection = await Connection.create({
      connectionId,
      websiteName: websiteName.trim(),
      connectionSecretHash: apiKeyHash,
      status: 'DRAFT',
      onboardingStep: 1,
      version: 0,
      onboardingMeta: {
        createdVia: 'onboarding_v2',
        initAt: new Date().toISOString()
      }
    });

    // Generate embed snippet
    const serverUrl = `${req.protocol}://${req.get('host')}`;
    const embedSnippet = generateEmbedSnippet(connectionId, apiKey, serverUrl);

    console.log(`✅ [ONBOARDING] Step 1 Init: ${connectionId} (${websiteName})`);

    res.json({
      success: true,
      connectionId: connection.connectionId,
      apiKey, // Plain-text — returned ONCE only
      websiteName: connection.websiteName,
      status: connection.status,
      version: connection.version,
      embedSnippet,
      message: "Connection created. Install the widget snippet and wait for handshake."
    });

  } catch (error) {
    console.error("🔥 [ONBOARDING] Init Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Generates the embed snippet for the widget.
 */
function generateEmbedSnippet(connectionId, apiKey, serverUrl) {
  return `<script src="${serverUrl}/widget.js?id=${connectionId}&key=${apiKey}"></script>`;
}

// ============================================================
// ONBOARDING STEP 1: Check Handshake Status (Polling Endpoint)
// Called by admin UI to check if widget has connected.
// Returns handshake status + timeout guidance.
// ============================================================
router.get("/setup/:connectionId/handshake-status", basicAuth, authorize(['OWNER']), async (req, res) => {
  try {
    const { connectionId } = req.params;
    const connection = await Connection.findOne({ where: { connectionId } });

    if (!connection) {
      return res.status(404).json({ error: "Connection not found" });
    }

    const isHandshaked = connection.status !== 'DRAFT';
    const createdAt = new Date(connection.createdAt).getTime();
    const elapsedMs = Date.now() - createdAt;
    const timeoutMs = 10 * 60 * 1000; // 10 minute timeout
    const isTimedOut = !isHandshaked && elapsedMs > timeoutMs;

    res.json({
      connectionId,
      handshaked: isHandshaked,
      status: connection.status,
      version: connection.version,
      elapsedMs,
      timeoutMs,
      isTimedOut,
      canProceed: isHandshaked,
      hint: isTimedOut
        ? "Handshake timed out. Please verify the snippet is installed correctly and retry."
        : isHandshaked
          ? "Handshake confirmed! You can proceed to the next step."
          : "Waiting for widget handshake... Ensure the snippet is installed on your website."
    });

  } catch (error) {
    console.error("[ONBOARDING] Handshake Status Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ONBOARDING STEP 1: Retry Handshake (Regenerate API Key)
// If handshake fails or times out, admin can regenerate the key.
// ============================================================
router.post("/setup/:connectionId/retry", basicAuth, authorize(['OWNER']), async (req, res) => {
  try {
    const { connectionId } = req.params;
    const connection = await Connection.findOne({ where: { connectionId } });

    if (!connection) {
      return res.status(404).json({ error: "Connection not found" });
    }

    if (connection.status !== 'DRAFT') {
      return res.status(400).json({ error: "Connection already handshaked. Retry not needed." });
    }

    // Generate new apiKey
    const newApiKey = `key_${crypto.randomBytes(24).toString('hex')}`;
    const newHash = await bcrypt.hash(newApiKey, 10);

    await connection.update({
      connectionSecretHash: newHash,
      onboardingMeta: {
        ...(connection.onboardingMeta || {}),
        retryCount: ((connection.onboardingMeta || {}).retryCount || 0) + 1,
        lastRetryAt: new Date().toISOString()
      }
    });

    const serverUrl = `${req.protocol}://${req.get('host')}`;
    const embedSnippet = generateEmbedSnippet(connectionId, newApiKey, serverUrl);

    console.log(`🔄 [ONBOARDING] Retry: ${connectionId} (attempt ${(connection.onboardingMeta || {}).retryCount || 1})`);

    res.json({
      success: true,
      connectionId,
      apiKey: newApiKey,
      embedSnippet,
      message: "New API key generated. Replace the snippet and wait for handshake."
    });

  } catch (error) {
    console.error("[ONBOARDING] Retry Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ONBOARDING STEP 2: Trigger Learning (Discovery → Extraction)
// Runs discovery engine then extraction engine sequentially.
// Requires websiteUrl to be set on connection.
// ============================================================
router.post("/setup/:connectionId/learn", basicAuth, authorize(['OWNER']), async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { websiteUrl } = req.body;

    const connection = await Connection.findOne({ where: { connectionId } });
    if (!connection) {
      return res.status(404).json({ error: "Connection not found" });
    }

    // Must be at least CONNECTED to learn
    if (connection.status === 'DRAFT') {
      return res.status(400).json({ error: "Complete widget handshake first (Step 1)." });
    }

    // Update websiteUrl if provided
    if (websiteUrl && websiteUrl.trim()) {
      await connection.update({ websiteUrl: websiteUrl.trim() });
      await connection.reload();
    }

    if (!connection.websiteUrl) {
      return res.status(400).json({ error: "Website URL is required for auto-discovery." });
    }

    // Check for running sessions (retry protection)
    const ConnectionCrawlSession = require("../models/ConnectionCrawlSession");
    const running = await ConnectionCrawlSession.findOne({
      where: { connectionId, status: 'RUNNING' }
    });

    if (running) {
      const runningAge = Date.now() - new Date(running.createdAt).getTime();
      // If older than 10 min, mark as failed and allow restart
      if (runningAge > 10 * 60 * 1000) {
        await running.update({ status: 'FAILED' });
        console.warn(`⚠️ [LEARN] Stale session ${running.id} force-failed`);
      } else {
        return res.status(409).json({
          error: "Learning already in progress",
          sessionId: running.id,
          hint: "Wait for the current session to complete or retry after 10 minutes."
        });
      }
    }

    console.log(`📚 [LEARN] Starting for ${connectionId} (${connection.websiteUrl})`);

    // Phase 1: Discovery
    const { runDiscovery } = require("../services/discovery/discoveryService");
    let discoveryResult;
    try {
      discoveryResult = await runDiscovery(connection);
      console.log(`📚 [LEARN] Discovery complete: ${discoveryResult.valid} pages found`);
    } catch (discErr) {
      console.error(`📚 [LEARN] Discovery failed: ${discErr.message}`);
      return res.status(500).json({
        error: "Discovery failed: " + discErr.message,
        phase: "DISCOVERY"
      });
    }

    // Phase 2: Extraction (approve-all logic — scrape discovered pages)
    const ConnectionDiscovery = require("../models/ConnectionDiscovery");
    const PageContent = require("../models/PageContent");
    const discovered = await ConnectionDiscovery.findAll({
      where: { connectionId, status: 'DISCOVERED' },
      limit: 20 // Process up to 20 pages
    });

    let extractedCount = 0;
    let failedCount = 0;

    if (discovered.length > 0) {
      console.log(`📚 [LEARN] Extracting ${discovered.length} pages...`);

      const results = await Promise.all(discovered.map(async (item) => {
        try {
          const scrapeResult = await scraperService.scrapeWebsite(item.discoveredUrl);
          if (scrapeResult.success) {
            const text = scrapeResult.rawText || '';
            const contentHash = crypto.createHash('sha256').update(text).digest('hex');
            const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

            await PageContent.upsert({
              connectionId,
              url: item.discoveredUrl,
              status: 'FETCHED',
              rawHtml: 'SKIPPED',
              cleanText: text,
              contentHash,
              wordCount,
              fetchedAt: new Date()
            });

            // Create knowledge entry
            await ConnectionKnowledge.findOrCreate({
              where: { connectionId, sourceType: 'URL', sourceValue: item.discoveredUrl },
              defaults: {
                rawText: text,
                cleanedText: text,
                status: 'READY',
                visibility: 'ACTIVE',
                contentHash,
                confidenceScore: 0.8,
                metadata: { wordCount, method: 'auto-discovery' }
              }
            });

            // FIX: Create PendingExtraction for metadata/forms/navigation
            const PendingExtraction = require('../models/PendingExtraction');
            try {
              // Metadata extraction
              if (scrapeResult.metadata && (scrapeResult.metadata.title || scrapeResult.metadata.description)) {
                await PendingExtraction.findOrCreate({
                  where: { connectionId, extractorType: 'METADATA', status: 'PENDING' },
                  defaults: {
                    connectionId,
                    extractorType: 'METADATA',
                    status: 'PENDING',
                    confidenceScore: 0.95,
                    rawData: scrapeResult.metadata,
                    metadata: { sourceUrl: item.discoveredUrl }
                  }
                });
              }

              // Forms extraction
              if (scrapeResult.forms && scrapeResult.forms.length > 0) {
                for (const form of scrapeResult.forms) {
                  await PendingExtraction.create({
                    connectionId,
                    extractorType: 'FORM',
                    status: 'PENDING',
                    confidenceScore: 0.9,
                    rawData: form,
                    metadata: { sourceUrl: item.discoveredUrl }
                  });
                }
              }

              // Navigation extraction
              if (scrapeResult.navigation && scrapeResult.navigation.length > 0) {
                await PendingExtraction.findOrCreate({
                  where: { connectionId, extractorType: 'NAVIGATION', status: 'PENDING' },
                  defaults: {
                    connectionId,
                    extractorType: 'NAVIGATION',
                    status: 'PENDING',
                    confidenceScore: 0.85,
                    rawData: { links: scrapeResult.navigation },
                    metadata: { sourceUrl: item.discoveredUrl, count: scrapeResult.navigation.length }
                  }
                });
              }
            } catch (extErr) {
              console.warn(`📚 [LEARN] Extraction create warning: ${extErr.message}`);
            }

            await item.update({ status: 'INDEXED' });
            return 1;
          } else {
            await item.update({ status: 'FAILED' });
            return 0;
          }
        } catch (e) {
          console.error(`📚 [LEARN] Extract failed ${item.discoveredUrl}: ${e.message}`);
          await item.update({ status: 'FAILED' }).catch(() => { });
          return 0;
        }
      }));

      extractedCount = results.reduce((a, b) => a + b, 0);
      failedCount = discovered.length - extractedCount;
    }

    // Enable extraction on connection
    if (extractedCount > 0 && !connection.extractionEnabled) {
      await connection.update({ extractionEnabled: true });
    }

    // Calculate coverage
    const totalDiscovered = discoveryResult.valid || 0;
    const coverage = totalDiscovered > 0 ? Math.round((extractedCount / totalDiscovered) * 100) : 0;

    console.log(`📚 [LEARN] Complete: ${extractedCount} indexed, ${failedCount} failed, ${coverage}% coverage`);

    res.json({
      success: true,
      phase: "COMPLETE",
      discovery: {
        total: discoveryResult.total,
        valid: discoveryResult.valid,
        method: discoveryResult.method
      },
      extraction: {
        processed: discovered.length,
        indexed: extractedCount,
        failed: failedCount
      },
      coverage,
      thresholdsMet: extractedCount >= 3 && coverage >= 30,
      message: `Learned from ${extractedCount} pages (${coverage}% coverage)`
    });

  } catch (error) {
    console.error("🔥 [LEARN] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ONBOARDING STEP 2: Get Learning Status
// Returns real-time metrics for the learning progress UI.
// ============================================================
router.get("/setup/:connectionId/learn-status", basicAuth, authorize(['OWNER']), async (req, res) => {
  try {
    const { connectionId } = req.params;

    const connection = await Connection.findOne({ where: { connectionId } });
    if (!connection) {
      return res.status(404).json({ error: "Connection not found" });
    }

    // Get latest crawl session
    const ConnectionCrawlSession = require("../models/ConnectionCrawlSession");
    const latestSession = await ConnectionCrawlSession.findOne({
      where: { connectionId },
      order: [['createdAt', 'DESC']]
    });

    // Count discovery items by status
    const ConnectionDiscovery = require("../models/ConnectionDiscovery");
    const { Op } = require("sequelize");

    const totalDiscovered = await ConnectionDiscovery.count({
      where: { connectionId }
    });
    const indexedPages = await ConnectionDiscovery.count({
      where: { connectionId, status: 'INDEXED' }
    });
    const failedPages = await ConnectionDiscovery.count({
      where: { connectionId, status: 'FAILED' }
    });
    const pendingPages = await ConnectionDiscovery.count({
      where: { connectionId, status: 'DISCOVERED' }
    });

    // Count knowledge entries
    const knowledgeCount = await ConnectionKnowledge.count({
      where: { connectionId, status: 'READY' }
    });

    // Coverage calculation
    const coverage = totalDiscovered > 0 ? Math.round((indexedPages / totalDiscovered) * 100) : 0;

    // Determine phase
    let phase = 'IDLE';
    if (latestSession) {
      if (latestSession.status === 'RUNNING') phase = 'DISCOVERING';
      else if (latestSession.status === 'COMPLETED' && pendingPages > 0) phase = 'EXTRACTING';
      else if (latestSession.status === 'COMPLETED' && pendingPages === 0) phase = 'COMPLETE';
      else if (latestSession.status === 'FAILED') phase = 'FAILED';
    }

    const MIN_PAGES = 3;
    const MIN_COVERAGE = 30;

    res.json({
      connectionId,
      websiteUrl: connection.websiteUrl,
      phase,
      discovery: {
        sessionStatus: latestSession ? latestSession.status : null,
        method: latestSession ? latestSession.method : null,
        totalFound: totalDiscovered,
        validUrls: latestSession ? latestSession.validUrls : 0
      },
      pages: {
        total: totalDiscovered,
        indexed: indexedPages,
        failed: failedPages,
        pending: pendingPages
      },
      knowledge: {
        ready: knowledgeCount
      },
      coverage,
      thresholds: {
        minPages: MIN_PAGES,
        minCoverage: MIN_COVERAGE,
        pagesMet: indexedPages >= MIN_PAGES,
        coverageMet: coverage >= MIN_COVERAGE,
        allMet: indexedPages >= MIN_PAGES && coverage >= MIN_COVERAGE
      },
      canProceed: indexedPages >= MIN_PAGES && coverage >= MIN_COVERAGE
    });

  } catch (error) {
    console.error("[LEARN STATUS] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// LEGACY: Create a new connection (Backwards Compatible)
// ============================================================
router.post("/create", basicAuth, authorize(['OWNER']), async (req, res) => {
  try {
    // Phase 1: Secure Creation
    if (req.body.password) {
      // Use the raw password to create a hash for BOTH login and widget handshake
      const hash = await bcrypt.hash(req.body.password, 10);
      req.body.passwordHash = hash;
      req.body.connectionSecretHash = hash; // Ensure model validation passes
      delete req.body.password;
    }

    req.body.status = "DRAFT"; // Enforce default (Onboarding V2)

    const connection = await Connection.create(req.body);
    res.json(connection);
  } catch (error) {
    console.error("🔥 Creation Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- PART 1: AUTO EXTRACT / BRANDING (Identity) ---
// Fetch Branding (Favicon/Logo) - Updates Identity ONLY
router.post("/:connectionId/branding/fetch", basicAuth, authorize(['EDITOR', 'OWNER']), async (req, res) => {
  console.log(`📡 Hit branding/fetch for ${req.params.connectionId}`);
  try {
    const { connectionId } = req.params;
    const { url } = req.body;

    const connection = await Connection.findOne({ where: { connectionId } });
    if (!connection) return res.status(404).json({ error: "Connection not found" });

    if (!url) return res.status(400).json({ error: "URL is required" });

    const branding = await scraperService.fetchBranding(url, connectionId);

    // Update Identity Fields ONLY
    await connection.update({
      faviconPath: branding.faviconPath,
      logoPath: branding.logoPath,
      brandingStatus: branding.status
    });

    res.json({ success: true, branding });

  } catch (error) {
    console.error("Branding Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- PART 2: KNOWLEDGE INGESTION (Training) ---
// Ingest Knowledge - Updates Knowledge ONLY
router.post("/:connectionId/knowledge/ingest", basicAuth, authorize(['EDITOR', 'OWNER']), async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { sourceType, sourceValue } = req.body; // 'URL' or 'TEXT'

    if (!sourceType || !sourceValue) return res.status(400).json({ error: "Missing type or value" });

    const connection = await Connection.findOne({ where: { connectionId } });
    if (!connection) return res.status(404).json({ error: "Connection not found" });

    // Idempotency: Check if exists to avoid duplicates
    let knowledge = await ConnectionKnowledge.findOne({
      where: { connectionId, sourceType, sourceValue }
    });

    // Process Content
    let contentData = { rawText: "", cleanedText: "" };
    if (sourceType.toLowerCase() === 'url') {
      contentData = await scraperService.ingestURL(sourceValue);
    } else {
      contentData = scraperService.ingestText(sourceValue);
    }

    // Compute Hash
    const contentHash = crypto.createHash('sha256').update(contentData.cleanedText || "").digest('hex');

    if (knowledge) {
      // Update existing
      await knowledge.update({
        rawText: contentData.rawText,
        cleanedText: contentData.cleanedText,
        contentHash, // Add this
        status: 'READY',
        updatedAt: new Date()
      });
    } else {
      // Create new
      knowledge = await ConnectionKnowledge.create({
        connectionId,
        sourceType,
        sourceValue,
        rawText: contentData.rawText,
        cleanedText: contentData.cleanedText,
        contentHash, // Add this
        status: 'READY',
        metadata: {}
      });
    }

    res.json({ success: true, knowledgeId: knowledge.id });

  } catch (error) {
    console.error("Ingest Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- NEW SYSTEM: STRICT SEPARATION ---


/**
 * KNOWLEDGE INGESTION (Training)
 * Goal: Add granular knowledge chunks.
 * Rule: Training data ONLY. No identity changes.
 */
router.post("/:connectionId/knowledge-ingest", basicAuth, authorize(['EDITOR', 'OWNER']), async (req, res) => {
  console.log(`!!! HIT KNOWLEDGE-INGEST ROUTE !!! URL=${req.originalUrl}`);
  try {
    const { connectionId } = req.params;

    if (!req.body) {
      return res.status(400).json({ error: "Request body is missing. Ensure Content-Type is application/json" });
    }

    const { sourceType, sourceValue } = req.body; // 'url', 'text'

    if (!sourceType || !sourceValue) return res.status(400).json({ error: "Missing type or value" });

    const connection = await Connection.findOne({ where: { connectionId } });
    if (!connection) return res.status(404).json({ error: "Connection not found" });

    // Process Content
    console.error(`[DEBUG] Ingest request: Type=${sourceType}, Value=${sourceValue}`);
    let contentData = { rawText: "", cleanedText: "" };
    if (sourceType.toLowerCase() === 'url') {
      contentData = await scraperService.ingestURL(sourceValue);
    } else {
      contentData = scraperService.ingestText(sourceValue);
    }

    console.error(`[DEBUG] Scraper returned: RawLen=${contentData.rawText?.length}, CleanedLen=${contentData.cleanedText?.length}`);

    // Compute Hash
    const contentHash = crypto.createHash('sha256').update(contentData.cleanedText || "").digest('hex');
    console.error(`[DEBUG] Computed Hash: ${contentHash} for ${sourceValue}`);

    // Idempotency: Update existing or create new
    const [knowledge, created] = await ConnectionKnowledge.findOrCreate({
      where: { connectionId, sourceType: sourceType.toUpperCase(), sourceValue },
      defaults: {
        rawText: contentData.rawText,
        cleanedText: contentData.cleanedText,
        contentHash,
        status: 'READY',
        lastCheckedAt: new Date()
      }
    });

    if (!created) {
      await knowledge.update({
        rawText: contentData.rawText,
        cleanedText: contentData.cleanedText,
        contentHash,
        status: 'READY',
        lastCheckedAt: new Date()
      });
    }

    res.json({
      success: true,
      status: created ? "created" : "updated",
      knowledgeId: knowledge.id
    });

  } catch (error) {
    console.error("Knowledge Ingest Error:", error);
    res.status(500).json({ error: error.message });
  }
});


// Scrape website and extract knowledge base
router.post("/scrape", basicAuth, authorize(['EDITOR', 'OWNER']), async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    console.log("📡 Scrape request for:", url);

    const result = await scraperService.scrapeWebsite(url);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      metadata: result.metadata,
      knowledgeBase: result.knowledgeBase,
      suggestedBotName: result.suggestedBotName,
      suggestedWelcome: result.suggestedWelcome,
      suggestedTone: result.suggestedTone,
      preview: result.rawText.substring(0, 500)
    });

  } catch (error) {
    console.error("❌ Scrape route error:", error);
    res.status(500).json({ error: error.message });
  }
});


// Get all connections (Alias for root)
router.get("/", basicAuth, authorize(['VIEWER', 'EDITOR', 'OWNER']), async (req, res) => {
  try {
    const connections = await Connection.findAll({
      attributes: [
        "connectionId", "websiteName", "websiteUrl", "assistantName",
        "createdAt", "logoUrl", "status", "healthScore", "driftCount",
        "confidenceGateStatus", "launchStatus", "lastActivityAt"
      ]
    });
    res.json(connections);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all connections (Explicit List)
router.get("/list", basicAuth, authorize(['VIEWER', 'EDITOR', 'OWNER']), async (req, res) => {
  try {
    const connections = await Connection.findAll({
      attributes: [
        "connectionId", "websiteName", "websiteUrl", "assistantName",
        "createdAt", "logoUrl", "status", "healthScore", "driftCount",
        "confidenceGateStatus", "launchStatus", "lastActivityAt"
      ]
    });
    res.json(connections);
  } catch (error) {
    console.error("❌ [/list] ERROR:", error);

    // Auto-diagnostic
    let tableInfo = "Could not describe table";
    try {
      tableInfo = await sequelize.getQueryInterface().describeTable("Connections");
    } catch (dErr) {
      tableInfo = "Error describing table: " + dErr.message;
    }

    res.status(500).json({
      error: error.message,
      hint: "Check if all required columns exist in the database.",
      tableInfo: tableInfo,
      stack: error.stack
    });
  }
});

// Get single connection
router.get("/:connectionId", basicAuth, authorize(['VIEWER', 'EDITOR', 'OWNER']), async (req, res) => {
  try {
    const connection = await Connection.findOne({
      where: { connectionId: req.params.connectionId }
    });
    if (!connection) {
      return res.status(404).json({ error: "Connection not found" });
    }
    res.json(connection);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get connection details with knowledge base
router.get("/:connectionId/details", basicAuth, authorize(['VIEWER', 'EDITOR', 'OWNER']), async (req, res) => {
  try {
    const connection = await Connection.findOne({
      where: { connectionId: req.params.connectionId },
      include: [{ model: ConnectionKnowledge }]
    });
    if (!connection) {
      return res.status(404).json({ error: "Connection not found" });
    }
    res.json(connection);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update connection (Full or Partial)
router.put("/:connectionId", basicAuth, authorize(['EDITOR', 'OWNER']), async (req, res) => {
  try {
    const connection = await Connection.findOne({
      where: { connectionId: req.params.connectionId }
    });
    if (!connection) {
      return res.status(404).json({ error: "Connection not found" });
    }
    await connection.update(req.body);
    res.json(connection);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:connectionId", basicAuth, authorize(['EDITOR', 'OWNER']), async (req, res) => {
  try {
    const connection = await Connection.findOne({
      where: { connectionId: req.params.connectionId }
    });
    if (!connection) {
      return res.status(404).json({ error: "Connection not found" });
    }
    await connection.update(req.body);
    res.json(connection);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Delete connection
router.delete("/:connectionId", basicAuth, authorize(['OWNER']), async (req, res) => {
  try {
    const connection = await Connection.findOne({
      where: { connectionId: req.params.connectionId }
    });
    if (!connection) {
      return res.status(404).json({ error: "Connection not found" });
    }
    await connection.destroy();
    res.json({ success: true, message: "Connection deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Phase 1: Admin Extraction Controls ---

// 1.3 Admin Enable Extraction
router.post("/:connectionId/extraction/enable", basicAuth, authorize(['OWNER']), async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { allowedExtractors } = req.body;

    const connection = await Connection.findOne({ where: { connectionId } });
    if (!connection) return res.status(404).json({ error: "Connection not found" });

    // Ensure widget is connected first
    if (!connection.widgetSeen) {
      return res.status(400).json({ error: "Widget has not connected yet." });
    }

    connection.extractionEnabled = true;
    connection.allowedExtractors = allowedExtractors || ["branding", "knowledge", "forms"];
    await connection.save();

    res.json({ success: true, message: "Extraction enabled" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 1.4 Admin Trigger Extraction
router.post("/:connectionId/extract", basicAuth, authorize(['OWNER']), async (req, res) => {
  try {
    const { connectionId } = req.params;

    const connection = await Connection.findOne({ where: { connectionId } });
    if (!connection) return res.status(404).json({ error: "Connection not found" });

    if (!connection.extractionEnabled) {
      return res.status(403).json({ error: "Extraction not enabled for this connection" });
    }

    // Generate Token
    // Using built-in crypto
    const token = crypto.randomBytes(16).toString("hex");
    connection.extractionToken = token;
    // 10 mins expiry
    connection.extractionTokenExpires = new Date(Date.now() + 10 * 60 * 1000);
    connection.status = "EXTRACTION_REQUESTED";
    await connection.save();

    res.json({ success: true, token, message: "Extraction requested" });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 1.8 List Pending Extractions
router.get("/:connectionId/extractions", basicAuth, authorize(['EDITOR', 'OWNER']), async (req, res) => {
  try {
    const { connectionId } = req.params;
    const status = req.query.status || 'PENDING';

    const extractions = await PendingExtraction.findAll({
      where: { connectionId, status },
      order: [['createdAt', 'DESC']]
    });

    res.json(extractions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 1.9 Reject Extraction
router.delete("/:connectionId/extractions/:id", basicAuth, authorize(['OWNER']), async (req, res) => {
  try {
    const { connectionId, id } = req.params;

    const deleted = await PendingExtraction.destroy({
      where: { id, connectionId }
    });

    if (!deleted) return res.status(404).json({ error: "Item not found" });

    res.json({ success: true, message: "Rejected" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 1.10 Approve Extraction
router.post("/:connectionId/extractions/:id/approve", basicAuth, authorize(['OWNER']), async (req, res) => {
  try {
    const { connectionId, id } = req.params;

    const item = await PendingExtraction.findOne({ where: { id, connectionId } });
    if (!item) return res.status(404).json({ error: "Item not found" });

    const connection = await Connection.findOne({ where: { connectionId } });
    const data = item.rawData;

    // Logic based on Type
    if (item.extractorType === 'METADATA') {
      await connection.update({
        assistantName: data.assistantName || connection.assistantName,
        websiteName: data.websiteName || connection.websiteName
      });
    } else if (item.extractorType === 'BRANDING') {
      // Assume data contains logoUrl etc.
      // widgetRoutes.js saves rawData: data.branding. 
      // Need to check structure. Assuming flat object or specific keys.
      // For now, naive merge if keys match model
      const updates = {};
      if (data.logoUrl) updates.logoUrl = data.logoUrl;
      if (data.favicon) updates.faviconPath = data.favicon;
      await connection.update(updates);
    } else if (item.extractorType === 'KNOWLEDGE') {
      const { title, content, url } = data;
      const contentHash = crypto.createHash('sha256').update(content || "").digest('hex');

      await ConnectionKnowledge.create({
        connectionId,
        sourceType: 'URL',
        sourceValue: url || item.pageUrl || 'Manual',
        rawText: content,
        cleanedText: content,
        contentHash,
        status: 'READY'
      });
    }

    // Delete after approval
    await item.destroy();

    res.json({ success: true, message: "Approved" });

  } catch (error) {
    console.error("Approve Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 1.8 Explainability: List Answers
router.get("/:connectionId/answers", basicAuth, authorize(['VIEWER', 'EDITOR', 'OWNER']), async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { filter } = req.query; // 'ALL', 'AT_RISK', 'SAFE'
    const ChatSession = require('../models/ChatSession');

    // Fetch last 50 sessions
    const sessions = await ChatSession.findAll({
      where: { connectionId },
      limit: 50,
      order: [['updatedAt', 'DESC']]
    });

    let answers = [];

    sessions.forEach(session => {
      const msgs = session.messages || [];
      msgs.forEach((msg, idx) => {
        if (msg.role === 'assistant') {
          // Find preceding user Q
          const question = (idx > 0 && msgs[idx - 1].role === 'user') ? msgs[idx - 1].content : "(No question)";

          // Determine Status/Confidence
          const meta = msg.ai_metadata || {};
          const confidence = meta.confidenceScore || 0.95;
          let status = 'SAFE';
          if (confidence < 0.7) status = 'AT_RISK';
          if (meta.policyViolation) status = 'FLAGGED';

          answers.push({
            id: `${session.sessionId}_${idx}`,
            sessionId: session.sessionId,
            timestamp: msg.timestamp || session.updatedAt,
            question: question,
            answer: msg.content,
            confidence: confidence,
            status: status,
            metadata: meta
          });
        }
      });
    });

    // Filter
    if (filter && filter !== 'ALL') {
      answers = answers.filter(a => a.status === filter);
    }

    // Sort by time desc
    answers.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json(answers);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ONBOARDING STEP 3: Brand Detection & Behavior
// ============================================================

/**
 * POST /setup/:connectionId/detect-brand
 * Analyzes indexed PageContent with AI to generate a brand profile.
 * Returns detected industry, tone, primaryGoal, salesIntensity, etc.
 */
router.post("/setup/:connectionId/detect-brand", basicAuth, authorize(['OWNER']), async (req, res) => {
  const { connectionId } = req.params;

  try {
    const connection = await Connection.findOne({ where: { connectionId } });
    if (!connection) {
      return res.status(404).json({ error: "Connection not found." });
    }

    // Gather indexed PageContent for this connection
    const PageContent = require('../models/PageContent');
    console.log(`[DEBUG BRAND] Querying PageContent for ${connectionId} with attributes: cleanText, url`);
    let pages;
    try {
      pages = await PageContent.findAll({
        where: { connectionId, status: 'FETCHED' },
        attributes: ['cleanText', 'url'],
        limit: 20,
        order: [['updatedAt', 'DESC']]
      });
    } catch (queryErr) {
      console.error(`[DEBUG BRAND] PageContent query FAILED:`, queryErr.message);
      console.error(`[DEBUG BRAND] Full SQL error:`, queryErr.sql || 'no sql');
      return res.status(500).json({ error: queryErr.message, debug: 'PageContent query failed' });
    }
    console.log(`[DEBUG BRAND] Found ${pages.length} pages`);

    // Concatenate page content (cap at 6000 chars for AI context)
    const contentText = pages
      .map(p => (p.cleanText || '').substring(0, 1000))
      .join('\n---\n')
      .substring(0, 6000);

    console.log(`🔍 [BRAND] Detecting brand for ${connectionId} using ${pages.length} pages...`);

    // Call AI detection
    const profile = await aiService.detectBrandProfile(contentText);

    // Save raw detected profile to connection
    const previousProfile = connection.behaviorProfile || {};
    const versionHistory = previousProfile._versionHistory || [];

    // Archive current profile if it already has content
    if (previousProfile.industry) {
      versionHistory.push({
        ...previousProfile,
        _versionHistory: undefined,
        _archivedAt: new Date().toISOString(),
        _source: previousProfile._source || 'unknown'
      });
    }

    const detectedProfile = {
      ...profile,
      _source: 'ai-detected',
      _detectedAt: new Date().toISOString(),
      _versionHistory: versionHistory.slice(-5) // Keep last 5 versions
    };

    await connection.update({
      behaviorProfile: detectedProfile,
      brandingStatus: 'PARTIAL',
      assistantName: profile.suggestedName,
      welcomeMessage: profile.suggestedWelcome
    });

    console.log(`✅ [BRAND] Brand detected for ${connectionId}: ${profile.industry} / ${profile.tone}`);

    res.json({
      connectionId,
      detected: profile,
      message: "Brand profile detected. Review and accept to continue."
    });

  } catch (error) {
    console.error(`🔥 [BRAND] Detection Error for ${connectionId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /setup/:connectionId/save-brand
 * Saves the user-accepted (possibly overridden) brand profile.
 * Sets brandingStatus to READY, enabling Step 3 Next.
 */
router.post("/setup/:connectionId/save-brand", basicAuth, authorize(['OWNER']), async (req, res) => {
  const { connectionId } = req.params;
  const { industry, tone, primaryGoal, salesIntensity, assistantRole, assistantName, welcomeMessage } = req.body;

  try {
    const connection = await Connection.findOne({ where: { connectionId } });
    if (!connection) {
      return res.status(404).json({ error: "Connection not found." });
    }

    // Build accepted profile
    const currentProfile = connection.behaviorProfile || {};
    const versionHistory = currentProfile._versionHistory || [];

    // Archive current before overwriting
    if (currentProfile.industry) {
      versionHistory.push({
        ...currentProfile,
        _versionHistory: undefined,
        _archivedAt: new Date().toISOString(),
        _source: currentProfile._source || 'unknown'
      });
    }

    const acceptedProfile = {
      industry: industry || currentProfile.industry || 'Other',
      tone: tone || currentProfile.tone || 'Professional',
      primaryGoal: primaryGoal || currentProfile.primaryGoal || 'Support',
      salesIntensity: salesIntensity || currentProfile.salesIntensity || 'Medium',
      assistantRole: assistantRole || currentProfile.assistantRole || 'AI Assistant',
      responseLength: currentProfile.responseLength || 'Medium',
      hardConstraints: currentProfile.hardConstraints || {},
      _source: 'user-accepted',
      _acceptedAt: new Date().toISOString(),
      _versionHistory: versionHistory.slice(-5)
    };

    await connection.update({
      behaviorProfile: acceptedProfile,
      brandingStatus: 'READY',
      assistantName: assistantName || connection.assistantName,
      welcomeMessage: welcomeMessage || connection.welcomeMessage
    });

    console.log(`✅ [BRAND] Profile accepted for ${connectionId}: ${acceptedProfile.tone} / ${acceptedProfile.primaryGoal}`);

    res.json({
      connectionId,
      profile: acceptedProfile,
      brandingStatus: 'READY',
      message: "Brand profile saved. You can now proceed to the next step."
    });

  } catch (error) {
    console.error(`🔥 [BRAND] Save Error for ${connectionId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /setup/:connectionId/icon
 * Upload a custom favicon/logo.
 */
router.post("/setup/:connectionId/icon", basicAuth, authorize(['OWNER']),
  imageUpload.single('file'),
  async (req, res) => {
    const { connectionId } = req.params;
    let tempPath = null;

    try {
      if (!req.file) return res.status(400).json({ error: "No image file uploaded." });

      tempPath = req.file.path;
      const connection = await Connection.findOne({ where: { connectionId } });
      if (!connection) return res.status(404).json({ error: "Connection not found." });

      // Move file to public/branding/:connectionId
      const publicDir = path.join(__dirname, '../public');
      const brandingDir = path.join(publicDir, 'branding', connectionId);

      if (!fs.existsSync(brandingDir)) {
        fs.mkdirSync(brandingDir, { recursive: true });
      }

      const ext = path.extname(req.file.originalname) || '.png';
      const fileName = `favicon_custom${ext}`; // Overwrite previous custom
      const targetPath = path.join(brandingDir, fileName);

      fs.renameSync(tempPath, targetPath);

      const publicPath = `/branding/${connectionId}/${fileName}`;

      await connection.update({ faviconPath: publicPath });

      res.json({
        success: true,
        faviconPath: publicPath,
        message: "Favicon updated successfully."
      });

    } catch (error) {
      console.error(`🔥 [ICON] Upload Error:`, error);
      res.status(500).json({ error: error.message });
    } finally {
      // Cleanup temp if rename failed or something
      if (tempPath && fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (e) { }
      }
    }
  });

/**
 * POST /setup/:connectionId/fetch-branding
 * Attempt to auto-extract favicon/logo from the website URL.
 */
router.post("/setup/:connectionId/fetch-branding", basicAuth, authorize(['OWNER']), async (req, res) => {
  const { connectionId } = req.params;

  try {
    const connection = await Connection.findOne({ where: { connectionId } });
    if (!connection || !connection.websiteUrl) {
      return res.status(400).json({ error: "Connection has no website URL to scrape." });
    }

    console.log(`🎨 [BRAND] Fetching branding for ${connection.websiteUrl}...`);
    const report = await scraperService.fetchBranding(connection.websiteUrl, connectionId);

    if (report.status === 'FAILED') {
      return res.status(422).json({ error: "Could not extract branding assets." });
    }

    const updates = {};
    if (report.faviconPath) updates.faviconPath = report.faviconPath;
    if (report.logoPath) updates.logoPath = report.logoPath;

    if (Object.keys(updates).length > 0) {
      await connection.update(updates);
    }

    res.json({
      success: true,
      report,
      message: "Branding assets fetched."
    });

  } catch (error) {
    console.error(`🔥 [BRAND] Fetch Error:`, error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ONBOARDING STEP 3b: Document-Based Behavior Tuning
// ============================================================

/**
 * POST /setup/:connectionId/behavior-upload
 * Upload a PDF/TXT/DOCX document for behavior signal extraction.
 * Creates BehaviorDocument + processes through AI pipeline.
 */
router.post("/setup/:connectionId/behavior-upload", basicAuth, authorize(['OWNER']),
  behaviorUpload.single('file'),
  async (req, res) => {
    const { connectionId } = req.params;
    let filePath = null;

    try {
      const connection = await Connection.findOne({ where: { connectionId } });
      if (!connection) return res.status(404).json({ error: "Connection not found." });

      if (!req.file) return res.status(400).json({ error: "No file uploaded." });

      filePath = req.file.path;
      const fileName = req.file.originalname;
      const fileSize = req.file.size;

      // Determine type
      let fileType = 'TEXT';
      if (req.file.mimetype === 'application/pdf') fileType = 'PDF';
      if (req.file.mimetype.includes('word')) fileType = 'DOCX';

      console.log(`📄 [BEHAVIOR] Uploading ${fileType}: ${fileName} (${fileSize} bytes) for ${connectionId}`);

      // 1. Create record with PENDING status
      const doc = await BehaviorDocument.create({
        connectionId,
        fileName,
        fileType,
        fileSize,
        processingStatus: 'PROCESSING'
      });

      // 2. Extract text
      let rawText;
      try {
        rawText = await parseFile(req.file);
      } catch (parseErr) {
        await doc.update({ processingStatus: 'FAILED', errorMessage: 'Text extraction failed: ' + parseErr.message });
        return res.status(422).json({ error: 'Failed to extract text from document.', documentId: doc.id });
      }

      // 3. Sanitize
      const { text: cleanText, warnings } = sanitize(rawText);
      if (warnings.length > 0) {
        console.log(`⚠️ [BEHAVIOR] Sanitizer warnings for ${fileName}:`, warnings);
      }

      if (cleanText.length < 50) {
        await doc.update({ processingStatus: 'FAILED', errorMessage: 'Document content too short after sanitization.' });
        return res.status(422).json({ error: 'Document has insufficient content.', documentId: doc.id });
      }

      await doc.update({ extractedText: cleanText });

      // 4. Classify document
      console.log(`🔍 [BEHAVIOR] Classifying document ${fileName}...`);
      const classification = await aiService.classifyDocument(cleanText);
      await doc.update({
        classification: classification.classification,
        classificationConfidence: classification.confidence
      });

      // 5. Extract behavior signals
      console.log(`🧠 [BEHAVIOR] Extracting signals from ${fileName} (${classification.classification})...`);
      const result = await aiService.extractBehaviorSignals(cleanText, classification.classification);
      await doc.update({
        signals: result.signals,
        processingStatus: 'DONE'
      });

      // 6. Build diff against current profile
      const currentProfile = connection.behaviorProfile || {};
      const diff = {};
      const suggestionFields = ['suggestedTone', 'suggestedSalesIntensity', 'suggestedResponseLength', 'suggestedEmpathyLevel', 'suggestedComplianceStrictness'];
      const profileFields = ['tone', 'salesIntensity', 'responseLength', 'empathyLevel', 'complianceStrictness'];

      for (let i = 0; i < suggestionFields.length; i++) {
        const newVal = result.suggestion[suggestionFields[i]];
        const currentVal = currentProfile[profileFields[i]] || 'Not set';
        if (newVal && newVal !== currentVal) {
          diff[profileFields[i]] = { from: currentVal, to: newVal };
        }
      }

      // 7. Create suggestion record
      const suggestion = await BehaviorSuggestion.create({
        connectionId,
        documentId: doc.id,
        suggestedTone: result.suggestion.suggestedTone,
        suggestedSalesIntensity: result.suggestion.suggestedSalesIntensity,
        suggestedResponseLength: result.suggestion.suggestedResponseLength,
        suggestedEmpathyLevel: result.suggestion.suggestedEmpathyLevel,
        suggestedComplianceStrictness: result.suggestion.suggestedComplianceStrictness,
        reasoning: result.reasoning,
        confidenceScore: result.confidence,
        diff,
        status: 'PENDING'
      });

      console.log(`✅ [BEHAVIOR] Document processed: ${fileName} → ${classification.classification} (${(result.confidence * 100).toFixed(0)}% confidence)`);

      res.json({
        documentId: doc.id,
        suggestionId: suggestion.id,
        fileName,
        classification: classification.classification,
        classificationConfidence: classification.confidence,
        signals: result.signals,
        suggestion: result.suggestion,
        diff,
        reasoning: result.reasoning,
        confidence: result.confidence,
        warnings,
        message: 'Document processed. Review the suggestion and accept or reject.'
      });

    } catch (error) {
      console.error(`🔥 [BEHAVIOR] Upload Error for ${connectionId}:`, error);
      res.status(500).json({ error: error.message });
    } finally {
      // Clean up uploaded file
      if (filePath) {
        try { fs.unlinkSync(filePath); } catch (e) { /* ignore cleanup errors */ }
      }
    }
  }
);

/**
 * GET /setup/:connectionId/behavior-suggestions
 * List all behavior suggestions for a connection.
 */
router.get("/setup/:connectionId/behavior-suggestions", basicAuth, authorize(['OWNER']), async (req, res) => {
  const { connectionId } = req.params;

  try {
    const suggestions = await BehaviorSuggestion.findAll({
      where: { connectionId },
      include: [{ model: BehaviorDocument, attributes: ['fileName', 'fileType', 'classification', 'classificationConfidence', 'signals', 'processingStatus'] }],
      order: [['createdAt', 'DESC']]
    });

    res.json({ connectionId, suggestions });
  } catch (error) {
    console.error(`🔥 [BEHAVIOR] List Suggestions Error:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /setup/:connectionId/behavior-suggestions/:id/accept
 * Accept a behavior suggestion and apply it to the connection's behaviorProfile.
 */
router.post("/setup/:connectionId/behavior-suggestions/:id/accept", basicAuth, authorize(['OWNER']), async (req, res) => {
  const { connectionId, id } = req.params;

  try {
    const suggestion = await BehaviorSuggestion.findOne({ where: { id, connectionId, status: 'PENDING' } });
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found or already reviewed." });

    const connection = await Connection.findOne({ where: { connectionId } });
    if (!connection) return res.status(404).json({ error: "Connection not found." });

    // Archive current profile
    const currentProfile = connection.behaviorProfile || {};
    const versionHistory = currentProfile._versionHistory || [];
    if (currentProfile.tone || currentProfile.industry) {
      versionHistory.push({
        ...currentProfile,
        _versionHistory: undefined,
        _archivedAt: new Date().toISOString(),
        _source: currentProfile._source || 'unknown'
      });
    }

    // Merge suggestion into profile
    const updatedProfile = {
      ...currentProfile,
      tone: suggestion.suggestedTone || currentProfile.tone,
      salesIntensity: suggestion.suggestedSalesIntensity || currentProfile.salesIntensity,
      responseLength: suggestion.suggestedResponseLength || currentProfile.responseLength,
      empathyLevel: suggestion.suggestedEmpathyLevel || currentProfile.empathyLevel,
      complianceStrictness: suggestion.suggestedComplianceStrictness || currentProfile.complianceStrictness,
      _source: 'document-tuning',
      _tunedAt: new Date().toISOString(),
      _documentId: suggestion.documentId,
      _versionHistory: versionHistory.slice(-10)
    };

    await connection.update({ behaviorProfile: updatedProfile });

    // Mark suggestion accepted
    await suggestion.update({
      status: 'ACCEPTED',
      reviewedBy: req.user?.username || 'admin',
      reviewedAt: new Date(),
      reviewNotes: req.body.notes || null
    });

    console.log(`✅ [BEHAVIOR] Suggestion ${id} ACCEPTED for ${connectionId}`);

    res.json({
      connectionId,
      suggestionId: id,
      status: 'ACCEPTED',
      updatedProfile,
      message: 'Behavior profile updated from document suggestion.'
    });

  } catch (error) {
    console.error(`🔥 [BEHAVIOR] Accept Error:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /setup/:connectionId/behavior-suggestions/:id/reject
 * Reject a behavior suggestion without applying changes.
 */
router.post("/setup/:connectionId/behavior-suggestions/:id/reject", basicAuth, authorize(['OWNER']), async (req, res) => {
  const { connectionId, id } = req.params;

  try {
    const suggestion = await BehaviorSuggestion.findOne({ where: { id, connectionId, status: 'PENDING' } });
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found or already reviewed." });

    await suggestion.update({
      status: 'REJECTED',
      reviewedBy: req.user?.username || 'admin',
      reviewedAt: new Date(),
      reviewNotes: req.body.notes || req.body.reason || null
    });

    console.log(`❌ [BEHAVIOR] Suggestion ${id} REJECTED for ${connectionId}`);

    res.json({
      connectionId,
      suggestionId: id,
      status: 'REJECTED',
      message: 'Suggestion rejected. No changes applied.'
    });

  } catch (error) {
    console.error(`🔥 [BEHAVIOR] Reject Error:`, error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ONBOARDING STEP 4: Test Assistant
// ============================================================

/**
 * GET /setup/:connectionId/test-status
 * Returns test interaction count, drift warnings, launch gate status.
 */
router.get("/setup/:connectionId/test-status", basicAuth, authorize(['OWNER']), async (req, res) => {
  const { connectionId } = req.params;

  try {
    const connection = await Connection.findOne({ where: { connectionId } });
    if (!connection) {
      return res.status(404).json({ error: "Connection not found." });
    }

    // Count test interactions from admin test session
    const ChatSession = require('../models/ChatSession');
    const testSessionId = `admin-test-${connectionId}`;
    const session = await ChatSession.findOne({ where: { sessionId: testSessionId } });

    let interactionCount = 0;
    if (session) {
      let messages = session.messages || [];
      if (typeof messages === 'string') {
        try { messages = JSON.parse(messages); } catch { messages = []; }
      }
      // Count user messages (each user msg = 1 interaction)
      interactionCount = messages.filter(m => m.role === 'user').length;
    }

    // Count drift warnings
    const ConnectionKnowledge = require('../models/ConnectionKnowledge');
    let driftWarnings = 0;
    let criticalDrifts = 0;
    try {
      const driftedEntries = await ConnectionKnowledge.findAll({
        where: { connectionId, status: 'FAILED' },
        attributes: ['metadata']
      });
      driftWarnings = driftedEntries.length;
      criticalDrifts = driftedEntries.filter(e => {
        const meta = e.metadata || {};
        return meta.driftDetected === true;
      }).length;
    } catch { /* ConnectionKnowledge may not have entries */ }

    // Feedback summary from onboardingMeta
    const meta = connection.onboardingMeta || {};
    const feedback = meta.testFeedback || [];
    const thumbsUp = feedback.filter(f => f.vote === 'up').length;
    const thumbsDown = feedback.filter(f => f.vote === 'down').length;

    // Launch gate: ≥3 interactions AND 0 critical drifts
    const MIN_INTERACTIONS = 3;
    const launchReady = interactionCount >= MIN_INTERACTIONS && criticalDrifts === 0;

    res.json({
      connectionId,
      interactionCount,
      minInteractions: MIN_INTERACTIONS,
      driftWarnings,
      criticalDrifts,
      launchReady,
      feedbackSummary: { thumbsUp, thumbsDown, total: feedback.length }
    });

  } catch (error) {
    console.error(`🔥 [TEST] Status Error for ${connectionId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /setup/:connectionId/test-feedback
 * Records thumbs up/down for a test message.
 * Body: { msgIndex, vote: 'up'|'down', question, answer }
 */
router.post("/setup/:connectionId/test-feedback", basicAuth, authorize(['OWNER']), async (req, res) => {
  const { connectionId } = req.params;
  const { msgIndex, vote, question, answer } = req.body;

  try {
    const connection = await Connection.findByPk(connectionId);
    if (!connection) {
      return res.status(404).json({ error: "Connection not found." });
    }

    if (!vote || !['up', 'down'].includes(vote)) {
      return res.status(400).json({ error: "Vote must be 'up' or 'down'." });
    }

    const meta = connection.onboardingMeta || {};
    const feedback = meta.testFeedback || [];

    // Add or update feedback for this message
    const existingIdx = feedback.findIndex(f => f.msgIndex === msgIndex);
    const entry = {
      msgIndex,
      vote,
      question: (question || '').substring(0, 200),
      answer: (answer || '').substring(0, 200),
      timestamp: new Date().toISOString()
    };

    if (existingIdx >= 0) {
      feedback[existingIdx] = entry;
    } else {
      feedback.push(entry);
    }

    meta.testFeedback = feedback;
    await connection.update({ onboardingMeta: meta });

    console.log(`👍 [TEST] Feedback ${vote} for msg ${msgIndex} on ${connectionId}`);

    res.json({
      success: true,
      feedbackSummary: {
        thumbsUp: feedback.filter(f => f.vote === 'up').length,
        thumbsDown: feedback.filter(f => f.vote === 'down').length,
        total: feedback.length
      }
    });

  } catch (error) {
    console.error(`🔥 [TEST] Feedback Error for ${connectionId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ONBOARDING STEP 5: LAUNCH
// ============================================================

/**
 * GET /setup/:connectionId/pre-launch-check
 * Runs all validation checks and returns results (does NOT launch).
 */
router.get("/setup/:connectionId/pre-launch-check", basicAuth, authorize(['OWNER']), async (req, res) => {
  const { connectionId } = req.params;

  try {
    const connection = await Connection.findByPk(connectionId);
    if (!connection) return res.status(404).json({ error: "Connection not found." });

    const checks = await runPreLaunchChecks(connection);

    res.json({
      connectionId,
      checks,
      allPassed: checks.every(c => c.passed),
      alreadyLaunched: connection.launchStatus === 'LAUNCHED'
    });

  } catch (error) {
    console.error(`🔥 [LAUNCH] Pre-check Error for ${connectionId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /setup/:connectionId/launch
 * Irreversible launch — validates everything, sets LAUNCHED, locks wizard.
 */
router.post("/setup/:connectionId/launch", basicAuth, authorize(['OWNER']), async (req, res) => {
  const { connectionId } = req.params;

  try {
    const connection = await Connection.findByPk(connectionId);
    if (!connection) return res.status(404).json({ error: "Connection not found." });

    // IRREVERSIBLE: block if already launched
    if (connection.launchStatus === 'LAUNCHED') {
      return res.status(409).json({
        error: "Already launched. Launch is irreversible.",
        launchedAt: connection.onboardingCompletedAt
      });
    }

    // Run all pre-launch validations
    const checks = await runPreLaunchChecks(connection);
    const allPassed = checks.every(c => c.passed);

    if (!allPassed) {
      return res.status(422).json({
        error: "Pre-launch validation failed. Resolve all issues before launching.",
        checks
      });
    }

    // ── LAUNCH ──
    const launchTimestamp = new Date().toISOString();
    const meta = connection.onboardingMeta || {};
    const auditLog = meta.auditLog || [];

    auditLog.push({
      event: 'LAUNCHED',
      timestamp: launchTimestamp,
      checks: checks.map(c => ({ label: c.label, passed: c.passed })),
      actor: 'admin'
    });

    meta.auditLog = auditLog;

    await connection.update({
      launchStatus: 'LAUNCHED',
      status: 'LAUNCHED',
      onboardingStep: 6,
      onboardingCompletedAt: launchTimestamp,
      onboardingMeta: meta
    });

    console.log(`🚀 [LAUNCH] Connection ${connectionId} LAUNCHED at ${launchTimestamp}`);

    res.json({
      success: true,
      connectionId,
      launchStatus: 'LAUNCHED',
      launchedAt: launchTimestamp,
      message: 'Chatbot launched successfully! This action is permanent.'
    });

  } catch (error) {
    console.error(`🔥 [LAUNCH] Error for ${connectionId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Helper: Run all pre-launch validation checks
 */
async function runPreLaunchChecks(connection) {
  const checks = [];

  // 1. Content Coverage — at least 3 fetched pages
  try {
    const PageContent = require('../models/PageContent');
    const pageCount = await PageContent.count({
      where: { connectionId: connection.connectionId, status: 'FETCHED' }
    });
    checks.push({
      id: 'coverage',
      label: 'Content Coverage',
      detail: `${pageCount} page(s) indexed`,
      passed: pageCount >= 3
    });
  } catch {
    checks.push({ id: 'coverage', label: 'Content Coverage', detail: 'Unable to check', passed: false });
  }

  // 2. Brand Alignment — brandingStatus must be READY
  checks.push({
    id: 'branding',
    label: 'Brand Alignment',
    detail: `Status: ${connection.brandingStatus || 'PENDING'}`,
    passed: connection.brandingStatus === 'READY'
  });

  // 3. Test Interactions — at least 3 from admin test session
  try {
    const ChatSession = require('../models/ChatSession');
    const testSessionId = `admin-test-${connection.connectionId}`;
    const session = await ChatSession.findOne({ where: { sessionId: testSessionId } });

    let interactionCount = 0;
    if (session) {
      let messages = session.messages || [];
      if (typeof messages === 'string') {
        try { messages = JSON.parse(messages); } catch { messages = []; }
      }
      interactionCount = messages.filter(m => m.role === 'user').length;
    }

    checks.push({
      id: 'testing',
      label: 'Test Interactions',
      detail: `${interactionCount} / 3 completed`,
      passed: interactionCount >= 3
    });
  } catch {
    checks.push({ id: 'testing', label: 'Test Interactions', detail: 'Unable to check', passed: false });
  }

  // 4. Confidence Gate — must be ACTIVE
  checks.push({
    id: 'confidence',
    label: 'Confidence Policy',
    detail: `Gate: ${connection.confidenceGateStatus || 'ACTIVE'}`,
    passed: (connection.confidenceGateStatus || 'ACTIVE') === 'ACTIVE'
  });

  // 5. No Critical Drift
  try {
    const ConnectionKnowledge = require('../models/ConnectionKnowledge');
    const driftedEntries = await ConnectionKnowledge.findAll({
      where: { connectionId: connection.connectionId, status: 'FAILED' },
      attributes: ['metadata']
    });
    const criticalDrifts = driftedEntries.filter(e => {
      const meta = e.metadata || {};
      return meta.driftDetected === true;
    }).length;

    checks.push({
      id: 'drift',
      label: 'Drift Status',
      detail: criticalDrifts > 0 ? `${criticalDrifts} critical drift(s)` : 'No drift detected',
      passed: criticalDrifts === 0
    });
  } catch {
    checks.push({ id: 'drift', label: 'Drift Status', detail: 'No drift data', passed: true });
  }

  return checks;
}

// ============================================================
// ONBOARDING STEP 6: MONITOR DASHBOARD
// ============================================================

/**
 * GET /setup/:connectionId/monitor
 * Returns aggregated post-launch monitoring metrics.
 */
router.get("/setup/:connectionId/monitor", basicAuth, authorize(['OWNER']), async (req, res) => {
  const { connectionId } = req.params;

  try {
    const connection = await Connection.findOne({ where: { connectionId } });
    if (!connection) return res.status(404).json({ error: "Connection not found." });

    const ChatSession = require('../models/ChatSession');
    const PageContent = require('../models/PageContent');
    const ConnectionKnowledge = require('../models/ConnectionKnowledge');

    // 1. Conversations count — unique sessions for this connection
    let conversationCount = 0;
    try {
      const { Op } = require('sequelize');
      conversationCount = await ChatSession.count({
        where: {
          connectionId,
          sessionId: { [Op.notLike]: 'admin-test-%' }
        }
      });
    } catch { /* table might not exist yet */ }

    // 2. Average confidence — from chat sessions' messages metadata
    let avgConfidence = null;
    try {
      const sessions = await ChatSession.findAll({
        where: { connectionId },
        attributes: ['messages'],
        limit: 50,
        order: [['updatedAt', 'DESC']]
      });

      const scores = [];
      sessions.forEach(s => {
        let msgs = s.messages || [];
        if (typeof msgs === 'string') {
          try { msgs = JSON.parse(msgs); } catch { msgs = []; }
        }
        msgs.forEach(m => {
          if (m.role === 'assistant' && m.metadata && m.metadata.confidenceScore !== undefined) {
            scores.push(m.metadata.confidenceScore);
          }
        });
      });

      if (scores.length > 0) {
        avgConfidence = scores.reduce((a, b) => a + b, 0) / scores.length;
      }
    } catch { /* ignore */ }

    // 3. Coverage % — pages fetched vs discovered
    let coveragePct = 0;
    let totalPages = 0;
    let fetchedPages = 0;
    try {
      totalPages = await PageContent.count({ where: { connectionId } });
      fetchedPages = await PageContent.count({ where: { connectionId, status: 'FETCHED' } });
      coveragePct = totalPages > 0 ? Math.round((fetchedPages / totalPages) * 100) : 0;
    } catch { /* ignore */ }

    // 4. Drift alerts
    let driftAlerts = 0;
    let criticalDrifts = 0;
    try {
      const drifted = await ConnectionKnowledge.findAll({
        where: { connectionId, status: 'FAILED' },
        attributes: ['metadata']
      });
      driftAlerts = drifted.length;
      criticalDrifts = drifted.filter(e => {
        const meta = e.metadata || {};
        return meta.driftDetected === true;
      }).length;
    } catch { /* ignore */ }

    // 5. Health score (from Connection model)
    const healthScore = connection.healthScore || 100;

    // 6. Brand alignment
    const brandAlignment = connection.brandingStatus || 'PENDING';

    // 7. Extraction pending count
    let extractionPending = 0;
    try {
      extractionPending = await PageContent.count({
        where: { connectionId, status: 'DISCOVERED' }
      });
    } catch { /* ignore */ }

    // Risk level computation
    let riskLevel = 'LOW';
    let riskFactors = [];
    if (criticalDrifts > 0) { riskLevel = 'CRITICAL'; riskFactors.push(`${criticalDrifts} critical drift(s)`); }
    else if (healthScore < 50) { riskLevel = 'HIGH'; riskFactors.push(`Health score ${healthScore}%`); }
    else if (driftAlerts > 0 || coveragePct < 50) {
      riskLevel = 'MEDIUM';
      if (driftAlerts > 0) riskFactors.push(`${driftAlerts} drift alert(s)`);
      if (coveragePct < 50) riskFactors.push(`Low coverage ${coveragePct}%`);
    }

    if (brandAlignment !== 'READY') riskFactors.push(`Brand: ${brandAlignment}`);
    if (extractionPending > 5) riskFactors.push(`${extractionPending} pages pending`);

    res.json({
      connectionId,
      metrics: {
        conversationCount,
        avgConfidence: avgConfidence !== null ? Math.round(avgConfidence * 100) / 100 : null,
        coveragePct,
        totalPages,
        fetchedPages,
        driftAlerts,
        criticalDrifts,
        healthScore,
        brandAlignment,
        extractionPending
      },
      risk: {
        level: riskLevel,
        factors: riskFactors
      },
      launchedAt: connection.onboardingCompletedAt,
      assistantName: connection.assistantName
    });

  } catch (error) {
    console.error(`🔥 [MONITOR] Error for ${connectionId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
