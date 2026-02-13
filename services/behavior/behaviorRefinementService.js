const ChatSession = require('../../models/ChatSession');
const BehaviorMetrics = require('../../models/BehaviorMetrics');
const BehaviorSuggestion = require('../../models/BehaviorSuggestion');
const BehaviorConfig = require('../../models/BehaviorConfig');
const ConnectionBrandProfile = require('../../models/ConnectionBrandProfile');

// Sales CTA patterns for detection
const SALES_CTA_PATTERNS = [
    'buy now', 'sign up', 'get started', 'free trial', 'book a demo',
    'schedule a call', 'contact sales', 'pricing', 'upgrade', 'subscribe',
    'limited time', 'special offer', 'discount', 'act now'
];

/**
 * STEP 1: Collect & Aggregate Metrics from ChatSession messages
 */
async function collectMetrics(connectionId) {
    console.log(`[BEHAVIOR] Collecting metrics for ${connectionId}`);

    const sessions = await ChatSession.findAll({ where: { connectionId } });

    let totalConversations = sessions.length;
    let totalAssistantMsgs = 0;
    let lowConfidenceAnswers = 0;
    let totalConfidence = 0;
    let confidenceCount = 0;
    let totalResponseLength = 0;
    let salesConversionEvents = 0;
    let negativeFeedbackCount = 0;
    let positiveFeedbackCount = 0;
    let policyViolations = 0;

    for (const session of sessions) {
        let messages = session.messages || [];
        if (typeof messages === 'string') {
            try { messages = JSON.parse(messages); } catch { messages = []; }
        }

        for (const msg of messages) {
            if (msg.role !== 'assistant') continue;
            totalAssistantMsgs++;

            // Response length (word count)
            const wordCount = (msg.text || '').split(/\s+/).filter(w => w).length;
            totalResponseLength += wordCount;

            // Confidence from ai_metadata
            if (msg.ai_metadata) {
                const sources = msg.ai_metadata.sources || [];
                for (const src of sources) {
                    if (src.confidenceScore !== undefined) {
                        totalConfidence += src.confidenceScore;
                        confidenceCount++;
                        if (src.confidenceScore < 0.6) {
                            lowConfidenceAnswers++;
                        }
                    }
                }
                // Aggregate confidence if stored directly
                if (msg.ai_metadata.confidenceScore !== undefined) {
                    totalConfidence += msg.ai_metadata.confidenceScore;
                    confidenceCount++;
                    if (msg.ai_metadata.confidenceScore < 0.6) {
                        lowConfidenceAnswers++;
                    }
                }
            }

            // Sales trigger detection
            const textLower = (msg.text || '').toLowerCase();
            if (SALES_CTA_PATTERNS.some(p => textLower.includes(p))) {
                salesConversionEvents++;
            }

            // Feedback
            if (msg.feedback) {
                if (msg.feedback.rating === 'CORRECT') positiveFeedbackCount++;
                if (msg.feedback.rating === 'INCORRECT') negativeFeedbackCount++;
            }
        }
    }

    const avgConfidence = confidenceCount > 0
        ? Math.round((totalConfidence / confidenceCount) * 100) / 100
        : 0.5;

    const avgResponseLength = totalAssistantMsgs > 0
        ? Math.round(totalResponseLength / totalAssistantMsgs)
        : 0;

    const metrics = {
        connectionId,
        totalConversations,
        lowConfidenceAnswers,
        policyViolations,
        avgConfidence,
        avgResponseLength,
        salesConversionEvents,
        negativeFeedbackCount,
        positiveFeedbackCount,
        lastUpdated: new Date()
    };

    await BehaviorMetrics.upsert(metrics);
    console.log(`[BEHAVIOR] Metrics: confidence=${avgConfidence}, avgLen=${avgResponseLength}, lowConf=${lowConfidenceAnswers}, negFeedback=${negativeFeedbackCount}`);

    return metrics;
}

/**
 * STEP 2: Detect Behaviour Drift (Deterministic Rule Engine)
 */
async function detectDrift(connectionId) {
    console.log(`[BEHAVIOR] Detecting drift for ${connectionId}`);

    const metrics = await BehaviorMetrics.findOne({ where: { connectionId } });
    if (!metrics || metrics.totalConversations < 3) {
        console.log('[BEHAVIOR] Insufficient data for drift detection');
        return [];
    }

    const config = await BehaviorConfig.findOne({ where: { connectionId } });
    if (!config) {
        console.log('[BEHAVIOR] No BehaviorConfig found');
        return [];
    }

    // Get brand profile for context
    const brand = await ConnectionBrandProfile.findOne({ where: { connectionId } });

    const suggestions = [];

    // Clear old PENDING suggestions before generating new ones
    await BehaviorSuggestion.destroy({
        where: { connectionId, status: 'PENDING' }
    });

    const totalFeedback = metrics.positiveFeedbackCount + metrics.negativeFeedbackCount;
    const negativeRatio = totalFeedback > 0 ? metrics.negativeFeedbackCount / totalFeedback : 0;

    // --- RULE 1: Too Aggressive ---
    if (config.salesIntensity > 0.7 && (negativeRatio > 0.3 || metrics.lowConfidenceAnswers > 10)) {
        suggestions.push({
            connectionId,
            suggestedField: 'salesIntensity',
            currentValue: String(config.salesIntensity),
            recommendedValue: String(Math.max(0.3, config.salesIntensity - 0.3)),
            reason: `High negative feedback ratio (${(negativeRatio * 100).toFixed(0)}%) with aggressive sales intensity. Reducing intensity may improve user satisfaction.`,
            confidence: 0.85
        });
    }

    // --- RULE 2: Too Short ---
    if (metrics.avgResponseLength < 50 && config.responseLength !== 'LONG') {
        suggestions.push({
            connectionId,
            suggestedField: 'responseLength',
            currentValue: config.responseLength,
            recommendedValue: 'LONG',
            reason: `Average response length is only ${metrics.avgResponseLength} words. Longer responses may provide more value to users.`,
            confidence: 0.75
        });
    }

    // --- RULE 3: Too Long ---
    if (metrics.avgResponseLength > 300 && config.responseLength !== 'SHORT') {
        suggestions.push({
            connectionId,
            suggestedField: 'responseLength',
            currentValue: config.responseLength,
            recommendedValue: 'SHORT',
            reason: `Average response length is ${metrics.avgResponseLength} words. Shorter, more focused responses may improve engagement.`,
            confidence: 0.7
        });
    }

    // --- RULE 4: Low Confidence ---
    if (metrics.avgConfidence < 0.6 && config.responseLength !== 'LONG') {
        suggestions.push({
            connectionId,
            suggestedField: 'responseLength',
            currentValue: config.responseLength,
            recommendedValue: 'LONG',
            reason: `Average confidence is low (${(metrics.avgConfidence * 100).toFixed(0)}%). Longer responses allow more context and improve accuracy.`,
            confidence: 0.8
        });
    }

    // --- RULE 5: Underperforming Sales ---
    if (brand && brand.primaryGoal &&
        brand.primaryGoal.toLowerCase().includes('lead') &&
        config.salesIntensity < 0.3 &&
        metrics.salesConversionEvents === 0) {
        suggestions.push({
            connectionId,
            suggestedField: 'salesIntensity',
            currentValue: String(config.salesIntensity),
            recommendedValue: '0.7',
            reason: `Brand goal is lead generation but sales intensity is low (${(config.salesIntensity * 100).toFixed(0)}%) with zero CTA triggers. Increasing may drive conversions.`,
            confidence: 0.8
        });
    }

    // Save suggestions
    for (const sug of suggestions) {
        await BehaviorSuggestion.create(sug);
    }

    console.log(`[BEHAVIOR] Generated ${suggestions.length} suggestions`);
    return suggestions;
}

/**
 * STEP 3: Apply a suggestion (admin approved)
 */
async function applySuggestion(suggestionId) {
    const suggestion = await BehaviorSuggestion.findOne({ where: { id: suggestionId } });
    if (!suggestion) throw new Error('Suggestion not found');
    if (suggestion.status !== 'PENDING') throw new Error('Suggestion already processed');

    // Update BehaviorConfig
    const config = await BehaviorConfig.findOne({ where: { connectionId: suggestion.connectionId } });
    if (!config) throw new Error('BehaviorConfig not found');

    const field = suggestion.suggestedField;
    let value = suggestion.recommendedValue;

    // Type coercion for numeric fields
    if (field === 'salesIntensity') {
        value = parseFloat(value);
    }

    config[field] = value;
    config.source = 'AUTO'; // Mark as auto-adjusted
    await config.save();

    // Mark suggestion as accepted
    suggestion.status = 'ACCEPTED';
    await suggestion.save();

    console.log(`[BEHAVIOR] Applied suggestion: ${field} → ${value}`);
    return { field, value, connectionId: suggestion.connectionId };
}

/**
 * STEP 4: Reject a suggestion
 */
async function rejectSuggestion(suggestionId) {
    const suggestion = await BehaviorSuggestion.findOne({ where: { id: suggestionId } });
    if (!suggestion) throw new Error('Suggestion not found');
    if (suggestion.status !== 'PENDING') throw new Error('Suggestion already processed');

    suggestion.status = 'REJECTED';
    await suggestion.save();

    console.log(`[BEHAVIOR] Rejected suggestion: ${suggestion.suggestedField}`);
    return { id: suggestionId, status: 'REJECTED' };
}

module.exports = { collectMetrics, detectDrift, applySuggestion, rejectSuggestion };
