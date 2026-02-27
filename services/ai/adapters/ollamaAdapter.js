const axios = require('axios');

exports.generate = async ({ messages, temperature = 0, response_format }) => {
    try {
        const payload = {
            model: 'llama3',
            messages,
            temperature,
            stream: false
        };

        if (response_format && response_format.type === 'json_object') {
            payload.format = 'json';
        }

        const response = await axios.post(
            'http://localhost:11434/v1/chat/completions',
            payload
        );

        let content = response.data.choices[0].message.content;

        // Clean markdown fences if present (Ollama sometimes adds them even in JSON mode)
        if (content.startsWith('```json')) {
            content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (content.startsWith('```')) {
            content = content.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        return {
            content: content,
            usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
            }
        };

    } catch (error) {
        console.error('Ollama Error:', error.message);
        throw error;
    }
};
