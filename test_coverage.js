require('dotenv').config({ path: './.env' });
const db = require('./config/db');
const Connection = require('./models/Connection');
const PageContent = require('./models/PageContent');
const ConnectionDiscovery = require('./models/ConnectionDiscovery');
const KnowledgeCoverage = require('./models/KnowledgeCoverage');
const KnowledgeCategory = require('./models/KnowledgeCategory');
const ConnectionBrandProfile = require('./models/ConnectionBrandProfile');

const TEST_ID = 'test_coverage_' + Date.now();

async function runTest() {
    console.log("🧪 Starting Knowledge Coverage Engine Test...");

    try {
        await db.authenticate();
        console.log("✅ Database Connected");

        // 1. Create Test Connection
        console.log("\n👉 Step 1: Creating Test Connection...");
        await Connection.create({
            connectionId: TEST_ID,
            websiteName: "Coverage Test Site",
            extractionEnabled: true,
            status: 'ACTIVE'
        });

        // 2. Seed Discovery records (simulate discovered pages)
        console.log("👉 Step 2: Seeding Discovery Records...");
        const discoveryUrls = [
            'https://example.com/',
            'https://example.com/pricing',
            'https://example.com/support',
            'https://example.com/about',
            'https://example.com/blog/post-1',
            'https://example.com/product/features',
            'https://example.com/faq',
            'https://example.com/terms'
        ];

        for (const url of discoveryUrls) {
            await ConnectionDiscovery.create({
                connectionId: TEST_ID,
                discoveredUrl: url,
                source: 'SITEMAP',
                status: 'DISCOVERED'
            });
        }
        console.log(`   Seeded ${discoveryUrls.length} discovery entries`);

        // 3. Seed PageContent (simulate approved & extracted pages)
        console.log("👉 Step 3: Seeding PageContent...");
        const pages = [
            { url: 'https://example.com/pricing', text: generateText('pricing plans subscription enterprise starter pro monthly annual billing payment checkout cart discount coupon offer trial free premium', 350) },
            { url: 'https://example.com/support', text: generateText('support help contact ticket issue bug report troubleshoot guide documentation setup installation configuration account password reset email phone live chat', 350) },
            { url: 'https://example.com/about', text: generateText('about us our team company mission vision values founded history story leadership culture employees office headquarters', 350) },
            { url: 'https://example.com/product/features', text: generateText('product features solution platform dashboard analytics reports integration API developer tools automation workflow pipeline real-time alerts notifications', 350) },
            { url: 'https://example.com/blog/post-1', text: generateText('blog article news update announcement release version changelog improvement enhancement performance optimization security patch deployment infrastructure', 100) } // Thin content
        ];

        for (const p of pages) {
            await PageContent.create({
                connectionId: TEST_ID,
                url: p.url,
                cleanText: p.text,
                contentHash: require('crypto').createHash('sha256').update(p.text).digest('hex'),
                wordCount: p.text.split(/\s+/).length,
                status: 'FETCHED'
            });
        }
        console.log(`   Seeded ${pages.length} page contents`);

        // 4. Test Categorization
        console.log("\n👉 Step 4: Testing Page Categorization...");
        const { categorizePages, calculateCoverage, getLaunchReadiness } = require('./services/coverage/knowledgeCoverageService');
        const catResult = await categorizePages(TEST_ID);
        console.log(`   Categorized: ${catResult.categorized}, Skipped: ${catResult.skipped}`);

        // Verify categories
        const pricingPage = await PageContent.findOne({ where: { connectionId: TEST_ID, url: 'https://example.com/pricing' } });
        if (pricingPage.category !== 'PRICING') throw new Error(`Pricing page category wrong: ${pricingPage.category}`);
        console.log("   ✅ Pricing page → PRICING");

        const supportPage = await PageContent.findOne({ where: { connectionId: TEST_ID, url: 'https://example.com/support' } });
        if (supportPage.category !== 'SUPPORT') throw new Error(`Support page category wrong: ${supportPage.category}`);
        console.log("   ✅ Support page → SUPPORT");

        const productPage = await PageContent.findOne({ where: { connectionId: TEST_ID, url: 'https://example.com/product/features' } });
        if (productPage.category !== 'PRODUCT') throw new Error(`Product page category wrong: ${productPage.category}`);
        console.log("   ✅ Product page → PRODUCT");

        // 5. Test Coverage Calculation
        console.log("\n👉 Step 5: Testing Coverage Calculation...");
        const coverage = await calculateCoverage(TEST_ID);
        console.log(`   Coverage Score: ${(coverage.coverageScore * 100).toFixed(0)}%`);
        console.log(`   Critical Coverage: ${(coverage.criticalCoverageScore * 100).toFixed(0)}%`);
        console.log(`   Risk Level: ${coverage.riskLevel}`);
        console.log(`   Missing: ${coverage.missingCategories.join(', ') || 'None'}`);

        if (coverage.coverageScore <= 0) throw new Error("Coverage score should be > 0");
        if (coverage.criticalCoverageScore <= 0) throw new Error("Critical score should be > 0");
        console.log("   ✅ Coverage scores valid");

        // Verify DB persistence
        const dbCoverage = await KnowledgeCoverage.findByPk(TEST_ID);
        if (!dbCoverage) throw new Error("KnowledgeCoverage not persisted");
        console.log("   ✅ KnowledgeCoverage persisted");

        const dbCategories = await KnowledgeCategory.findAll({ where: { connectionId: TEST_ID } });
        if (dbCategories.length === 0) throw new Error("KnowledgeCategory not persisted");
        console.log(`   ✅ ${dbCategories.length} KnowledgeCategory records persisted`);

        // 6. Test Launch Readiness
        console.log("\n👉 Step 6: Testing Launch Readiness...");
        const readiness = await getLaunchReadiness(TEST_ID);
        console.log(`   Readiness Score: ${readiness.readinessScore}%`);
        console.log(`   Breakdown:`, readiness.breakdown);
        console.log(`   Suggestions: ${readiness.suggestions.join(' | ') || 'None'}`);

        if (readiness.readinessScore < 0 || readiness.readinessScore > 100) throw new Error("Invalid readiness score");
        console.log("   ✅ Readiness formula valid");

        // 7. Cleanup
        console.log("\n👉 Cleaning up...");
        await PageContent.destroy({ where: { connectionId: TEST_ID } });
        await ConnectionDiscovery.destroy({ where: { connectionId: TEST_ID } });
        await KnowledgeCoverage.destroy({ where: { connectionId: TEST_ID } });
        await KnowledgeCategory.destroy({ where: { connectionId: TEST_ID } });
        await Connection.destroy({ where: { connectionId: TEST_ID } });

        console.log("\n🎉 All Coverage Engine Tests PASSED!");
        process.exit(0);

    } catch (err) {
        console.error("\n❌ Test Failed:", err.message);
        if (err.errors) console.error("Validation:", JSON.stringify(err.errors, null, 2));
        if (err.original) console.error("Original:", err.original.message);
        // Cleanup on failure
        try {
            await PageContent.destroy({ where: { connectionId: TEST_ID } });
            await ConnectionDiscovery.destroy({ where: { connectionId: TEST_ID } });
            await KnowledgeCoverage.destroy({ where: { connectionId: TEST_ID } });
            await KnowledgeCategory.destroy({ where: { connectionId: TEST_ID } });
            await Connection.destroy({ where: { connectionId: TEST_ID } });
        } catch (cleanupErr) { /* ignore */ }
        process.exit(1);
    }
}

function generateText(keywords, wordCount) {
    const words = keywords.split(' ');
    let text = '';
    for (let i = 0; i < wordCount; i++) {
        text += words[i % words.length] + ' ';
    }
    return text.trim();
}

runTest();
