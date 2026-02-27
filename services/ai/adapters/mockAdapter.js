exports.generate = async ({ messages }) => {
    return {
        content: JSON.stringify({
            mock: true,
            message: "This is a mock response.",
            industry: "Technology",
            tone: "Friendly",
            bot_name: "MockBot",
            welcome_message: "Hello from MockBot!"
        }),
        usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30
        }
    };
};
