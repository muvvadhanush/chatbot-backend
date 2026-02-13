const { client: openai, model: AI_MODEL } = require('../../config/aiClient');
const { Op } = require('sequelize');
const PageContent = require('../../models/PageContent');
const KnowledgeCoverage = require('../../models/KnowledgeCoverage');
const KnowledgeCategory = require('../../models/KnowledgeCategory');
const ConnectionDiscovery = require('../../models/ConnectionDiscovery');
const ConnectionBrandProfile = require('../../models/ConnectionBrandProfile');


// Critical categories (2x weight)
const CRITICAL_CATEGORIES = ['PRICING', 'SUPPORT', 'PRODUCT'];
const ALL_CATEGORIES = ['PRICING', 'SUPPORT', 'ABOUT', 'LEGAL', 'FAQ', 'BLOG', 'PRODUCT', 'OTHER'];

// Deterministic URL-based classification rules
const URL_RULES = [
    { patterns: ['pricing', 'plans', 'packages', 'subscription'], category: 'PRICING' },
    { patterns: ['support', 'help', 'contact', 'ticket'], category: 'SUPPORT' },
    { patterns: ['about', 'team', 'story', 'mission', 'company'], category: 'ABOUT' },
    { patterns: ['legal', 'privacy', 'terms', 'tos', 'gdpr', 'cookie'], category: 'LEGAL' },
    { patterns: ['faq', 'frequently-asked', 'questions'], category: 'FAQ' },
    { patterns: ['blog', 'news', 'article', 'post'], category: 'BLOG' },
    { patterns: ['product', 'features', 'solution', 'platform', 'demo'], category: 'PRODUCT' }
];

// Importance scores per category
const IMPORTANCE_MAP = {
    'PRICING': 0.95,
    'SUPPORT': 0.9,
    'PRODUCT': 0.85,
    'FAQ': 0.75,
    'LEGAL': 0.7,
    'ABOUT': 0.6,
    'BLOG': 0.4,
    'OTHER': 0.3
};

/**
 * STEP 1: Page Categorization Engine
 * URL-based deterministic rules first, AI fallback for uncategorized pages.
 */
async function categorizePages(connectionId) {
    console.log(`[COVERAGE] Starting categorization for ${connectionId}`);

    const pages = await PageContent.findAll({
        where: {
            connectionId,
            status: 'FETCHED',
            category: { [Op.or]: [null, ''] }
        }
    });

    if (pages.length === 0) {
        console.log('[COVERAGE] No uncategorized pages found');
        return { categorized: 0, skipped: 0 };
    }

    let categorized = 0;
    let skipped = 0;
    const uncategorizedPages = [];

    // Pass 1: Deterministic URL-based classification
    for (const page of pages) {
        const urlLower = page.url.toLowerCase();
        let matched = false;

        for (const rule of URL_RULES) {
            if (rule.patterns.some(p => urlLower.includes(p))) {
                await page.update({
                    category: rule.category,
                    importanceScore: IMPORTANCE_MAP[rule.category]
                });
                categorized++;
                matched = true;
                console.log(`[COVERAGE] URL-classified: ${page.url} → ${rule.category}`);
                break;
            }
        }

        if (!matched) {
            // Skip thin content (< 300 words)
            if (!page.cleanText || page.cleanText.split(/\s+/).length < 300) {
                await page.update({
                    category: 'OTHER',
                    importanceScore: IMPORTANCE_MAP['OTHER']
                });
                skipped++;
                continue;
            }
            uncategorizedPages.push(page);
        }
    }

    // Pass 2: AI-based classification for remaining pages
    if (uncategorizedPages.length > 0) {
        console.log(`[COVERAGE] AI-classifying ${uncategorizedPages.length} pages`);
        const aiResults = await classifyWithAI(uncategorizedPages);

        for (const result of aiResults) {
            const page = uncategorizedPages.find(p => p.id === result.id);
            if (page && result.category) {
                const cat = ALL_CATEGORIES.includes(result.category) ? result.category : 'OTHER';
                await page.update({
                    category: cat,
                    importanceScore: IMPORTANCE_MAP[cat]
                });
                categorized++;
            }
        }
    }

    console.log(`[COVERAGE] Categorization complete: ${categorized} classified, ${skipped} skipped`);
    return { categorized, skipped };
}

/**
 * AI batch classification for pages that couldn't be URL-classified
 */
async function classifyWithAI(pages, retries = 0) {
    const MAX_RETRIES = 2;
    const batch = pages.slice(0, 10); // Limit batch size

    const pageList = batch.map((p, i) =>
        `${i + 1}. URL: ${p.url}\n   Content (first 500 chars): ${(p.cleanText || '').substring(0, 500)}`
    ).join('\n\n');

    const prompt = `Classify each page into exactly ONE category:
PRICING, SUPPORT, ABOUT, LEGAL, FAQ, BLOG, PRODUCT, OTHER.

Pages:
${pageList}

Return a JSON array with objects: [{ "index": 1, "category": "...", "confidence": 0.0-1.0 }]`;

    try {
        const response = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            max_tokens: 500,
            temperature: 0.1
        });

        const parsed = JSON.parse(response.choices[0].message.content);
        const results = parsed.classifications || parsed.pages || parsed.results || (Array.isArray(parsed) ? parsed : []);

        return batch.map((page, i) => {
            const match = results.find(r => r.index === (i + 1));
            return {
                id: page.id,
                category: match?.category?.toUpperCase() || 'OTHER',
                confidence: match?.confidence || 0.5
            };
        });
    } catch (err) {
        console.error(`[COVERAGE] AI classification failed (attempt ${retries + 1}):`, err.message);
        if (retries < MAX_RETRIES) {
            return classifyWithAI(pages, retries + 1);
        }
        // Fallback: mark all as OTHER
        return batch.map(p => ({ id: p.id, category: 'OTHER', confidence: 0.0 }));
    }
}

/**
 * STEP 2: Coverage Calculation (Weighted Scoring)
 */
async function calculateCoverage(connectionId) {
    console.log(`[COVERAGE] Calculating coverage for ${connectionId}`);

    // Count total discovered
    const totalDiscoveredPages = await ConnectionDiscovery.count({
        where: { connectionId }
    });

    // Count approved pages (FETCHED = approved + extracted)
    const allPages = await PageContent.findAll({
        where: { connectionId, status: 'FETCHED' },
        attributes: ['category', 'importanceScore']
    });

    const approvedPages = allPages.length;
    const indexedPages = allPages.filter(p => p.category && p.category !== 'OTHER').length;

    // Category breakdown
    const categoryMap = {};
    for (const cat of ALL_CATEGORIES) {
        categoryMap[cat] = { count: 0, totalConfidence: 0 };
    }
    for (const page of allPages) {
        const cat = page.category || 'OTHER';
        if (categoryMap[cat]) {
            categoryMap[cat].count++;
        }
    }

    // Upsert KnowledgeCategory records
    for (const [cat, data] of Object.entries(categoryMap)) {
        if (data.count > 0) {
            await KnowledgeCategory.upsert({
                connectionId,
                category: cat,
                pageCount: data.count,
                confidence: data.count > 0 ? Math.min(1.0, data.count * 0.3) : 0
            });
        }
    }

    // Weighted Coverage Score
    let criticalApproved = 0;
    let normalApproved = 0;

    for (const page of allPages) {
        if (CRITICAL_CATEGORIES.includes(page.category)) {
            criticalApproved++;
        } else {
            normalApproved++;
        }
    }

    // Use discovered pages for denominator, fallback to approved if no discovery run
    const effectiveTotal = totalDiscoveredPages || approvedPages;
    const criticalDiscovered = Math.max(CRITICAL_CATEGORIES.length, criticalApproved); // At least expect the critical count
    const normalDiscovered = Math.max(effectiveTotal - criticalDiscovered, normalApproved);

    const weightedNumerator = (criticalApproved * 2) + normalApproved;
    const weightedDenominator = (criticalDiscovered * 2) + normalDiscovered;
    const coverageScore = weightedDenominator > 0
        ? Math.min(1.0, weightedNumerator / weightedDenominator)
        : 0;

    // Critical Coverage Score
    const requiredCritical = CRITICAL_CATEGORIES.length; // 3
    const presentCritical = CRITICAL_CATEGORIES.filter(
        cat => categoryMap[cat] && categoryMap[cat].count > 0
    ).length;
    const criticalCoverageScore = presentCritical / requiredCritical;

    // Risk Classification
    const riskLevel = classifyRisk(coverageScore, criticalCoverageScore, approvedPages);

    // Upsert KnowledgeCoverage
    await KnowledgeCoverage.upsert({
        connectionId,
        totalDiscoveredPages,
        approvedPages,
        indexedPages,
        coverageScore: Math.round(coverageScore * 100) / 100,
        criticalCoverageScore: Math.round(criticalCoverageScore * 100) / 100,
        riskLevel,
        lastCalculatedAt: new Date()
    });

    // Build missing categories list
    const missingCategories = CRITICAL_CATEGORIES.filter(
        cat => !categoryMap[cat] || categoryMap[cat].count === 0
    );

    console.log(`[COVERAGE] Score: ${(coverageScore * 100).toFixed(0)}%, Critical: ${(criticalCoverageScore * 100).toFixed(0)}%, Risk: ${riskLevel}`);

    return {
        totalDiscoveredPages,
        approvedPages,
        indexedPages,
        coverageScore,
        criticalCoverageScore,
        riskLevel,
        categories: categoryMap,
        missingCategories
    };
}

/**
 * STEP 3: Risk Classification
 */
function classifyRisk(coverageScore, criticalScore, approvedPages) {
    if (approvedPages < 3) return 'CRITICAL';
    if (coverageScore < 0.3 && criticalScore < 0.33) return 'CRITICAL';
    if (coverageScore < 0.5) return 'HIGH';
    if (coverageScore < 0.7 || criticalScore < 0.67) return 'MEDIUM';
    return 'LOW';
}

/**
 * STEP 4: Launch Readiness Formula
 * Readiness = (BrandConfidence * 0.3) + (KnowledgeCoverage * 0.4) +
 *             (CriticalCoverage * 0.2) + (DriftHealth * 0.1)
 */
async function getLaunchReadiness(connectionId) {
    // Brand Confidence
    let brandConfidence = 0;
    const brandProfile = await ConnectionBrandProfile.findOne({ where: { connectionId } });
    if (brandProfile) {
        brandConfidence = brandProfile.confidence || 0;
    }

    // Coverage scores
    let coverageScore = 0;
    let criticalCoverageScore = 0;
    const coverage = await KnowledgeCoverage.findByPk(connectionId);
    if (coverage) {
        coverageScore = coverage.coverageScore;
        criticalCoverageScore = coverage.criticalCoverageScore;
    }

    // Drift Health: Ratio of non-stale pages
    const totalPages = await PageContent.count({ where: { connectionId } });
    const stalePages = await PageContent.count({ where: { connectionId, status: 'STALE' } });
    const driftHealth = totalPages > 0 ? (totalPages - stalePages) / totalPages : 1.0;

    // Composite formula
    const readiness = Math.round(
        ((brandConfidence * 0.3) +
            (coverageScore * 0.4) +
            (criticalCoverageScore * 0.2) +
            (driftHealth * 0.1)) * 100
    );

    // Breakdown
    const breakdown = {
        brandAlignment: Math.round(brandConfidence * 100),
        knowledgeCoverage: Math.round(coverageScore * 100),
        criticalCoverage: Math.round(criticalCoverageScore * 100),
        driftHealth: Math.round(driftHealth * 100)
    };

    // Suggestions
    const suggestions = [];
    if (brandConfidence < 0.5) suggestions.push('Run Brand Analysis to improve alignment.');
    if (coverageScore < 0.5) suggestions.push('Approve more discovered pages to expand coverage.');
    if (criticalCoverageScore < 1.0) {
        const missing = [];
        if (coverage) {
            const cats = await KnowledgeCategory.findAll({ where: { connectionId } });
            const presentCats = cats.map(c => c.category);
            for (const critical of CRITICAL_CATEGORIES) {
                if (!presentCats.includes(critical)) {
                    missing.push(critical.toLowerCase());
                }
            }
        }
        if (missing.length > 0) {
            suggestions.push(`Add a ${missing.join(', ')} page to improve readiness.`);
        }
    }
    if (driftHealth < 0.9) suggestions.push('Re-scan stale pages to maintain freshness.');

    return {
        readinessScore: Math.min(100, readiness),
        breakdown,
        suggestions,
        riskLevel: coverage?.riskLevel || 'HIGH'
    };
}

module.exports = { categorizePages, calculateCoverage, getLaunchReadiness };
