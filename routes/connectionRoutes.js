const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const sequelize = require("../config/db");
const router = express.Router();
const Connection = require("../models/Connection");
const ConnectionKnowledge = require("../models/ConnectionKnowledge");
const PendingExtraction = require("../models/PendingExtraction");
const scraperService = require("../services/scraperService");
const aiService = require("../services/aiservice");
const authorize = require("../middleware/rbac");
const basicAuth = require("../middleware/auth");

console.log("🔥 connectionRoutes.js LOADED");

router.use((req, res, next) => {
  console.log(`[DEBUG] Connection Route Hit: ${req.method} ${req.path}`);
  next();
});

// Create a new connection
router.post("/create", basicAuth, authorize(['OWNER']), async (req, res) => {
  try {
    // Phase 1: Secure Creation
    if (req.body.password) {
      req.body.passwordHash = await bcrypt.hash(req.body.password, 10);
      delete req.body.password;
    }

    req.body.status = "CREATED"; // Enforce default

    const connection = await Connection.create(req.body);
    res.json(connection);
  } catch (error) {
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
 * AUTO EXTRACT (Setup)
 * Goal: Initialize Bot Identity.
 * Rule: Identity fields ONLY. No training data.
 */
router.post("/:connectionId/auto-extract",
  basicAuth,
  authorize(['OWNER']),
  require("../middleware/rateLimiter").widgetExtraction,
  async (req, res) => {
    try {
      const { connectionId } = req.params;
      const { url } = req.body;
      const isTemp = connectionId === 'temp';

      // FEATURE FLAG CHECK
      const settings = require("../config/settings");
      if (!settings.features.extractionEnabled) {
        console.warn(`🛑 [BLOCKED] Auto-extract attempted in ${settings.env} mode.`);
        return res.status(403).json({ error: "Feature Disabled: Auto-Extraction is OFF in this environment." });
      }

      console.log(`📡 [DEBUG] Auto-Extract started for connectionId: ${connectionId}, url: ${url}`);

      let connection = null;
      if (!isTemp) {
        connection = await Connection.findOne({ where: { connectionId } });
        if (!connection) {
          console.warn(`⚠️ [DEBUG] Connection not found for ID: ${connectionId}`);
          return res.status(404).json({ error: "Connection not found" });
        }
      }

      if (!url) return res.status(400).json({ error: "URL is required" });

      // 1. Scrape Metadata & Text
      console.log(`🔍 [DEBUG] Step 1: Scraping website...`);
      const result = await scraperService.scrapeWebsite(url);
      if (!result.success) {
        console.error(`🔥 [DEBUG] Step 1 Failed: ${result.error}`);
        return res.status(500).json({ error: result.error });
      }

      // 2. Fetch Branding (Images)
      console.log(`🎨 [DEBUG] Step 2: Fetching branding...`);
      const branding = await scraperService.fetchBranding(url, connectionId);

      // 3. AI Inference for Identity
      console.log(`🤖 [DEBUG] Step 3: Running AI inference...`);
      let identity = null;
      try {
        identity = await aiService.inferBotIdentity(result.rawText);
      } catch (aiErr) {
        console.error("🔥 AI Inference failed during extract:", aiErr.message);
      }

      if (!identity) {
        console.warn(`⚠️ [DEBUG] Step 3: AI Inference returned null`);
      }

      // 4. In-Memory Identity object
      const botIdentity = {
        assistantName: identity?.bot_name || result.metadata?.title || "AI Assistant",
        welcomeMessage: identity?.welcome_message || `Welcome to ${result.metadata?.title || 'our site'}!`,
        tone: identity?.tone || "neutral",
        websiteDescription: identity?.site_summary || result.metadata?.description || "",
        logoUrl: branding.logoPath || branding.faviconPath || null, // Best available
        brandingStatus: branding.status
      };

      // 5. Update DB ONLY if not temp
      if (connection) {
        console.log(`💾 [DEBUG] Step 5: Updating database for connection...`);
        await connection.update({
          assistantName: botIdentity.assistantName,
          welcomeMessage: botIdentity.welcomeMessage,
          tone: botIdentity.tone,
          websiteDescription: botIdentity.websiteDescription,
          logoUrl: botIdentity.logoUrl,
          brandingStatus: botIdentity.brandingStatus
        });
      }

      console.log(`✅ [DEBUG] Auto-Extract complete for ${connectionId}`);
      res.json({
        status: "initialized",
        isTemp,
        bot_identity: {
          name: botIdentity.assistantName,
          welcomeMessage: botIdentity.welcomeMessage,
          tone: botIdentity.tone,
          summary: botIdentity.websiteDescription,
          logoUrl: botIdentity.logoUrl
        }
      });

    } catch (error) {
      console.error("🔥 [DEBUG] CRITICAL LOG - Auto-Extract Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

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

// --- Phase 3.2: Drift Detection (Public via Widget) ---
router.post("/:connectionId/drift-check",
  require("../middleware/rateLimiter").widgetExtraction, // Rate Limit First
  async (req, res) => {
    try {
      const { connectionId } = req.params;
      const { url, currentHash } = req.body;

      if (!url || !currentHash) {
        return res.status(400).json({ error: "Missing url or hash" });
      }

      // Find Knowledge for this URL
      // We assume 'sourceValue' stores the URL
      const knowledge = await ConnectionKnowledge.findOne({
        where: { connectionId, sourceType: 'URL', sourceValue: url }
      });

      if (!knowledge) {
        // Not monitored, ignore
        return res.json({ status: "uknown", monitored: false });
      }

      // Compare Hash
      if (knowledge.contentHash !== currentHash) {
        console.warn(`⚠️ [AUDIT] DRIFT DETECTED for ${url} (Connection: ${connectionId})`);
        await knowledge.update({
          status: 'STALE',
          lastCheckedAt: new Date(),
          metadata: { ...knowledge.metadata, driftDetected: true, lastDriftAt: new Date() }
        });
        return res.json({ status: "drifted", monitored: true });
      }

      // All good
      await knowledge.update({ lastCheckedAt: new Date() });
      res.json({ status: "synced", monitored: true });

    } catch (error) {
      console.error("Drift Check Error:", error);
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

// Auto-extract knowledge base from host website
router.post("/auto-extract", basicAuth, authorize(['OWNER']), async (req, res) => {
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

    // Check if knowledge base already exists and is not empty/default
    if (connection.knowledgeBase && connection.knowledgeBase.length > 50) {
      console.log(`✅ Knowledge base already exists for ${connectionId}, skipping extraction`);
      return res.json({
        success: true,
        message: "Knowledge base already exists",
        alreadyExtracted: true
      });
    }

    // Scrape the host website
    console.log(`🌐 Scraping host website: ${hostUrl}`);
    const result = await scraperService.scrapeWebsite(hostUrl);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    // Update the connection with extracted data
    await connection.update({
      knowledgeBase: result.knowledgeBase,
      assistantName: result.suggestedBotName || connection.assistantName,
      welcomeMessage: result.suggestedWelcome || connection.welcomeMessage,
      tone: result.suggestedTone || connection.tone,
      websiteName: result.metadata.title || connection.websiteName,
      websiteDescription: result.metadata.description || connection.websiteDescription,
      logoUrl: result.logoUrl || connection.logoUrl,
      extractedTools: result.extractedTools || []
    });

    console.log(`✅ Knowledge base extracted and saved for ${connectionId}`);

    res.json({
      success: true,
      message: "Knowledge base extracted successfully",
      botName: result.suggestedBotName,
      welcomeMessage: result.suggestedWelcome,
      knowledgeBasePreview: result.knowledgeBase.substring(0, 200)
    });

  } catch (error) {
    console.error("❌ Auto-extract error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all connections
router.get("/list", basicAuth, authorize(['VIEWER', 'EDITOR', 'OWNER']), async (req, res) => {
  try {
    const connections = await Connection.findAll({
      attributes: ["id", "connectionId", "websiteName", "assistantName", "createdAt", "logoUrl"]
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

// Update connection
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

module.exports = router;
