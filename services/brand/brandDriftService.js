const crypto = require('crypto');
const PageContent = require('../../models/PageContent');
const ConnectionBrandProfile = require('../../models/ConnectionBrandProfile');
const BrandDriftLog = require('../../models/BrandDriftLog');
const BehaviorSuggestion = require('../../models/BehaviorSuggestion');
const { detectBrandProfile } = require('./brandDetectionService');

/**
 * Step 1: Compute aggregate content hash from all approved page content hashes
 */
async function computeAggregateContentHash(connectionId) {
    const pages = await PageContent.findAll({
        where: { connectionId, status: 'FETCHED' },
        attributes: ['contentHash'],
        order: [['url', 'ASC']] // Deterministic ordering
    });

    if (pages.length === 0) return null;

    const combined = pages.map(p => p.contentHash).filter(Boolean).sort().join('|');
    return crypto.createHash('sha256').update(combined).digest('hex');
}

/**
 * Compute profile hash from key brand fields
 */
function computeProfileHash(profile) {
    const key = [
        profile.industry || '',
        profile.tone || '',
        profile.audience || '',
        profile.primaryGoal || '',
        String(profile.salesIntensityScore || 0)
    ].join('|');
    return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Step 2-4: Check for brand drift
 * - Compares current content hash with stored hash
 * - If changed, compares profile fields and calculates drift score
 */
async function checkBrandDrift(connectionId) {
    console.log(`[BRAND-DRIFT] Checking drift for ${connectionId}`);

    const profile = await ConnectionBrandProfile.findOne({ where: { connectionId } });
    if (!profile) {
        console.log('[BRAND-DRIFT] No brand profile found — skipping');
        return { drifted: false, reason: 'No brand profile exists' };
    }

    // Step 1: Compute current aggregate content hash
    const currentContentHash = await computeAggregateContentHash(connectionId);
    if (!currentContentHash) {
        return { drifted: false, reason: 'No page content available' };
    }

    // Quick check: if content hasn't changed, no drift possible
    if (profile.sourceContentHash && profile.sourceContentHash === currentContentHash) {
        console.log('[BRAND-DRIFT] Content hash unchanged — no drift');
        return { drifted: false, reason: 'Content unchanged' };
    }

    console.log('[BRAND-DRIFT] Content hash changed — running brand comparison');

    // Store the old profile values
    const oldProfile = {
        industry: profile.industry,
        tone: profile.tone,
        audience: profile.audience,
        primaryGoal: profile.primaryGoal,
        salesIntensityScore: profile.salesIntensityScore
    };
    const oldProfileHash = computeProfileHash(oldProfile);

    // Re-run brand detection (this will update the profile)
    let newAnalysis;
    try {
        newAnalysis = await detectBrandProfile(connectionId, 'AUTO');
    } catch (err) {
        console.error('[BRAND-DRIFT] Re-detection failed:', err.message);
        // Still record the content hash change
        await profile.update({ sourceContentHash: currentContentHash });
        return { drifted: false, reason: 'Re-detection failed: ' + err.message };
    }

    // Reload the updated profile
    const newProfile = await ConnectionBrandProfile.findOne({ where: { connectionId } });

    // Step 3: Compare fields and calculate drift score
    const driftDetails = [];
    let driftScore = 0;

    // Industry change (+0.4)
    if (oldProfile.industry && newProfile.industry &&
        oldProfile.industry.toLowerCase() !== newProfile.industry.toLowerCase()) {
        driftScore += 0.4;
        driftDetails.push({
            field: 'industry',
            oldValue: oldProfile.industry,
            newValue: newProfile.industry,
            weight: 0.4
        });
    }

    // Tone change (+0.3)
    if (oldProfile.tone && newProfile.tone &&
        oldProfile.tone.toLowerCase() !== newProfile.tone.toLowerCase()) {
        driftScore += 0.3;
        driftDetails.push({
            field: 'tone',
            oldValue: oldProfile.tone,
            newValue: newProfile.tone,
            weight: 0.3
        });
    }

    // Primary Goal change (+0.3)
    if (oldProfile.primaryGoal && newProfile.primaryGoal &&
        oldProfile.primaryGoal.toLowerCase() !== newProfile.primaryGoal.toLowerCase()) {
        driftScore += 0.3;
        driftDetails.push({
            field: 'primaryGoal',
            oldValue: oldProfile.primaryGoal,
            newValue: newProfile.primaryGoal,
            weight: 0.3
        });
    }

    // Sales Intensity shift > 0.2 (+0.2)
    const salesDiff = Math.abs((newProfile.salesIntensityScore || 0) - (oldProfile.salesIntensityScore || 0));
    if (salesDiff > 0.2) {
        driftScore += 0.2;
        driftDetails.push({
            field: 'salesIntensity',
            oldValue: String(oldProfile.salesIntensityScore),
            newValue: String(newProfile.salesIntensityScore),
            weight: 0.2
        });
    }

    // Determine severity
    let severity = 'LOW';
    if (driftScore > 0.5) severity = 'HIGH';
    else if (driftScore > 0.2) severity = 'MEDIUM';

    driftScore = Math.round(driftScore * 100) / 100;

    // Update profile with new hashes
    const newProfileHash = computeProfileHash(newProfile);
    await newProfile.update({
        profileHash: newProfileHash,
        sourceContentHash: currentContentHash
    });

    // Only log drift if something actually changed
    if (driftScore > 0) {
        const driftLog = await BrandDriftLog.create({
            connectionId,
            previousProfileHash: oldProfileHash,
            currentContentHash,
            driftScore,
            severity,
            driftDetails,
            status: 'PENDING'
        });

        // Create BehaviorSuggestion for admin notification
        const changedFields = driftDetails.map(d => d.field).join(', ');
        await BehaviorSuggestion.create({
            connectionId,
            suggestedField: 'brand_reanalysis',
            currentValue: changedFields,
            recommendedValue: 'Re-run brand analysis',
            reason: `Brand drift detected (score: ${driftScore}, severity: ${severity}). Changed: ${driftDetails.map(d => `${d.field}: ${d.oldValue} → ${d.newValue}`).join('; ')}`,
            confidence: Math.min(driftScore + 0.3, 1.0),
            status: 'PENDING'
        });

        console.log(`[BRAND-DRIFT] Drift detected! Score=${driftScore}, Severity=${severity}`);
        return { drifted: true, driftScore, severity, driftDetails, driftLogId: driftLog.id };
    }

    console.log('[BRAND-DRIFT] Profile unchanged after re-analysis');
    return { drifted: false, reason: 'Content changed but brand profile unchanged' };
}

/**
 * Step 5: Confirm drift (admin acknowledged)
 */
async function confirmDrift(driftId) {
    const log = await BrandDriftLog.findOne({ where: { id: driftId } });
    if (!log) throw new Error('Drift log not found');
    log.status = 'CONFIRMED';
    await log.save();
    return log;
}

/**
 * Ignore drift (admin dismissed)
 */
async function ignoreDrift(driftId) {
    const log = await BrandDriftLog.findOne({ where: { id: driftId } });
    if (!log) throw new Error('Drift log not found');
    log.status = 'IGNORED';
    await log.save();
    return log;
}

module.exports = { computeAggregateContentHash, computeProfileHash, checkBrandDrift, confirmDrift, ignoreDrift };
