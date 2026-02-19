const ChatSession = require("../models/ChatSession");
const Connection = require("../models/Connection");
const ConnectionKnowledge = require("../models/ConnectionKnowledge");
const ConfidencePolicy = require("../models/ConfidencePolicy");

const promptService = require("../services/promptService");
const aiService = require("../services/aiService");
const { detectKnowledgeGap } = require("../services/gapDetectionService");
const { sendSlackAlert } = require("../services/integrations/slackService");
const tokenLogger = require("../utils/tokenLogger");

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
// Stream Chat Handler (Server-Sent Events)
// ===============================
const streamMessage = async (req, res) => {
  // 1. Setup SSE Headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { message, connectionId, sessionId, url } = req.body;

    if (!message || !sessionId || !connectionId) {
      sendEvent({ error: "Missing required fields" });
      res.end();
      return;
    }

    // 2. Validate connection
    const connectionObj = await Connection.findOne({ where: { connectionId } });
    if (!connectionObj) {
      sendEvent({ error: "Invalid connection" });
      res.end();
      return;
    }

    // 3. Load or create session
    let session = await ChatSession.findOne({ where: { sessionId } });
    if (session && session.connectionId !== connectionId) {
      sendEvent({ error: "Session validation failed" });
      res.end();
      return;
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

    // 4. AI Permission Check
    let perms = connectionObj.permissions || {};
    if (typeof perms === "string") {
      try { perm = JSON.parse(perms); } catch { }
    }

    if (perms.aiEnabled === false) {
      sendEvent({ token: "AI Chat is disabled.", done: true });
      res.end();
      return;
    }

    // 5. Assemble Prompt & Start Stream
    const assembledPrompt = await promptService.assemblePrompt(connectionId, url, "");

    const { stream, sources, model, provider } = await aiService.streamChat({
      message,
      history,
      connectionId,
      systemPrompt: assembledPrompt,
      memory: session.memory
    });

    // 6. Send Metadata First (Sources)
    let aiMetadata = { sources };
    // Calculate aggregate confidence
    let aggConfidence = null;
    if (sources.length) {
      const scores = sources.map(s => s.confidenceScore);
      if (scores.length) aggConfidence = scores.reduce((a, b) => a + b, 0) / scores.length;
    }

    // Check Confidence Gating (Optional: if we want to block stream on low confidence, 
    // we have to buffer first chunk. For now, we stream and flag metadata)
    try {
      const policy = await ConfidencePolicy.findOne({ where: { connectionId } });
      if (policy && aggConfidence !== null && aggConfidence < policy.minAnswerConfidence) {
        aiMetadata.gated = true;
        aiMetadata.confidenceScore = aggConfidence;
        aiMetadata.lowConfidenceAction = policy.lowConfidenceAction;

        // If REFUSE action, we might want to stop here.
        if (policy.lowConfidenceAction === 'REFUSE') {
          sendEvent({ token: "I'm not fully confident in that answer.", done: true, metadata: aiMetadata });
          res.end();
          return;
        }
      }
    } catch (e) { }

    sendEvent({ type: 'metadata', data: aiMetadata });

    // 7. Stream Tokens
    let fullReply = "";

    for await (const chunk of stream) {
      // Capture Token Usage (Last Chunk)
      if (chunk.usage) {
        tokenLogger.recordUsage({
          connectionId: connectionId,
          provider: provider,
          model: model,
          usage: chunk.usage,
          context: 'stream_chat'
        });
      }

      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        fullReply += content;
        sendEvent({ token: content });
      }
    }

  } catch (error) {
    console.error("Stream Error:", error);
    sendEvent({ error: "Internal Server Error" });
    res.end();
  }
};

// ===============================
// Export
// ===============================
module.exports = {
  handleChat,
  sendMessage,
  streamMessage
};
