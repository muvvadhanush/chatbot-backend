// tests/vector_search_e2e.js
require('dotenv').config();
const sequelize = require('../config/db');
const Connection = require('../models/Connection');
const ConnectionKnowledge = require('../models/ConnectionKnowledge');
const aiService = require('../services/aiService');
const promptService = require('../services/promptService');
const { v4: uuidv4 } = require('uuid');

async function runE2ETest() {
    console.log("\n🚀 Starting Full End-to-End Vector Search Test...");

    const connectionId = uuidv4(); // Full UUID to avoid any collision

    try {
        // 1. Setup Connection
        await Connection.create({
            connectionId,
            websiteUrl: 'https://e2e-vector-test.com',
            websiteName: 'Vector Test Site',
            assistantName: 'Vector Tester Bot',
            status: 'CONNECTED',
            systemPrompt: 'You are a professional support bot. Use the retrieved context exclusively.'
        });
        console.log(`✅ Connection created: ${connectionId}`);

        // 2. Prepare Knowledge Items (Semantic diversity)
        const knowledgeItems = [
            {
                text: "To upgrade your subscription, go to the billing portal and select the 'Neural Diamond' tier. Payments are processed securely via Stripe. Annual plans get a 20% discount.",
                label: "Billing & Subscriptions"
            },
            {
                text: "Our technical support team is available Monday through Friday, 9 AM to 5 PM EST. For critical issues, email emergency@example.com including your CID.",
                label: "Support Availability"
            },
            {
                text: "The 'Neural Indigo' design system uses HSL(242, 94%, 68%) for accents and soft dual-shadow neumorphic containers. It is the default for all premium bots.",
                label: "Visual Design Identity"
            }
        ];

        console.log("📥 Ingesting knowledge items and generating embeddings...");
        for (const item of knowledgeItems) {
            const embedding = await aiService.generateEmbedding(item.text);
            await ConnectionKnowledge.create({
                connectionId,
                sourceType: 'TEXT',
                sourceValue: item.label,
                rawText: item.text,
                cleanedText: item.text,
                embedding: embedding,
                status: 'READY'
            });
        }
        console.log("✅ Knowledge ingested with real OpenAI embeddings.");

        // 3. Perform Semantic Retrieval Tests
        const testQueries = [
            { q: "How can I pay for the premium plan?", expect: "billing portal" },
            { q: "What are your business hours?", expect: "support team" },
            { q: "What color is the indigo theme?", expect: "HSL(242" }
        ];

        console.log("\n🔍 Running Semantic Retrieval Tests...");
        for (const test of testQueries) {
            const results = await aiService.findSimilarKnowledge(connectionId, test.q);
            if (results.length > 0 && results[0].text.toLowerCase().includes(test.expect.toLowerCase())) {
                console.log(`   ✅ PASS: Query "${test.q}" -> Match: "${test.expect}" (Similarity: ${(results[0].score * 100).toFixed(1)}%)`);
            } else {
                console.error(`   ❌ FAIL: Query "${test.q}" failed to retrieve correct content.`);
                if (results.length > 0) {
                    console.log(`      Mismatch: ${results[0].text.substring(0, 100)}... (Similarity: ${(results[0].score * 100).toFixed(1)}%)`);
                } else {
                    console.log(`      No results found even with keyword fallback.`);
                }
            }
        }

        // 4. Test Full Chat Completion with RAG
        console.log("\n💬 Testing Chat Completion with RAG Context...");
        const systemPrompt = await promptService.assemblePrompt(connectionId, 'https://e2e-vector-test.com', "");
        const chatResult = await aiService.freeChat({
            message: "I want to upgrade, what are the tiers and do you take stripe?",
            history: [],
            connectionId,
            systemPrompt: systemPrompt
        });

        if (chatResult.reply.toLowerCase().includes('neural diamond') &&
            chatResult.reply.toLowerCase().includes('stripe') &&
            chatResult.sources.length > 0) {
            console.log("   ✅ PASS: AI correctly used RAG context and cited sources.");
            console.log(`      AI Response: ${chatResult.reply.substring(0, 150)}...`);
            console.log(`      Sources: ${chatResult.sources.map(s => s.sourceId).join(', ')}`);
        } else {
            console.error("   ❌ FAIL: AI response didn't contain expected context or missed sources.");
            console.log(`      Response: ${chatResult.reply}`);
        }

    } catch (err) {
        console.error("❌ E2E Test Execution Failed:", err);
    } finally {
        console.log("\n🧹 Cleaning up test data...");
        try {
            await ConnectionKnowledge.destroy({ where: { connectionId } });
            await Connection.destroy({ where: { connectionId } });
            await sequelize.close();
            console.log("✅ Cleanup complete.");
        } catch (e) {
            console.error("Cleanup Error:", e.message);
        }
        console.log("👋 Full E2E Vector Search Test Finished.\n");
        process.exit();
    }
}

runE2ETest();
