const express = require("express");
const sequelize = require("../config/db");
const router = express.Router();
const Connection = require("../models/Connection");
const ConnectionKnowledge = require("../models/ConnectionKnowledge");
const scraperService = require("../services/scraperService");
const aiService = require("../services/aiservice");

console.log("🔥 connectionRoutes.js LOADED");

// Create a new connection
router.post("/create", async (req, res) => {
  try {
    const connection = await Connection.create(req.body);
    res.json(connection);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- PART 1: AUTO EXTRACT / BRANDING (Identity) ---
// Fetch Branding (Favicon/Logo) - Updates Identity ONLY
router.post("/:connectionId/branding/fetch", async (req, res) => {
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
router.post("/:connectionId/knowledge/ingest", async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { sourceType, sourceValue } = req.body; // 'URL' or 'TEXT'

    if (!sourceType || !sourceValue) return res.status(400).json({ error: "Missing type or value" });

    const connection = await Connection.findOne({ where: { connectionId } });
    if (!connection) return res.status(404).json({ error: "Connection not found" });

    // Idempotency: Check if exists to avoid duplicates
    // We match strict sourceType + sourceValue for the same connection
    let knowledge = await ConnectionKnowledge.findOne({
      where: { connectionId, sourceType, sourceValue }
    });

    // Process Content
    let contentData = { rawText: "", cleanedText: "" };

    if (sourceType === 'URL') {
      contentData = await scraperService.ingestURL(sourceValue);
    } else {
      contentData = scraperService.ingestText(sourceValue);
    }

    if (knowledge) {
      // Update existing
      await knowledge.update({
        rawText: contentData.rawText,
        cleanedText: contentData.cleanedText,
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
router.post("/:connectionId/auto-extract", async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { url } = req.body;
    const isTemp = connectionId === 'temp';

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
router.post("/:connectionId/knowledge-ingest", async (req, res) => {
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
    let contentData = { rawText: "", cleanedText: "" };
    if (sourceType.toLowerCase() === 'url') {
      contentData = await scraperService.ingestURL(sourceValue);
    } else {
      contentData = scraperService.ingestText(sourceValue);
    }

    // Idempotency: Update existing or create new
    const [knowledge, created] = await ConnectionKnowledge.findOrCreate({
      where: { connectionId, sourceType: sourceType.toUpperCase(), sourceValue },
      defaults: {
        rawText: contentData.rawText,
        cleanedText: contentData.cleanedText,
        status: 'READY'
      }
    });

    if (!created) {
      await knowledge.update({
        rawText: contentData.rawText,
        cleanedText: contentData.cleanedText,
        status: 'READY'
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
router.post("/scrape", async (req, res) => {
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
router.post("/auto-extract", async (req, res) => {
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
router.get("/list", async (req, res) => {
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
router.get("/:connectionId", async (req, res) => {
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
router.get("/:connectionId/details", async (req, res) => {
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
router.put("/:connectionId", async (req, res) => {
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
router.delete("/:connectionId", async (req, res) => {
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

module.exports = router;
