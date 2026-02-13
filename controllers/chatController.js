const ChatSession = require("../models/ChatSession");
const Connection = require("../models/Connection");
const ConnectionKnowledge = require("../models/ConnectionKnowledge"); // Added missing import
const Idea = require("../models/Idea");
const aiService = require("../services/aiservice");
const actionService = require("../services/actionService");
const promptService = require("../services/promptService");

// Helper to send standardized response
const sendReply = (res, message, suggestions = [], aiMetadata = null, messageIndex = -1) => {
  return res.status(200).json({
    messages: [{ role: "assistant", text: message }],
    suggestions,
    ai_metadata: aiMetadata,
    messageIndex // Added index
  });
};

exports.sendMessage = async (req, res) => {
  try {
    const { message, connectionId, sessionId, url } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({ error: "Missing message or sessionId" });
    }

    // 1. Load or Create Session
    let session = await ChatSession.findOne({ where: { sessionId } });

    if (!session) {
      session = await ChatSession.create({
        sessionId,
        connectionId,
        messages: [],
        currentStep: 'NONE',
        tempData: {},
        mode: 'FREE_CHAT' // Default mode
      });
    }

    // Ensure session.tempData is an object
    let tempData = session.tempData || {};
    if (typeof tempData === 'string') {
      try { tempData = JSON.parse(tempData); } catch (e) { tempData = {}; }
    }

    // Ensure session.mode is valid (fallback)
    if (!session.mode) session.mode = 'FREE_CHAT';

    let response = { text: "", suggestions: [], ai_metadata: null };
    let nextStep = session.currentStep;

    console.log(`[${session.mode}] Step: ${session.currentStep} | Input: "${message}"`);

    // --- MODE SWITCHING LOGIC --- //

    // Check Trigger to ENTER Guided Flow
    if (session.mode === 'FREE_CHAT') {
      const lower = message.toLowerCase();
      if (lower.includes("submit idea") || lower.includes("new idea") || lower.includes("start submission")) {

        // --- PERMISSION CHECK: GUIDED FLOW ---
        const connectionObj = await Connection.findOne({ where: { connectionId } });
        const perms = connectionObj ? connectionObj.permissions : null;
        let allowedModes = ["FREE_CHAT"];

        // Handle JSON string vs Object
        let permsObj = perms;
        if (typeof perms === 'string') {
          try { permsObj = JSON.parse(perms); } catch (e) { permsObj = {}; }
        }

        if (permsObj && permsObj.modes) {
          allowedModes = permsObj.modes;
        }

        if (allowedModes.includes("GUIDED_FLOW")) {
          console.log("🔀 Switching to GUIDED_FLOW");
          session.mode = 'GUIDED_FLOW';
          session.currentStep = 'NONE'; // Reset step
          // Fall through to Guided Flow logic below
        } else {
          console.log("⛔ Access Denied: GUIDED_FLOW not allowed.");
          response.text = "I'm sorry, but Idea Submission is not enabled for this connection.";
          return sendReply(res, response.text);
        }

      } else {
        // STAY IN FREE CHAT
        let history = session.messages || [];
        if (typeof history === 'string') try { history = JSON.parse(history); } catch (e) { history = []; }

        // --- PERMISSION CHECK: AI ENABLED ---
        const connectionObj = await Connection.findOne({ where: { connectionId } });
        const perms = connectionObj ? connectionObj.permissions : null;

        let permsObj = perms;
        if (typeof perms === 'string') {
          try { permsObj = JSON.parse(perms); } catch (e) { permsObj = {}; }
        }

        let aiEnabled = true; // Default
        if (permsObj && typeof permsObj.aiEnabled !== 'undefined') {
          aiEnabled = permsObj.aiEnabled;
        }

        console.log(`[DEBUG] Connection: ${connectionId} | AI Enabled: ${aiEnabled}`);

        let aiReply = "I'm listening.";
        if (aiEnabled === true || aiEnabled === "true") {

          // --- STEP 1: WEBSITE BEHAVIOR ENGINE (PROMPT ASSEMBLY) ---
          // Phase 2 Update: Pass empty context to promptService, let aiService handle RAG
          const assembledPrompt = await promptService.assemblePrompt(connectionId, url, "");

          const aiOutput = await aiService.freeChat({
            message,
            history,
            connectionId, // Pass connectionId for Shadow/Active retrieval
            systemPrompt: assembledPrompt
          });

          // Handle Object return (Phase 2.3)
          if (typeof aiOutput === 'object' && aiOutput.reply) {
            aiReply = aiOutput.reply;
            response.ai_metadata = { sources: aiOutput.sources };
            console.log("[DEBUG] Controller set metadata:", JSON.stringify(response.ai_metadata));
          } else {
            aiReply = aiOutput;
          }
        } else {
          console.log("⛔ AI Chat Blocked.");
          aiReply = "AI Chat is disabled. Please type 'submit idea' to start a form (if allowed).";
        }

        response.text = aiReply;

        // Enrich ai_metadata for behavior metrics
        const salesPatterns = ['buy now', 'sign up', 'get started', 'free trial', 'book a demo', 'schedule a call', 'contact sales', 'pricing', 'upgrade', 'subscribe'];
        const replyLower = (response.text || '').toLowerCase();
        const wordCount = (response.text || '').split(/\s+/).filter(w => w).length;
        const salesTriggerDetected = salesPatterns.some(p => replyLower.includes(p));

        // Compute aggregate confidence from sources
        let aggConfidence = null;
        if (response.ai_metadata && response.ai_metadata.sources) {
          const scores = response.ai_metadata.sources
            .filter(s => s.confidenceScore !== undefined)
            .map(s => s.confidenceScore);
          if (scores.length > 0) {
            aggConfidence = scores.reduce((a, b) => a + b, 0) / scores.length;
          }
        }

        response.ai_metadata = {
          ...(response.ai_metadata || {}),
          responseLength: wordCount,
          salesTriggerDetected,
          confidenceScore: aggConfidence
        };

        // ─── CONFIDENCE GATING ─────────────────────────────────
        const ConfidencePolicy = require('../models/ConfidencePolicy');
        let gated = false;
        let gateReason = null;
        try {
          const policy = await ConfidencePolicy.findOne({ where: { connectionId } });
          if (policy) {
            const sourceCount = (response.ai_metadata && response.ai_metadata.sources)
              ? response.ai_metadata.sources.length : 0;
            const conf = aggConfidence !== null ? aggConfidence : 1;

            const belowConfidence = conf < policy.minAnswerConfidence;
            const belowSources = sourceCount < policy.minSourceCount;

            if (belowConfidence || belowSources) {
              gated = true;
              gateReason = belowConfidence
                ? `Confidence ${(conf * 100).toFixed(0)}% below ${(policy.minAnswerConfidence * 100).toFixed(0)}% threshold`
                : `Only ${sourceCount} source(s), need ${policy.minSourceCount}`;

              const originalAnswer = response.text;
              response.ai_metadata.gated = true;
              response.ai_metadata.gateReason = gateReason;
              response.ai_metadata.originalAnswer = originalAnswer;

              switch (policy.lowConfidenceAction) {
                case 'REFUSE':
                  response.text = "I'm not fully confident in that answer yet. Let me double-check or connect you with support.";
                  break;
                case 'CLARIFY':
                  response.text = "I need a bit more detail to answer accurately. Could you rephrase or provide more context?";
                  break;
                case 'ESCALATE':
                  response.text = "I'm not confident enough to answer that reliably. Would you like me to connect you to a human agent?";
                  break;
                case 'SOFT_ANSWER':
                default:
                  response.text = "⚠️ This may not be fully accurate, but based on available information: " + originalAnswer;
                  break;
              }
              console.log(`[GATE] Response gated for ${connectionId}: ${gateReason} → ${policy.lowConfidenceAction}`);
            }
          }
        } catch (gateErr) {
          console.error('[GATE] Policy check error:', gateErr.message);
        }
        // ─── END CONFIDENCE GATING ─────────────────────────────

        // Save history
        history.push({ role: "user", text: message });
        history.push({
          role: "assistant",
          text: response.text,
          ai_metadata: response.ai_metadata || null
        });
        session.messages = history;
        session.changed('messages', true);
        await session.save();

        return sendReply(res, response.text);
      }
    }

    // Check Trigger to EXIT Guided Flow
    if (session.mode === 'GUIDED_FLOW') {
      const lower = message.toLowerCase();
      if (lower === "cancel" || lower === "exit" || lower === "stop") {
        console.log("🔀 Switching to FREE_CHAT (User Cancel)");
        session.mode = 'FREE_CHAT';
        session.currentStep = 'NONE';
        session.tempData = {};

        response.text = "Cancelled. You are back in free chat.";

        // Save transition
        session.currentStep = 'NONE';
        session.changed('tempData', true);
        await session.save();

        // Note: Cancel doesn't push to messages array in this block? 
        // Wait, lines 164-166 only update step/data.
        // It DOES NOT push the "Cancelled" message to history?
        // Logic seems to miss saving the "Cancelled" reply to history in this specific block?
        // Actually, let's fix that too or just pass -1 if not saved.
        // If not saved, we can't rate it.
        return sendReply(res, response.text, response.suggestions || [], response.ai_metadata, -1);
      }
    }

    // --- STATE MACHINE (GUIDED_FLOW) --- //

    switch (session.currentStep) {
      case 'NONE':
        response.text = "Hi! Let's submit a new idea. What is the short TITLE of your idea?";
        nextStep = 'TITLE';
        break;

      case 'TITLE':
        if (message.length < 3 || /^\d+$/.test(message)) {
          response.text = "That title seems too short or invalid. Please provide a clear, short title (e.g. 'New Dashboard Widget').";
        } else {
          tempData.title = message;
          const ai = await aiService.suggestTitles(message);
          response.ai_metadata = ai;
          response.text = `Got it: "${message}".\n\nNow, please describe the idea in detail (at least 10 characters).`;
          nextStep = 'DESCRIPTION';
        }
        break;

      case 'DESCRIPTION':
        if (message.length < 10) {
          response.text = "Please provide a bit more detail (at least 10 characters) so we can understand the idea.";
        } else {
          const aiEnhance = await aiService.enhanceDescription(message);
          const aiImpact = await aiService.predictImpact(message);
          tempData.description = message;
          response.ai_metadata = { ...aiEnhance, ...aiImpact };
          response.text = "Great description. Finally, roughly how many users will this impact? (e.g. '50', 'All users', 'Admin team')";
          response.suggestions = ["10-50", "100+", "All Users"];
          if (aiImpact.confidence !== 'low' && aiImpact.predicted_impact > 0) {
            response.suggestions.unshift(`${aiImpact.predicted_impact} (AI Est)`);
          }
          nextStep = 'IMPACT';
        }
        break;

      case 'IMPACT':
        const match = message.match(/(\d+)/);
        const num = match ? parseInt(match[0], 10) : 0;
        if (num === 0 && !/\d/.test(message) && !message.toLowerCase().includes('all')) {
          response.text = "I couldn't understand the number of users. Please type a number or estimate (e.g. '50').";
          response.suggestions = ["50", "100", "500"];
        } else {
          tempData.impactedUsers = num > 0 ? num : 0;
          response.text = `Summary:\n- Title: ${tempData.title}\n- Desc: ${tempData.description}\n- Impact: ~${tempData.impactedUsers} users\n\nReady to submit?`;
          response.suggestions = ["Yes, Submit", "No, Restart"];
          nextStep = 'CONFIRM';
        }
        break;

      case 'CONFIRM':
        const confLower = message.toLowerCase();
        if (confLower.includes("yes") || confLower.includes("submit") || confLower.includes("confirm")) {
          const connectionObj = await Connection.findOne({ where: { connectionId } });
          const actionConfig = (connectionObj && connectionObj.actionConfig)
            ? connectionObj.actionConfig
            : { type: "SAVE", config: { target: "ideas_table" } };

          const payload = {
            title: tempData.title,
            description: tempData.description,
            impact: tempData.impactedUsers,
            connectionId: connectionId,
            sessionId: sessionId
          };

          const result = await actionService.executeAction(actionConfig, payload, connectionObj ? connectionObj.permissions : null);
          const refText = result.data && result.data.ideaId ? ` Reference ID: ${result.data.ideaId}.` : "";
          response.text = `✅ ${result.message}${refText}\n\nReturning to free chat.`;
          nextStep = 'SUBMITTED';
          session.mode = 'FREE_CHAT';
        } else if (confLower.includes("no") || confLower.includes("restart")) {
          tempData = {};
          response.text = "Cancelled. Let's start over. What is the title?";
          nextStep = 'TITLE';
        } else {
          response.text = "Please type 'Yes' to submit or 'No' to cancel.";
          response.suggestions = ["Yes, Submit", "No, Cancel"];
        }
        break;

      case 'SUBMITTED':
        session.mode = 'FREE_CHAT';
        tempData = {};
        response.text = "You are back in free chat. Type 'submit idea' to start again.";
        nextStep = 'NONE';
        break;

      default:
        nextStep = 'NONE';
        response.text = "System reset. Type 'submit idea' to start.";
        break;
    }

    // 3. Save State
    session.currentStep = nextStep;
    session.tempData = { ...tempData };
    session.changed('tempData', true);

    let msgs = session.messages || [];
    if (typeof msgs === 'string') try { msgs = JSON.parse(msgs); } catch (e) { msgs = []; }

    msgs.push({ role: "user", text: message });
    msgs.push({ role: "assistant", text: response.text });
    session.messages = msgs;
    session.changed('messages', true);

    await session.save();

    // 4. Send Reply
    return sendReply(res, response.text, response.suggestions || [], response.ai_metadata);

  } catch (error) {
    console.error("❌ Chat Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.submitFeedback = async (req, res) => {
  try {
    const { sessionId, messageIndex, rating, notes } = req.body; // rating: "CORRECT" | "INCORRECT"

    if (!sessionId || messageIndex === undefined) {
      return res.status(400).json({ error: "Missing sessionId or messageIndex" });
    }

    const session = await ChatSession.findOne({ where: { sessionId } });
    if (!session) return res.status(404).json({ error: "Session not found" });

    // Validate Messages
    let messages = session.messages || [];
    if (typeof messages === 'string') try { messages = JSON.parse(messages); } catch (e) { messages = []; }

    const idx = parseInt(messageIndex);
    if (isNaN(idx) || idx < 0 || idx >= messages.length) {
      return res.status(400).json({ error: "Invalid message index" });
    }

    const targetMsg = messages[idx];
    if (targetMsg.role !== 'assistant') {
      return res.status(400).json({ error: "Can only rate assistant messages" });
    }

    // 1. Update Message with Feedback
    targetMsg.feedback = {
      rating,
      notes,
      createdAt: new Date()
    };

    messages[idx] = targetMsg;
    session.messages = messages;
    session.changed('messages', true);
    await session.save();

    // 2. Adjust Intelligence (Confidence Score)
    // Only if rating provided
    if (rating && targetMsg.ai_metadata && targetMsg.ai_metadata.sources) {
      for (const source of targetMsg.ai_metadata.sources) {
        if (source.sourceId) {
          const knowledge = await ConnectionKnowledge.findByPk(source.sourceId);
          if (knowledge) {
            let score = knowledge.confidenceScore || 0.5;

            if (rating === 'CORRECT') {
              score = Math.min(score + 0.1, 1.0); // Boost
            } else if (rating === 'INCORRECT') {
              score = Math.max(score - 0.2, 0.0); // Penalize harder
            }

            knowledge.confidenceScore = score;
            await knowledge.save();
          }
        }
      }
    }

    res.json({ success: true, message: "Feedback received" });

  } catch (error) {
    console.error("Feedback Error:", error);
    res.status(500).json({ error: error.message });
  }
};
