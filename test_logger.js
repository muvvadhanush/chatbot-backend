const tokenLogger = require('./utils/tokenLogger');

async function test() {
    console.log("Testing Token Logger...");

    await tokenLogger.recordUsage({
        connectionId: 'TEST_CONN',
        provider: 'openai',
        model: 'gpt-4o',
        usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 },
        context: 'test'
    });

    await tokenLogger.recordUsage({
        connectionId: 'TEST_CONN',
        provider: 'groq',
        model: 'llama3-70b',
        usage: { total_tokens: 200, prompt_tokens: 100, completion_tokens: 100 },
        context: 'test'
    });

    console.log("Done.");
}

test();
