const { client: openai, model: AI_MODEL } = require('../../config/aiClient');
const { Op } = require('sequelize');
const PageContent = require('../../models/PageContent');
const ConnectionBrandProfile = require('../../models/ConnectionBrandProfile');
const BehaviorConfig = require('../../models/BehaviorConfig');

/**
 * Orchestrates the brand detection process
 */
async function detectBrandProfile(connectionId, source = 'AUTO') {
    try {
        console.log(`[BRAND] Starting detection for ${connectionId}`);

        // 1. Content Sampling
        const contentSample = await sampleContent(connectionId);
        if (!contentSample || contentSample.length < 500) {
            throw new Error('Insufficient content for analysis (min 500 chars)');
        }

        // 2. AI Analysis
        const analysis = await analyzeWithAI(contentSample);

        // 3. Deterministic Mapping
        const behavior = mapBrandToBehavior(analysis);

        // 4. Store Results
        // Save Profile
        const [profile, created] = await ConnectionBrandProfile.upsert({
            connectionId: connectionId,
            industry: analysis.industry,
            tone: analysis.tone,
            audience: analysis.target_audience, // Maps to 'audience'
            salesIntensityScore: analysis.sales_aggressiveness,
            complexityScore: analysis.reading_complexity,
            emotionalTone: analysis.emotional_positioning,
            primaryGoal: analysis.primary_goal,
            confidence: analysis.confidence,
            detectedAt: new Date(),
            source: source
        }, { returning: true });

        // Save Behavior Config (Only if AUTO or not exists)
        // We generally overwrite AUTO config, but respect MANUAL if it exists?
        // Requirement: "BehaviorConfig (AUTO source)"
        await BehaviorConfig.upsert({
            connectionId: connectionId,
            role: behavior.role,
            tone: behavior.tone,
            salesIntensity: behavior.salesIntensity,
            responseLength: behavior.responseLength,
            source: 'AUTO',
            updatedAt: new Date()
        });

        return { profile, behavior };

    } catch (error) {
        console.error(`[BRAND] Detection failed: ${error.message}`);
        throw error;
    }
}

/**
 * Step 1: Intelligent Content Sampling
 */
async function sampleContent(connectionId) {
    const pages = await PageContent.findAll({
        where: { connectionId: connectionId, status: 'FETCHED' },
        attributes: ['url', 'cleanText', 'wordCount']
    });

    if (pages.length === 0) return null;

    let selectedPages = [];
    const pushPage = (p) => {
        if (p && !selectedPages.find(existing => existing.url === p.url)) {
            selectedPages.push(p);
        }
    };

    // 1. Homepage (URL is shortest or ends in /)
    const homepage = pages.reduce((shortest, p) => p.url.length < shortest.url.length ? p : shortest, pages[0]);
    pushPage(homepage);

    // 2. About Page
    const about = pages.find(p => p.url.toLowerCase().includes('about'));
    if (about) pushPage(about);

    // 3. Pricing Page
    const pricing = pages.find(p => p.url.toLowerCase().includes('pricing'));
    if (pricing) pushPage(pricing);

    // 4. Top 3 Longest (by word count)
    const sortedByLength = [...pages].sort((a, b) => b.wordCount - a.wordCount);
    for (let i = 0; i < 3; i++) {
        if (sortedByLength[i]) pushPage(sortedByLength[i]);
    }

    // Fallback: If we have very few, take top 5 length
    if (selectedPages.length < 3) {
        for (let i = 0; i < 5; i++) {
            if (sortedByLength[i]) pushPage(sortedByLength[i]);
        }
    }

    // Concatenate text up to limit
    let combinedText = '';
    const MAX_CHARS = 15000;

    for (const page of selectedPages) {
        if (combinedText.length >= MAX_CHARS) break;
        combinedText += `\n--- SOURCE: ${page.url} ---\n${page.cleanText.substring(0, 5000)}\n`;
    }

    return combinedText.substring(0, MAX_CHARS);
}

/**
 * Step 2: AI Analysis
 */
async function analyzeWithAI(text) {
    const prompt = `
    Analyze the following website content and extract the brand profile.
    
    Content Sample:
    "${text.substring(0, 15000)}"

    Return a valid JSON object with these exact keys:
    1. "industry": (String) E.g., SaaS, E-commerce, Healthcare.
    2. "tone": (String) One of: Formal, Casual, Technical, Luxury, Playful.
    3. "target_audience": (String) E.g., Consumer, Enterprise, Developer.
    4. "primary_goal": (String) E.g., Lead Generation, Sales, Support, Education.
    5. "sales_aggressiveness": (Float 0.0-1.0) 1.0 is very pushy.
    6. "reading_complexity": (Float 0.0-1.0) 1.0 is academic/dense.
    7. "emotional_positioning": (String) E.g., Trust, Urgency, Authority.
    8. "confidence": (Float 0.0-1.0) Confidence in this analysis.
    `;

    const response = await openai.chat.completions.create({
        model: AI_MODEL,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 500,
        temperature: 0.1 // Deterministic
    });

    return JSON.parse(response.choices[0].message.content);
}

/**
 * Step 3: Deterministic Mapping
 */
function mapBrandToBehavior(profile) {
    let role = 'Support Assistant'; // Default

    // Role Logic
    const goal = profile.primary_goal?.toLowerCase() || '';
    const industry = profile.industry?.toLowerCase() || '';

    if (goal.includes('sales') || goal.includes('lead')) {
        role = 'Sales Assistant';
    } else if (goal.includes('education')) {
        role = 'Teaching Assistant';
    }

    if (industry.includes('saas') && role === 'Support Assistant') {
        role = 'Product Support Specialist';
    }

    // Response Length Logic
    // High complexity -> Long answers needed to explain
    const responseLength = (profile.reading_complexity > 0.6) ? 'LONG' : 'MEDIUM';

    // Tone Mapping (Direct)
    const tone = profile.tone || 'Neutral';

    // Sales Intensity (Direct)
    const salesIntensity = profile.sales_aggressiveness || 0.5;

    return {
        role,
        tone,
        salesIntensity,
        responseLength
    };
}

module.exports = { detectBrandProfile };
