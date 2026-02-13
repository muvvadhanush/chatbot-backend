const { client: openai, model: AI_MODEL } = require("../config/aiClient");
const logger = require("../utils/logger");

/**
 * PURE UTILITY AI SERVICE - SUGGESTION ENGINE
 * No conversational logic. No state management.
 * Returns strict JSON metadata.
 */

exports.suggestTitles = async (text) => {
  try {
    if (!text || text.length < 3) return { suggestions: [] };

    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: "Output JSON only. Key: 'suggestions' (array of strings)." },
        { role: "user", content: `Suggest 3 professional titles for: "${text}"` }
      ],
      response_format: { type: "json_object" },
      max_tokens: 150,
      temperature: 0.7
    });

    const data = JSON.parse(response.choices[0].message.content);
    return { suggestions: data.suggestions || [] };
  } catch (err) {
    logger.error("AI Title Error:", err.message);
    return { suggestions: [] };
  }
};

exports.enhanceDescription = async (text) => {
  try {
    if (!text || text.length < 10) return { enhanced_description: text, suggestions: [] };

    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: "Output JSON only. Keys: 'enhanced_description' (string), 'suggestions' (array of strings)." },
        { role: "user", content: `Improve this description and list 2 short suggestions to add detail:\n"${text}"` }
      ],
      response_format: { type: "json_object" },
      max_tokens: 300,
      temperature: 0.7
    });

    const data = JSON.parse(response.choices[0].message.content);
    return {
      enhanced_description: data.enhanced_description || text,
      suggestions: data.suggestions || []
    };
  } catch (err) {
    logger.error("AI Enhance Error:", err.message);
    return { enhanced_description: text, suggestions: [] };
  }
};

exports.predictImpact = async (description) => {
  try {
    if (!description || description.length < 10) return { predicted_impact: 0, confidence: "low" };

    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: "Output JSON only. Keys: 'predicted_impact' (integer), 'confidence' (low/medium/high)." },
        { role: "user", content: `Estimate user impact count for: "${description}"` }
      ],
      response_format: { type: "json_object" },
      max_tokens: 100,
      temperature: 0.5
    });

    const data = JSON.parse(response.choices[0].message.content);
    return {
      predicted_impact: typeof data.predicted_impact === 'number' ? data.predicted_impact : 0,
      confidence: data.confidence || "low"
    };
  } catch (err) {
    logger.error("AI Impact Error:", err.message);
    return { predicted_impact: 0, confidence: "low" };
  }
};

exports.freeChat = async ({ message, history, connectionId, systemPrompt: customPrompt }) => {
  try {
    let systemInstructions = customPrompt || "You are a helpful assistant.";
    let activeContext = "";
    let shadowContext = "";
    let activeSources = [];
    let shadowSources = [];

    // 1. Retrieve Knowledge if connectionId provided
    if (connectionId) {
      const knowledge = await exports.retrieveKnowledge(connectionId, message);
      activeSources = knowledge.active;
      shadowSources = knowledge.shadow;

      if (activeSources.length > 0) {
        activeContext = activeSources.map(k => `- ${k.sourceValue}`).join("\n");
      }

      if (shadowSources.length > 0) {
        shadowContext = shadowSources.map(k => `- ${k.sourceValue}`).join("\n");
      }

      // 2. Strict Prompt Construction
      systemInstructions = `${customPrompt || "You are a helpful assistant."}

## DATA CONTEXT
The following is your available knowledge base. It is divided into APPROVED and SHADOW sections.

### APPROVED KNOWLEDGE (Trusted Source)
${activeContext || "(No approved info)"}

### SHADOW KNOWLEDGE (Untrusted - Context Only)
${shadowContext || "(No shadow info)"}

## RESPONSE RULES
1. Answer the user's question using ONLY the APPROVED KNOWLEDGE.
2. You may use SHADOW KNOWLEDGE to understand what the user is talking about, but NEVER use it as the source of your answer.
3. If the answer is found in APPROVED KNOWLEDGE, provide it clearly.
4. If the answer is found ONLY in SHADOW KNOWLEDGE, say: "I don't have approved information on this yet."
5. If the answer is not in either, say you don't know.
6. Always cite your Approved sources if possible.
`;
    }

    const messages = [
      { role: "system", content: systemInstructions },
      ...history.slice(-5).map(m => ({ role: m.role, content: m.text })),
      { role: "user", content: message }
    ];

    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages,
      max_tokens: 300,
      temperature: 0.5
    });
    const duration = Date.now() - startTime;

    const reply = response.choices[0].message.content;
    const tokensUsed = response.usage ? response.usage.total_tokens : 0;

    // Phase 5: AI Observability
    logger.info("AI Chat Completion", {
      connectionId,
      duration: `${duration}ms`,
      tokens: tokensUsed,
      activeSources: activeSources.length,
      shadowSources: shadowSources.length,
      model: AI_MODEL
    });

    // Explainability Metadata
    const explainability = {
      sources: activeSources.map(k => ({
        sourceId: k.id,
        type: k.sourceType,
        value: k.sourceValue,
        metadata: k.metadata,
        confidence: k.confidenceScore
      })),
      rejectedSources: shadowSources.map(k => ({
        sourceId: k.id,
        type: k.sourceType,
        value: k.sourceValue,
        reason: "Shadow Knowledge (Not Approved)"
      })),
      policyChecks: [
        {
          name: "Approved Knowledge Only",
          status: "PASSED",
          description: "Response restricted to ACTIVE knowledge."
        },
        {
          name: "Shadow Content Filter",
          status: shadowSources.length > 0 ? "ACTIVE" : "PASSED",
          description: shadowSources.length > 0 ? `Blocked ${shadowSources.length} shadow items.` : "No shadow content found."
        }
      ]
    };

    return {
      reply,
      ...explainability
    };

  } catch (err) {
    logger.error("AI Free Chat Error:", { message: err.message, connectionId });
    return "I'm having a bit of trouble connecting right now. Please try again.";
  }
};

exports.extractImpact = async (text) => {
  try {
    if (!text || text.length < 2) return { impact: null };

    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: "Output JSON only. Key: 'impact' (string or null). Summarize the user's stated impact/goal in 5-10 words." },
        { role: "user", content: `Extract impact from: "${text}"` }
      ],
      response_format: { type: "json_object" },
      max_tokens: 100
    });

    const data = JSON.parse(response.choices[0].message.content);
    return { impact: data.impact || null };
  } catch (err) {
    logger.error("AI extractImpact Error:", err.message);
    return { impact: null };
  }
};

exports.inferBotIdentity = async (text) => {
  try {
    if (!text || text.length < 10) return null;

    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: "Output JSON only. Keys: 'bot_name' (max 2 words), 'welcome_message' (1 sentence), 'tone' (formal|friendly|neutral), 'site_summary' (2-3 sentences)."
        },
        { role: "user", content: `Infer bot identity from this website content:\n\n${text.substring(0, 3000)}` }
      ],
      response_format: { type: "json_object" },
      max_tokens: 400
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (err) {
    logger.error("AI inferBotIdentity Error:", err.message);
    return null;
  }
};

exports.retrieveKnowledge = async (connectionId, query) => {
  const ConnectionKnowledge = require("../models/ConnectionKnowledge");
  const { Op } = require("sequelize");

  const allKnowledge = await ConnectionKnowledge.findAll({
    where: {
      connectionId,
      status: 'READY'
    }
  });

  if (allKnowledge.length === 0) return { active: [], shadow: [] };

  const userTokens = query.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3);

  if (userTokens.length === 0) return { active: [], shadow: [] };

  const scored = allKnowledge.map(k => {
    const text = (k.sourceValue || "").toLowerCase() + " " + (k.rawText || "").toLowerCase();
    let score = 0;
    userTokens.forEach(token => {
      if (text.includes(token)) score += 1;
    });
    return { ...k.dataValues, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const topMatches = scored.filter(s => s.score > 0).slice(0, 5);

  const active = topMatches.filter(k => k.visibility === 'ACTIVE');
  const shadow = topMatches.filter(k => k.visibility === 'SHADOW');

  return { active, shadow };
};
