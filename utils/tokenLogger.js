const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const LOG_FILE_PATH = path.join(__dirname, '../data/token_usage.jsonl');

/**
 * Records token usage to a local JSONL file.
 * 
 * @param {Object} data - The usage data to record.
 * @param {string} data.connectionId - The connection ID.
 * @param {string} data.provider - The AI provider (e.g., 'openai', 'groq').
 * @param {string} data.model - The model used.
 * @param {Object} data.usage - Token usage stats { prompt_tokens, completion_tokens, total_tokens }.
 * @param {string} data.context - The context of the request (e.g., 'free_chat', 'embedding').
 */
exports.recordUsage = async (data) => {
    try {
        const entry = {
            timestamp: new Date().toISOString(),
            ...data,
            costEstimate: calculateCost(data.provider, data.model, data.usage)
        };

        const line = JSON.stringify(entry) + '\n';

        await fs.promises.appendFile(LOG_FILE_PATH, line, 'utf8');

        // Also log to standard logger for redundancy
        logger.info('Token Usage Recorded', {
            provider: data.provider,
            model: data.model,
            tokens: data.usage.total_tokens
        });

    } catch (error) {
        logger.error('Failed to record token usage', { error: error.message });
    }
};

/**
 * Simple cost estimation (USD) based on common models.
 * Prices are approximate and per 1k tokens for simplicity in this MVP.
 */
function calculateCost(provider, model, usage) {
    if (!usage) return 0;

    // Rates per 1M tokens (as of Feb 2026 approx)
    const rates = {
        'openai': {
            'gpt-4o': { input: 2.50, output: 10.00 },
            'gpt-4o-mini': { input: 0.15, output: 0.60 },
            'text-embedding-3-small': { input: 0.02, output: 0.00 }
        },
        'groq': {
            'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
            'llama3-8b-8192': { input: 0.05, output: 0.10 }
        }
    };

    const providerRates = rates[provider] || {};
    const modelRates = providerRates[model] || { input: 0, output: 0 };

    const inputCost = (usage.prompt_tokens / 1000000) * modelRates.input;
    const outputCost = (usage.completion_tokens / 1000000) * modelRates.output;

    return Number((inputCost + outputCost).toFixed(8)); // 8 decimals for micro-costs
}
