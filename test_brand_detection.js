const axios = require('axios');
require('dotenv').config({ path: './.env' });
const { Sequelize } = require('sequelize');
const db = require('./config/db');
const Connection = require('./models/Connection');
const PageContent = require('./models/PageContent');
const ConnectionBrandProfile = require('./models/ConnectionBrandProfile');
const BehaviorConfig = require('./models/BehaviorConfig');

// Test Config
const API_URL = 'http://localhost:5000/api/v1';
const TEST_CONN_ID = 'test_brand_conn_' + Date.now();

async function runTest() {
    console.log("🧪 Starting Brand Detection System Test...");

    try {
        await db.authenticate();
        console.log("✅ Database Connected");

        // 1. Create Test Connection
        console.log("👉 Creating Test Connection...");
        const conn = await Connection.create({
            connectionId: TEST_CONN_ID,
            websiteName: "Test Brand Site",
            extractionEnabled: true,
            status: 'ACTIVE'
        });
        console.log(`   Created: ${TEST_CONN_ID}`);

        // 2. Mock Page Content (Simulate Extraction)
        console.log("👉 Seeding Mock Page Content...");
        const mockText = `
        Welcome to Acme SaaS solutions. We provide enterprise-grade analytics for finance teams.
        Our goal is to help you streamline reporting and reduce errors by 50%.
        Join over 500 companies who trust us.
        Pricing starts at $99/mo. Contact sales for a demo.
        We are professional, secure, and reliable.
        
        Our platform integrates seamlessly with your existing stack. 
        Features include real-time dashboards, automated forecasting, and custom reports.
        We have been in business for over 10 years and have won multiple awards.
        Customer satisfaction is our top priority. We offer 24/7 support.
        Security is built-in from the ground up. We are SOC2 Type II compliant.
        
        Start your free trial today. No credit card required.
        Cancel anytime. Money back guarantee.
        Read our case studies to see how we help businesses like yours.
        Financial clarity is just a click away.
        Unlock the power of your data with Acme SaaS.
        Efficiency, Accuracy, and Speed. That is our promise.
        Contact us at support@acme.com or call 1-800-555-0199.
        We look forward to serving you.
        `;

        await PageContent.create({
            connectionId: TEST_CONN_ID,
            url: 'https://example.com',
            cleanText: mockText,
            contentHash: 'mock_hash_12345',
            status: 'FETCHED',
            fetchedAt: new Date()
        });

        // 3. Trigger Brand Detection (API)
        // Note: This requires Server to be running.
        // If server not running, we test Service directly.
        // We will assume Server MIGHT not be running in this script context, 
        // so lets test the SERVICE logic directly for unit test reliability.
        console.log("👉 Testing Service Logic (Direct Call)...");

        const { detectBrandProfile } = require('./services/brand/brandDetectionService');
        const result = await detectBrandProfile(TEST_CONN_ID, 'MANUAL');

        console.log("✅ Detection Result:", JSON.stringify(result, null, 2));

        if (!result.profile.industry) throw new Error("Industry missing");
        if (!result.behavior.role) throw new Error("Role missing");

        // 4. Verify Database Persistence
        console.log("👉 Verifying DB Persistence...");
        const dbProfile = await ConnectionBrandProfile.findOne({ where: { connectionId: TEST_CONN_ID } });
        const dbConfig = await BehaviorConfig.findOne({ where: { connectionId: TEST_CONN_ID } });

        if (!dbProfile) throw new Error("Profile not saved to DB");
        if (!dbConfig) throw new Error("Config not saved to DB");

        console.log("✅ DB Records Found:", {
            industry: dbProfile.industry,
            role: dbConfig.role
        });

        // 5. Cleanup
        console.log("👉 Cleaning up...");
        await conn.destroy(); // Cascades? Check models. Usually yes or we delete manually.
        // Manually clean child tables if no cascade
        await PageContent.destroy({ where: { connectionId: TEST_CONN_ID } });
        await ConnectionBrandProfile.destroy({ where: { connectionId: TEST_CONN_ID } });
        await BehaviorConfig.destroy({ where: { connectionId: TEST_CONN_ID } });

        console.log("🎉 Test Passed Successfully!");
        process.exit(0);

    } catch (err) {
        console.error("❌ Test Failed:", err.message);
        if (err.errors) console.error("Validation Errors:", JSON.stringify(err.errors, null, 2));
        if (err.original) console.error("Original Error:", err.original);
        process.exit(1);
    }
}

runTest();
