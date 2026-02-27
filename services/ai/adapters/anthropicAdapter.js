const axios = require('axios');

exports.generate = async ({ messages, temperature = 0, response_format, max_tokens = 4096 }) => {
    try {
        const baseURL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
        const apiKey = process.env.ANTHROPIC_API_KEY;

        if (!apiKey) {
            throw new Error("ANTHROPIC_API_KEY is not defined in environment variables.");
        }

        // Extract system prompt if present, Anthropic expects it at top level, not in messages list
        let systemMsg = "";
        const anthropicMessages = [];

        for (const msg of messages) {
            if (msg.role === 'system') {
                systemMsg += msg.content + "\n";
            } else {
                anthropicMessages.push({
                    role: msg.role === 'user' ? 'user' : 'assistant',
                    content: msg.content
                });
            }
        }

        const payload = {
            model: 'claude-3-5-sonnet-latest', // Can be parameterized if needed
            messages: anthropicMessages,
            max_tokens: max_tokens,
            temperature: temperature,
            stream: false
        };

        if (systemMsg.trim()) {
            payload.system = systemMsg.trim();
        }

        // Note: Anthropic doesn't have a direct equivalent to response_format={"type": "json_object"} natively 
        // without Tool Use in all their models yet, but latest models support it better or you just rely on prompting.
        // If a proxy like ollama is used (e.g. litellm), it might accept standard OpenAI format instead. 
        // But assuming this is standard Anthropic API format as requested:

        const response = await axios.post(
            `${baseURL}/v1/messages`,
            payload,
            {
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                }
            }
        );

        let content = response.data.content[0].text;

        // Clean markdown fences if present
        if (response_format && response_format.type === 'json_object') {
            if (content.startsWith('```json')) {
                content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (content.startsWith('```')) {
                content = content.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
        }

        return {
            content: content,
            usage: {
                prompt_tokens: response.data.usage?.input_tokens || 0,
                completion_tokens: response.data.usage?.output_tokens || 0,
                total_tokens: (response.data.usage?.input_tokens || 0) + (response.data.usage?.output_tokens || 0)
            }
        };

    } catch (error) {
        console.error('Anthropic Error:', error.response?.data || error.message);
        throw error;
    }
};
