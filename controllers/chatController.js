const ChatSession = require("../models/ChatSession");
const Connection = require("../models/Connection");
const ConnectionKnowledge = require("../models/ConnectionKnowledge");
const ConfidencePolicy = require("../models/ConfidencePolicy");

const promptService = require("../services/promptService");
const aiService = require("../services/aiService");
const { detectKnowledgeGap } = require("../services/gapDetectionService");
const { sendSlackAlert } = require("../services/integrations/slackService");

// ===============================
// Helper: Send Reply
// ===============================
const sendReply = (res, message, suggestions = [], aiMetadata = null) => {
  return res.status(200).json({
    messages: [{ role: "assistant", text: message }],
    suggestions,
    ai_metadata: aiMetadata
  });
};

// ===============================
// Basic Health Test Route
// ===============================
const handleChat = async (req, res) => {
  try {
    res.json({ success: true, message: "Chat route working" });
  } catch (error) {
    console.error("Chat Error:", error);
    res.status(500).json({ success: false });
  }
};

// ===============================
// Main Chat Handler
// ===============================
const sendMessage = async (req, res) => {
  try {
    const { message, connectionId, sessionId, url } = req.body;

    if (!message || !sessionId || !connectionId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate connection
    const connectionObj = await Connection.findOne({ where: { connectionId } });
    if (!connectionObj) {
      return res.status(404).json({ error: "Invalid connection" });
    }

    // Load or create session
    let session = await ChatSession.findOne({ where: { sessionId } });

    if (session && session.connectionId !== connectionId) {
      return res.status(403).json({ error: "Session validation failed" });
    }

    if (!session) {
      session = await ChatSession.create({
        sessionId,
        connectionId,
        messages: [],
        currentStep: "NONE",
        tempData: {},
        mode: "FREE_CHAT"
      });
    }

    let history = session.messages || [];
    if (typeof history === "string") {
      try {
        history = JSON.parse(history);
      } catch {
        history = [];
      }
    }

    // AI Permission Check
    let perms = connectionObj.permissions || {};
    if (typeof perms === "string") {
      try {
        perms = JSON.parse(perms);
      } catch {
        perms = {};
      }
    }

    let aiReply = "AI Chat is disabled.";
    let aiMetadata = null;

    if (perms.aiEnabled !== false) {
      const assembledPrompt =
        await promptService.assemblePrompt(connectionId, url, "");

      const aiOutput = await aiService.freeChat({
        message,
        history,
        connectionId,
        systemPrompt: assembledPrompt,
        memory: session.memory
      });

      if (typeof aiOutput === "object") {
        aiReply = aiOutput.reply;
        aiMetadata = { sources: aiOutput.sources || [] };
      } else {
        aiReply = aiOutput;
      }
    }

    // Compute Confidence
    let aggConfidence = null;

    if (aiMetadata?.sources?.length) {
      const scores = aiMetadata.sources
        .filter(s => s.confidenceScore !== undefined)
        .map(s => s.confidenceScore);

      if (scores.length) {
        aggConfidence =
          scores.reduce((a, b) => a + b, 0) / scores.length;
      }
    }

    // Confidence Gating
    try {
      const policy = await ConfidencePolicy.findOne({
        where: { connectionId }
      });

      if (policy && aggConfidence !== null) {
        const belowConfidence =
          aggConfidence < policy.minAnswerConfidence;

        if (belowConfidence) {
          aiMetadata = {
            ...(aiMetadata || {}),
            gated: true,
            confidenceScore: aggConfidence
          };

          switch (policy.lowConfidenceAction) {
            case "REFUSE":
              aiReply = "I'm not fully confident in that answer.";
              break;

            case "CLARIFY":
              aiReply = "Could you clarify your question?";
              break;

            case "ESCALATE":
              aiReply = "Let me connect you to support.";
              await sendSlackAlert(
                process.env.SLACK_WEBHOOK,
                `Escalation from ${connectionId}: ${message}`
              );
              break;

            default:
              aiReply =
                "⚠️ This may not be fully accurate: " + aiReply;
          }
        }
      }
    } catch (err) {
      console.error("Confidence policy error:", err.message);
    }

    // Gap Detection
    try {
      const slackUrl = (connectionObj.widgetConfig && connectionObj.widgetConfig.slackWebhook) || process.env.SLACK_WEBHOOK;
      await detectKnowledgeGap({
        connectionId,
        query: message,
        similarityScore: aggConfidence,
        aiResponse: aiReply,
        slackWebhook: slackUrl
      });
    } catch (gapErr) {
      console.error("Gap detection error:", gapErr.message);
    }

    // Save history
    history.push({ role: "user", text: message });
    history.push({
      role: "assistant",
      text: aiReply,
      ai_metadata: aiMetadata
    });

    session.messages = history;
    session.changed("messages", true);
    await session.save();

    // --- PHASE 3.3: BACKGROUND MEMORY (Long-term) ---
    if (history.length > 20) {
      const memory = session.memory || {};
      const lastSummaryUpdate = memory.summaryUpdatedAt ? new Date(memory.summaryUpdatedAt) : 0;

      // Only summarize every 5 minutes or if no summary exists
      if (!memory.summary || (Date.now() - lastSummaryUpdate > 300000)) {
        aiService.summarizeHistory(history).then(async (newSummary) => {
          if (newSummary) {
            session.memory = {
              ...memory,
              summary: newSummary,
              summaryUpdatedAt: new Date()
            };
            await session.save();
            console.log(`[MEMORY] Updated summary for session ${sessionId}`);
          }
        }).catch(err => console.error("Background summary error:", err.message));
      }
    }

    // --- BUTTON SYSTEM: Trigger Matching ---
    let matchedButtons = [];
    let isQuickReply = false;

    try {
      const ButtonSet = require("../models/ButtonSet");
      const { Op } = require("sequelize");

      // Determine trigger context
      const isFirstMessage = history.length <= 2; // user + assistant = 2
      const isLowConfidence = aggConfidence !== null && aggConfidence < 0.65;

      // Build trigger query — priority: WELCOME > KEYWORD > FALLBACK
      let triggerWhere = { connectionId, active: true };

      if (isFirstMessage) {
        triggerWhere.triggerType = { [Op.in]: ['WELCOME', 'KEYWORD', 'FALLBACK'] };
      } else {
        triggerWhere.triggerType = { [Op.in]: ['KEYWORD', 'FALLBACK'] };
      }

      const buttonSets = await ButtonSet.findAll({
        where: triggerWhere,
        order: [['triggerType', 'ASC']] // FALLBACK < KEYWORD < WELCOME alphabetically
      });

      let matched = null;

      for (const set of buttonSets) {
        if (set.triggerType === 'WELCOME' && isFirstMessage) {
          matched = set;
          break; // WELCOME has highest priority on first message
        }
        if (set.triggerType === 'KEYWORD' && set.triggerValue) {
          const keywords = set.triggerValue.toLowerCase().split(',').map(k => k.trim());
          const msgLower = message.toLowerCase();
          if (keywords.some(kw => msgLower.includes(kw))) {
            matched = set;
            break;
          }
        }
        if (set.triggerType === 'FALLBACK' && isLowConfidence && !matched) {
          matched = set;
        }
      }

      if (matched) {
        matchedButtons = matched.buttons || [];
        isQuickReply = matched.isQuickReply || false;
      }
    } catch (btnErr) {
      console.error("[BUTTONS] Trigger matching error:", btnErr.message);
    }

    // Build response
    const response = {
      messages: [{ role: "assistant", text: aiReply }],
      suggestions: [],
      ai_metadata: aiMetadata
    };

    if (matchedButtons.length > 0) {
      response.buttons = matchedButtons;
      response.buttonsQuickReply = isQuickReply;
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error("Chat Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ===============================
// Export
// ===============================
module.exports = {
  handleChat,
  sendMessage
};
