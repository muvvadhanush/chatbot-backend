require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const aiAdapter = require('../services/ai/aiAdapter');

(async () => {
    const response = await aiAdapter.generate({
        messages: [
            { role: 'system', content: 'You are a test assistant.' },
            { role: 'user', content: 'Say hello.' }
        ],
        temperature: 0
    });

    console.log('Response:', response);
})();
