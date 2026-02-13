/**
 * AI Client Factory — Dual-Provider Support (OpenAI / Groq)
 * 
 * Groq's API is OpenAI-compatible, so we use the OpenAI SDK
 * with a custom baseURL. All existing .chat.completions.create()
 * calls work without modification.
 * 
 * Config via ENV:
 *   AI_PROVIDER=groq|openai (default: openai)
 *   GROQ_API_KEY=...
 *   OPENAI_API_KEY=...
 */
const OpenAI = require('openai');

const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';

function getAIConfig() {
    if (AI_PROVIDER === 'groq') {
        return {
            baseURL: 'https://api.groq.com/openai/v1',
            apiKey: process.env.GROQ_API_KEY,
            model: 'llama3-70b-8192'
        };
    }

    return {
        baseURL: 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4o-mini'
    };
}

const config = getAIConfig();

const client = new OpenAI({
    apiKey: config.apiKey || 'dummy_key',
    baseURL: config.baseURL
});

console.log(`[AI] Provider: ${AI_PROVIDER.toUpperCase()} | Model: ${config.model}`);

module.exports = { client, model: config.model, provider: AI_PROVIDER };
