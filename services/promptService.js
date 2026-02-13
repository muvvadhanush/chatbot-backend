const ConnectionBrandProfile = require("../models/ConnectionBrandProfile");
const BehaviorConfig = require("../models/BehaviorConfig");

/**
 * The Brain Stem of the Behavior Engine.
 * Follows a strict order of assembly:
 * 1. System Rules
 * 2. Policies (Dynamic Constraints)
 * 3. Brand Profile (Context)
 * 4. Behavior Config (Active Settings)
 * 5. Page Overrides
 * 6. RAG Memory
 * 7. User Message (Passed to AI)
 */
exports.assemblePrompt = async (connectionId, pageUrl, context) => {
    try {
        const connection = await Connection.findOne({ where: { connectionId } });
        if (!connection) return "You are a helpful assistant.";

        const brandProfile = await ConnectionBrandProfile.findOne({ where: { connectionId } });
        const behaviorConfig = await BehaviorConfig.findOne({ where: { connectionId } });

        // Fallback to legacy profile if BehaviorConfig is missing
        const legacyProfile = connection.behaviorProfile || {};
        const overrides = connection.behaviorOverrides || [];

        // 1. System Rules (Hardcoded Hard Constraints)
        let prompt = "## SYSTEM RULES\n- You are a deterministic assistant.\n- Do not invent facts outside the provided knowledge.\n- Follow the behavior profile strictly.\n";

        if (legacyProfile.hardConstraints?.never_claim?.length > 0) {
            prompt += `- NEVER CLAIM: ${legacyProfile.hardConstraints.never_claim.join(", ")}\n`;
        }
        if (legacyProfile.hardConstraints?.escalation_path) {
            prompt += `- ESCALATION PATH: ${legacyProfile.hardConstraints.escalation_path}\n`;
        }

        // 2. Policies (Dynamic Constraints)
        if (connection.policies && Array.isArray(connection.policies) && connection.policies.length > 0) {
            console.log(`🛡️ [AUDIT] Enforcing ${connection.policies.length} policies for ${connectionId}`);
            prompt += `\n## CRITICAL POLICIES (MUST FOLLOW)\n`;
            connection.policies.forEach((policy, i) => {
                prompt += `${i + 1}. ${policy}\n`;
            });
            prompt += `- If the user asks something that violates these policies, politely refuse.\n`;
        }

        // 3. Brand Profile (Context)
        if (brandProfile) {
            prompt += `\n## BRAND PROFILE (CONTEXT)
- INDUSTRY: ${brandProfile.industry || 'Unknown'}
- TONE: ${brandProfile.tone || 'Neutral'}
- AUDIENCE: ${brandProfile.audience || 'General'}
- PRIMARY GOAL: ${brandProfile.primaryGoal || 'Support'}
- SALES INTENSITY SCORE: ${brandProfile.salesIntensityScore}
`;
        }

        // 4. Behavior Config (Active Settings)
        // detailed instructions on how to act
        const activeBehavior = behaviorConfig || {
            role: legacyProfile.assistantRole || 'Assistant',
            tone: legacyProfile.tone || 'Neutral',
            responseLength: legacyProfile.responseLength || 'Medium',
            salesIntensity: legacyProfile.salesIntensity || 0.0
        };

        prompt += `\n## BEHAVIOR CONFIGURATION (ACTIVE)
- ROLE: ${activeBehavior.role}
- TONE: ${activeBehavior.tone}
- RESPONSE LENGTH: ${activeBehavior.responseLength}
- SALES INTENSITY: ${activeBehavior.salesIntensity} (0.0=none, 1.0=aggressive)
`;

        // 3. Page Overrides (Matched)
        if (pageUrl && overrides.length > 0) {
            const path = new URL(pageUrl).pathname;
            const match = overrides.find(o => path.includes(o.match));

            if (match) {
                prompt += `\n## PAGE-LEVEL OVERRIDES (CONTEXT: ${path})
- APPLY THESE RULES WITH HIGHEST PRIORITY:
`;
                Object.entries(match.overrides || {}).forEach(([key, val]) => {
                    prompt += `- ${key.toUpperCase()}: ${val}\n`;
                });
                if (match.instruction) {
                    prompt += `- SPECIAL INSTRUCTION: ${match.instruction}\n`;
                }
            }
        }

        // 4. RAG Memory (Read Only)
        if (context) {
            prompt += `\n## KNOWLEDGE BASE (CONTEXT)
Use ONLY the information below to answer. If it's not here, follow your primary goal or escalation path.
---
${context}
---
`;
        }

        console.log(`🧠 [DEBUG] ASSEMBLED PROMPT for ${connectionId} (${pageUrl}):\n${prompt}`);

        return prompt;
    } catch (err) {
        console.error("Prompt Assembly Error:", err);
        return "You are a helpful assistant.";
    }
};
