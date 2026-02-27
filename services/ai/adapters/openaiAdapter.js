const { client, model } = require('../../../config/aiClient');

exports.generate = async ({ messages, temperature = 0.7, max_tokens, response_format }) => {
    try {
        const completion = await client.chat.completions.create({
            model: model,
            messages: messages,
            temperature: temperature,
            max_tokens: max_tokens,
            response_format: response_format
        });

        return {
            content: completion.choices[0].message.content,
            usage: completion.usage
        };

    } catch (error) {
        console.error('OpenAI Adapter Error:', error.message);
        throw error;
    }
};
