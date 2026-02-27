const openaiAdapter = require('./adapters/openaiAdapter');
const ollamaAdapter = require('./adapters/ollamaAdapter');
const mockAdapter = require('./adapters/mockAdapter');
const anthropicAdapter = require('./adapters/anthropicAdapter');

const provider = process.env.AI_PROVIDER || 'openai';

exports.generate = async (payload) => {
    if (provider === 'ollama') {
        return ollamaAdapter.generate(payload);
    }
    if (provider === 'mock') {
        return mockAdapter.generate(payload);
    }
    if (provider === 'anthropic') {
        return anthropicAdapter.generate(payload);
    }
    return openaiAdapter.generate(payload);
};
