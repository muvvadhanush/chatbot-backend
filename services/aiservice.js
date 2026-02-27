const { client, embeddingClient, model, provider } = require('../config/aiClient');
const aiAdapter = require('./ai/aiAdapter');
const logger = require('../utils/logger');
const ConnectionKnowledge = require('../models/ConnectionKnowledge');
const { Op } = require('sequelize');
const sequelize = require('../config/db');
const crypto = require('crypto');
const cache = require('../utils/cache');
const tokenLogger = require('../utils/tokenLogger');

/**
 * AI Service with Observability & Caching
 * Handles LLM interactions, embedding generation, and identity inference.
 */

// 1. GENERATE EMBEDDING (Cached)
exports.generateEmbedding = async (text) => {
    // Unique key based on text hash
    const hash = crypto.createHash('md5').update(text).digest('hex');
    const cacheKey = `embed:${hash}`;

    // Cache for 7 days (Embeddings are static)
    return await cache.getOrSet(cacheKey, 604800, async () => {
        const start = Date.now();
        try {
            const response = await embeddingClient.embeddings.create({
                model: "text-embedding-3-small",
                input: text,
                encoding_format: "float"
            });
            const duration = Date.now() - start;
            logger.aiMetric('SYSTEM', 'embedding_generation', duration);
            tokenLogger.recordUsage({
                connectionId: 'SYSTEM',
                provider: provider,
                model: 'text-embedding-3-small',
                usage: response.usage,
                context: 'embedding_generation'
            });

            return response.data[0].embedding;
        } catch (error) {
            logger.error('Embedding Error', { error: error.message });
            throw error;
        }
    });
};

// 2. INFER BOT IDENTITY (Auto-Extract)
exports.inferBotIdentity = async (rawText) => {
    const start = Date.now();
    try {
        const prompt = `
        Analyze the following website content and extract the brand identity.
        Return a JSON object with:
        - bot_name: A catchy name for the AI assistant
        - welcome_message: A friendly greeting (max 20 words)
        - tone: The brand voice (e.g., Professional, Playful, Technical)
        - site_summary: One sentence description of what the site does.

        CONTENT:
        ${rawText.substring(0, 3000)}
        `;

        const { content, usage } = await aiAdapter.generate({
            messages: [{ role: "system", content: "You are a branding expert. Output valid JSON only." }, { role: "user", content: prompt }],
            temperature: 0.5,
            response_format: { type: "json_object" }
        });

        const duration = Date.now() - start;
        logger.aiMetric('SYSTEM', 'infer_identity', duration);

        tokenLogger.recordUsage({
            connectionId: 'SYSTEM',
            provider: provider,
            model: model,
            usage: usage,
            context: 'infer_identity'
        });

        return JSON.parse(content);
    } catch (error) {
        logger.error('Identity Inference Error', { error: error.message });
        return { bot_name: "AI Assistant", welcome_message: "Hello!", tone: "Neutral", site_summary: "" };
    }
};

// 2b. DETECT BRAND PROFILE (Step 3 — Expanded Identity)
exports.detectBrandProfile = async (contentText) => {
    const start = Date.now();
    try {
        const prompt = `
Analyze the following website content and determine the brand profile.
Return a JSON object with EXACTLY these fields:

{
  "industry": "<detected industry, e.g. E-Commerce, SaaS, Healthcare, Education, Finance, Real Estate, Marketing Agency, Restaurant, Legal, Non-Profit, Technology, Other>",
  "tone": "<one of: Professional, Friendly, Casual, Technical, Sales-Oriented>",
  "primaryGoal": "<one of: Support, Lead Generation, Education, Sales, Engagement>",
  "salesIntensity": "<one of: Low, Medium, High>",
  "assistantRole": "<short role title, e.g. Product Advisor, Support Agent, Sales Rep, Knowledge Guide>",
  "suggestedName": "<a catchy assistant name based on the brand>",
  "suggestedWelcome": "<a friendly welcome message, max 25 words>",
  "reasoning": "<1-2 sentence explanation of why you chose these values>"
}

RULES:
- Base ALL decisions on the actual content. Do not hallucinate.
- If the site is sales-heavy (pricing, CTAs, discounts), set salesIntensity to High.
- If the site is informational with no sales, set salesIntensity to Low.
- The tone should match how the brand speaks, not what they sell.

WEBSITE CONTENT:
${contentText.substring(0, 6000)}
`;
        const { content, usage } = await aiAdapter.generate({
            messages: [
                { role: "system", content: "You are a brand analysis expert. Output valid JSON only. No markdown fences." },
                { role: "user", content: prompt }
            ],
            temperature: 0.4,
            response_format: { type: "json_object" }
        });

        const duration = Date.now() - start;
        logger.aiMetric('SYSTEM', 'detect_brand_profile', duration);

        tokenLogger.recordUsage({
            connectionId: 'SYSTEM',
            provider: provider,
            model: model,
            usage: usage,
            context: 'detect_brand_profile'
        });

        const result = JSON.parse(content);

        // Validate required fields with fallbacks
        return {
            industry: result.industry || 'Other',
            tone: result.tone || 'Professional',
            primaryGoal: result.primaryGoal || 'Support',
            salesIntensity: result.salesIntensity || 'Medium',
            assistantRole: result.assistantRole || 'AI Assistant',
            suggestedName: result.suggestedName || 'AI Assistant',
            suggestedWelcome: result.suggestedWelcome || 'Hi! How can I help you today?',
            reasoning: result.reasoning || ''
        };
    } catch (error) {
        logger.error('Brand Profile Detection Error', { error: error.message });
        return {
            industry: 'Other',
            tone: 'Professional',
            primaryGoal: 'Support',
            salesIntensity: 'Medium',
            assistantRole: 'AI Assistant',
            suggestedName: 'AI Assistant',
            suggestedWelcome: 'Hi! How can I help you today?',
            reasoning: 'Auto-detection failed. Using defaults.'
        };
    }
};
// 3. FIND SIMILAR KNOWLEDGE (Hybrid Search: Vector + Keyword) - Cached
exports.findSimilarKnowledge = async (connectionId, query) => {
    const queryHash = crypto.createHash('md5').update(query).digest('hex');
    const cacheKey = `rag:${connectionId}:${queryHash}`;

    return await cache.getOrSet(cacheKey, 3600, async () => {
        const start = Date.now();
        try {
            // A. Generate Embedding
            const queryEmbedding = await exports.generateEmbedding(query);
            const vectorLiteral = `ARRAY[${queryEmbedding.join(',')}]::vector`;

            // B. Vector Search
            const vectorResults = await ConnectionKnowledge.findAll({
                where: {
                    connectionId,
                    status: 'READY',
                    embedding: { [Op.ne]: null }
                },
                attributes: {
                    include: [
                        [sequelize.literal(`embedding <=> '${vectorLiteral}'`), 'distance']
                    ]
                },
                order: sequelize.literal(`embedding <=> ${vectorLiteral}`)
            });

            // C. Hybrid Boost
            const results = vectorResults.map(r => {
                const distance = r.getDataValue('distance');
                let similarity = 1 - distance;
                return {
                    text: r.rawText,
                    source: r.sourceValue,
                    score: similarity,
                    metadata: r.metadata
                };
            });

            const duration = Date.now() - start;
            logger.retrieval(connectionId, query, results.length, results.length > 0 ? results[0].score : 0.0);

            // Return top results > 0.6 similarity
            const filtered = results.filter(r => r.score > 0.6);

            if (filtered.length === 0) {
                logger.info('Falling back to Keyword Search', { connectionId });
                return await exports.findSimilarKnowledgeKeyword(connectionId, query);
            }
            return filtered;

        } catch (error) {
            logger.error('RAG Vector Search Error', { connectionId, error: error.message });
            return await exports.findSimilarKnowledgeKeyword(connectionId, query);
        }
    });
};

// Fallback Keyword Search
exports.findSimilarKnowledgeKeyword = async (connectionId, query) => {
    const keywords = query.split(' ').filter(w => w.length > 3).map(w => `%${w}%`);
    if (keywords.length === 0) return [];

    const results = await ConnectionKnowledge.findAll({
        where: {
            connectionId,
            status: 'READY',
            [Op.or]: keywords.map(k => ({ cleanedText: { [Op.like]: k } }))
        },
        limit: 3
    });

    return results.map(r => ({
        text: r.rawText,
        source: r.sourceValue,
        score: 0.5
    }));
};

// 4. FREE CHAT (Main Completion)
exports.freeChat = async ({ message, history, connectionId, systemPrompt, memory }) => {
    const start = Date.now();

    try {
        const MAX_HISTORY_MESSAGES = 15;
        const MAX_CONTEXT_CHARS = 4000;
        const SIMILARITY_THRESHOLD = 0.6;

        // Trim history
        const safeHistory = (history || []).slice(-MAX_HISTORY_MESSAGES);

        // Retrieve RAG context
        const knowledgeItems = await exports.findSimilarKnowledge(connectionId, message);

        let finalSystemPrompt = systemPrompt;
        let sources = [];

        // Add Memory Summary if exists
        if (memory && memory.summary) {
            finalSystemPrompt += `\n\n## CONVERSATION SUMMARY (Long-term Memory):\n${memory.summary}`;
        }

        if (knowledgeItems.length > 0) {
            const filtered = knowledgeItems
                .filter(k => k.score > SIMILARITY_THRESHOLD)
                .slice(0, 3);

            const contextText = filtered
                .map(k => k.text.substring(0, 1500))
                .join('\n---\n')
                .substring(0, MAX_CONTEXT_CHARS);

            sources = filtered.map(k => ({
                sourceId: k.source,
                confidenceScore: k.score
            }));

            finalSystemPrompt += `\n\n## TRUSTED CONTEXT DATA:\n${contextText}`;
        }

        const messages = [
            { role: "system", content: finalSystemPrompt },
            ...safeHistory.map(m => ({
                role: m.role,
                content: m.text || m.content
            })),
            { role: "user", content: message }
        ];

        const { content, usage } = await aiAdapter.generate({
            messages: messages,
            temperature: 0.7,
            max_tokens: 500
        });

        // const totalTokens = completion.usage.total_tokens; // Not available in generic adapter yet
        const duration = Date.now() - start;

        logger.aiMetric(connectionId, 'chat_completion', duration, { provider: provider });

        tokenLogger.recordUsage({
            connectionId: connectionId,
            provider: provider,
            model: model,
            usage: usage,
            context: 'chat_completion'
        });

        return {
            reply: content,
            sources
        };

    } catch (error) {
        logger.error('AI Chat Error', { connectionId, error: error.message });
        return { reply: "I'm having trouble thinking clearly. One moment.", sources: [] };
    }
};

// 5. CLASSIFY DOCUMENT (Behavior Tuning)
exports.classifyDocument = async (text) => {
    const start = Date.now();
    try {
        const snippet = text.substring(0, 4000);
        const prompt = `Analyze the following document content and classify it into ONE of these categories:
- SALES_GUIDE: Sales playbooks, pitch scripts, closing techniques, pricing strategies
- SUPPORT_SCRIPT: Customer support scripts, FAQ templates, troubleshooting guides
- BRAND_GUIDELINES: Brand voice guides, style manuals, messaging frameworks
- COMPLIANCE_POLICY: Legal policies, compliance manuals, regulatory documents, terms of service
- UNKNOWN: Cannot determine

Return a JSON object with EXACTLY these fields:
{
  "classification": "<one of the categories above>",
  "confidence": <0.0 to 1.0>,
  "reasoning": "<1-2 sentence explanation>"
}

DOCUMENT CONTENT:
${snippet}`;

        const { content, usage } = await aiAdapter.generate({
            messages: [
                { role: "system", content: "You are a document classification expert. Output valid JSON only. No markdown fences." },
                { role: "user", content: prompt }
            ],
            temperature: 0.3,
            response_format: { type: "json_object" }
        });

        const duration = Date.now() - start;
        logger.aiMetric('SYSTEM', 'classify_document', duration);

        tokenLogger.recordUsage({
            connectionId: 'SYSTEM',
            provider: provider,
            model: model,
            usage: usage,
            context: 'classify_document'
        });

        const result = JSON.parse(content);
        const validTypes = ['SALES_GUIDE', 'SUPPORT_SCRIPT', 'BRAND_GUIDELINES', 'COMPLIANCE_POLICY', 'UNKNOWN'];

        return {
            classification: validTypes.includes(result.classification) ? result.classification : 'UNKNOWN',
            confidence: Math.min(1.0, Math.max(0.0, parseFloat(result.confidence) || 0.5)),
            reasoning: result.reasoning || 'No reasoning provided'
        };
    } catch (error) {
        logger.error('Document Classification Error', { error: error.message });
        return { classification: 'UNKNOWN', confidence: 0.0, reasoning: 'Classification failed: ' + error.message };
    }
};

// 6. EXTRACT BEHAVIOR SIGNALS (Behavior Tuning)
exports.extractBehaviorSignals = async (text, classification) => {
    const start = Date.now();
    try {
        const snippet = text.substring(0, 5000);
        const prompt = `Analyze the following ${classification} document and extract behavioral signals for an AI chatbot.

STEP 1: Score these signals from 0.0 to 1.0:
- persuasion: How much persuasive/sales language is present
- compliance: How much legal/regulatory/formal language is present
- empathy: How much empathetic/caring/supportive language is present
- authority: How much authoritative/expert/commanding language is present
- verbosity: How long and detailed the typical communication style is

STEP 2: Based on the signals, suggest behavior configuration:
- suggestedTone: One of [Professional, Friendly, Casual, Technical, Sales-Oriented]
- suggestedSalesIntensity: One of [Low, Medium, High]
- suggestedResponseLength: One of [Short, Medium, Long]
- suggestedEmpathyLevel: One of [Low, Medium, High]
- suggestedComplianceStrictness: One of [Relaxed, Standard, Strict]

Return a JSON object:
{
  "signals": {
    "persuasion": <0.0-1.0>,
    "compliance": <0.0-1.0>,
    "empathy": <0.0-1.0>,
    "authority": <0.0-1.0>,
    "verbosity": <0.0-1.0>
  },
  "suggestion": {
    "suggestedTone": "<value>",
    "suggestedSalesIntensity": "<value>",
    "suggestedResponseLength": "<value>",
    "suggestedEmpathyLevel": "<value>",
    "suggestedComplianceStrictness": "<value>"
  },
  "reasoning": "<2-3 sentence explanation of the mapping>",
  "confidence": <0.0-1.0>
}

RULES:
- Base ALL decisions on actual document content. Do not hallucinate.
- If persuasion > 0.6, tone should lean Sales-Oriented.
- If compliance > 0.7, complianceStrictness should be Strict.
- If empathy > 0.6, empathyLevel should be High.
- If verbosity > 0.7, responseLength should be Long.

DOCUMENT CONTENT:
${snippet}`;

        const { content, usage } = await aiAdapter.generate({
            messages: [
                { role: "system", content: "You are a behavioral analysis expert for AI chatbots. Output valid JSON only. No markdown fences." },
                { role: "user", content: prompt }
            ],
            temperature: 0.3,
            response_format: { type: "json_object" }
        });

        const duration = Date.now() - start;
        logger.aiMetric('SYSTEM', 'extract_behavior_signals', duration);

        tokenLogger.recordUsage({
            connectionId: 'SYSTEM',
            provider: provider,
            model: model,
            usage: usage,
            context: 'extract_behavior_signals'
        });

        const result = JSON.parse(content);

        // Validate and clamp signal scores
        const signals = {};
        for (const key of ['persuasion', 'compliance', 'empathy', 'authority', 'verbosity']) {
            signals[key] = Math.min(1.0, Math.max(0.0, parseFloat(result.signals?.[key]) || 0.0));
        }

        // Validate suggestion values
        const validTones = ['Professional', 'Friendly', 'Casual', 'Technical', 'Sales-Oriented'];
        const validLevels = ['Low', 'Medium', 'High'];
        const validLengths = ['Short', 'Medium', 'Long'];
        const validStrictness = ['Relaxed', 'Standard', 'Strict'];

        const suggestion = {
            suggestedTone: validTones.includes(result.suggestion?.suggestedTone) ? result.suggestion.suggestedTone : 'Professional',
            suggestedSalesIntensity: validLevels.includes(result.suggestion?.suggestedSalesIntensity) ? result.suggestion.suggestedSalesIntensity : 'Medium',
            suggestedResponseLength: validLengths.includes(result.suggestion?.suggestedResponseLength) ? result.suggestion.suggestedResponseLength : 'Medium',
            suggestedEmpathyLevel: validLevels.includes(result.suggestion?.suggestedEmpathyLevel) ? result.suggestion.suggestedEmpathyLevel : 'Medium',
            suggestedComplianceStrictness: validStrictness.includes(result.suggestion?.suggestedComplianceStrictness) ? result.suggestion.suggestedComplianceStrictness : 'Standard'
        };

        return {
            signals,
            suggestion,
            reasoning: result.reasoning || 'No reasoning provided',
            confidence: Math.min(1.0, Math.max(0.0, parseFloat(result.confidence) || 0.5))
        };
    } catch (error) {
        logger.error('Behavior Signal Extraction Error', { error: error.message });
        return {
            signals: { persuasion: 0, compliance: 0, empathy: 0, authority: 0, verbosity: 0 },
            suggestion: {
                suggestedTone: 'Professional',
                suggestedSalesIntensity: 'Medium',
                suggestedResponseLength: 'Medium',
                suggestedEmpathyLevel: 'Medium',
                suggestedComplianceStrictness: 'Standard'
            },
            reasoning: 'Signal extraction failed: ' + error.message,
            confidence: 0.0
        };
    }
};

// 7. SUMMARIZE HISTORY (Memory Helper)
exports.summarizeHistory = async (history) => {
    try {
        const textToSummarize = history.slice(0, -5).map(m => `${m.role}: ${m.text}`).join('\n');
        const prompt = `Summarize the following conversation history into a concise paragraph (max 100 words) to help the AI maintain long-term memory. focus on key facts and user preferences.\n\n${textToSummarize}`;

        const { content, usage } = await aiAdapter.generate({
            messages: [
                { role: "system", content: "You are a memory module. Summarize conversations concisely." },
                { role: "user", content: prompt }
            ],
            temperature: 0.3
        });

        tokenLogger.recordUsage({
            connectionId: 'SYSTEM',
            provider: provider,
            model: model,
            usage: usage,
            context: 'summarize_history'
        });

        return content;
    } catch (e) {
        console.error("Summarization failed", e);
        return null;
    }
};
