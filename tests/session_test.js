// tests/session_test.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sequelize = require('../config/db');
const Connection = require('../models/Connection');
const ChatSession = require('../models/ChatSession');
const { v4: uuidv4 } = require('uuid');
// const request = require('supertest'); // Removed as not used and not installed
// If not, we can simlulate by calling chatController directly or mocking req/res.
// Let's use direct controller call or a simple fetch if server running?
// Actually simpler to just use models and standard check.
// But we need to call logic. aiService mock might be needed to avoid calling real AI.
// Let's rely on the fact that controller calls aiService.
// We'll mock aiService.freeChat? checking module imports.

// Let's write a simple integration test using the controller logic directly.
// We need to mock req and res.

const chatController = require('../controllers/chatController');

// Mock helpers
const mockResponse = () => {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.body = data;
        return res;
    };
    return res;
};

async function runTest() {
    console.log('\n🔒 Starting Session Isolation Test...\n');

    const connAId = 'sess-test-A-' + uuidv4().substring(0, 8);
    const connBId = 'sess-test-B-' + uuidv4().substring(0, 8);
    const sessionId = 'session-' + uuidv4();

    let failure = false;

    // We need to silence aiService console logs or unrelated errors
    // Since we are not mocking aiService, it might try to call OpenAI.
    // However, if we don't have a valid API key or budget, it might fail.
    // The vulnerability is in the *checking* logic before AI is called?
    // Actually, check happens inside sendMessage.
    // If we want to test REJECTION, we hope it rejects BEFORE calling AI (if validation added).
    // But currently it DOES NOT reject. So it WILL call AI.
    // That's fine, we can catch the error if AI fails, as long as we verify the SIDE EFFECT (DB update).
    // Or we can mock `aiService.freeChat`.

    // Quick mock of aiService for this process run
    const originalFreeChat = require('../services/aiService').freeChat;
    require('../services/aiService').freeChat = async () => ({ reply: "Mocked AI Response", sources: [] });

    try {
        // 1. SETUP
        console.log('1. 🛠️  Setting up test connections...');
        await Connection.create({
            connectionId: connAId, status: 'CONNECTED', assistantName: "Bot A",
            permissions: { aiEnabled: true }
        });
        await Connection.create({
            connectionId: connBId, status: 'CONNECTED', assistantName: "Bot B",
            permissions: { aiEnabled: true }
        });

        // 2. CREATE SESSION FOR A
        console.log('2. 👶 Creating Session for Connection A...');
        await ChatSession.create({
            sessionId: sessionId,
            connectionId: connAId,
            messages: [{ role: 'assistant', text: "Hi from A" }],
            mode: 'FREE_CHAT'
        });

        // 3. ATTACK: Send valid request for B using A's session
        console.log('3. ⚔️  Attempting Session Hijack (Using A\'s session to talk to B)...');

        const req = {
            body: {
                message: "Hello B from A's session",
                sessionId: sessionId,
                connectionId: connBId, // <--- MISMATCH
                url: "http://beta.com"
            }
        };
        const res = mockResponse();

        await chatController.sendMessage(req, res);

        // 4. VERIFY
        console.log('4. 🔍 Verifying DB State...');
        const updatedSession = await ChatSession.findOne({ where: { sessionId } });

        // Assertions
        const messages = updatedSession.messages;
        const lastMsg = messages[messages.length - 1];

        console.log(`   Session connectionId in DB: ${updatedSession.connectionId}`);
        console.log(`   Last message in session: "${lastMsg ? lastMsg.text : 'NONE'}" (Assistant reply)`);

        // If the code is VULNERABLE, it proceeds to add messages to the session.
        // It might NOT change session.connectionId (defaults to A).
        // So we check if the interaction was recorded.

        // Is the vulnerability that B's chat log is in A's session? Yes.
        // Did the controller return success?
        if (res.statusCode === 200) {
            console.warn('   ⚠️  Request succeeded (Status 200). Logic did not block mismatch.');
        } else {
            console.log(`   ℹ️  Request status: ${res.statusCode} (Error: ${res.body?.error})`);
        }

        const contaminationFound = messages.some(m => m.text === "Hello B from A's session");

        if (contaminationFound) {
            console.error('\n❌ CRITICAL FAIL: SESSION CONTAMINATION DETECTED!');
            console.error('   The message intended for Connection B was saved to Connection A\'s session.');
            failure = true;
        } else {
            // Note: If request failed for other reasons (like AI mock fail), we might get false positive pass.
            // But with mocked AI, success means contamination.
            console.log('   ✅ PASS: No contamination detected (Message not saved).');
        }

    } catch (err) {
        console.error('\n❌ EXECUTION ERROR:', err);
        failure = true; // Error might be good if it rejected request, but we need to be sure.
    } finally {
        // Restore mock
        require('../services/aiService').freeChat = originalFreeChat;

        // Cleanup
        console.log('\n5. 🧹 Cleanup...');
        await ChatSession.destroy({ where: { sessionId } });
        await Connection.destroy({ where: { connectionId: [connAId, connBId] } });
        await sequelize.close();

        if (failure) {
            console.log('\n🔴 TEST FAILED: Isolation Breach.\n');
            process.exit(1);
        } else {
            console.log('\n🟢 TEST PASSED: Isolation Verified.\n');
            process.exit(0);
        }
    }
}

runTest();
