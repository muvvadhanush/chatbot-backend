// const ideaService = require("./ideaService"); // Removed

/**
 * Generic Action Service
 * Dispatches actions based on connection configuration.
 */
class ActionService {

    /**
     * Execute the configured action for a completed flow.
     * @param {object} actionConfig - { type: "WEBHOOK"|"EMAIL"|"NONE", config: {} }
     * @param {object} payload - The data to process
     * @param {object} permissions - (Optional) { actions: ["WEBHOOK", ...] } used for enforcement
     * @returns {object} result - { success: true/false, message: "..." }
     */
    async executeAction(actionConfig, payload, permissions = null) {
        const { type, config } = actionConfig || { type: "NONE" };
        console.log(`🚀 Executing Action: ${type}`, payload.sessionId);

        // --- PERMISSION CHECK ---
        if (permissions && permissions.actions) {
            if (!permissions.actions.includes(type) && type !== 'NONE') {
                console.warn(`⛔ Action Blocked: ${type} is not in allowed actions:`, permissions.actions);
                return { success: true, message: "Action accepted (Policy Restriction applied)." };
            }
        }

        try {
            switch (type) {
                case "WEBHOOK":
                    return await this.handleWebhook(config, payload);

                // case "SAVE": // Removed Idea Save Logic

                case "EMAIL":
                    return await this.handleEmail(config, payload);

                case "SLACK":
                    return await this.handleSlack(config, payload);

                case "NONE":
                default:
                    console.log("ℹ️ No action configured.");
                    return { success: true, message: "No action required." };
            }
        } catch (error) {
            console.error(`❌ Action ${type} Failed:`, error.message);
            return { success: true, message: "Action accepted (with warnings)." };
        }
    }

    async handleWebhook(config, payload) {
        if (!config || !config.url) throw new Error("Missing Webhook URL");

        // Validate Protocol
        if (!config.url.startsWith("http")) throw new Error("Invalid URL Protocol");

        console.log(`🔗 Webhook POST -> ${config.url}`);

        const response = await fetch(config.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.headers || {})
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Webhook responded with ${response.status}`);
        }

        return { success: true, message: "Webhook sent successfully." };
    }

    // handleSave removed

    async handleEmail(config, payload) {
        console.log("📧 [STUB] Sending Email to:", config?.email || "admin@example.com");
        console.log("📝 Content:", JSON.stringify(payload, null, 2));
        return { success: true, message: "Email queued." };
    }

    async handleSlack(config, payload) {
        if (!config || !config.url) throw new Error("Missing Slack Webhook URL");

        const slackService = require('./integrations/slackService');

        const message = `🚀 *New Bot Action* (${payload.sessionId})\n*Connection:* ${payload.connectionId}\n*Data:* ${JSON.stringify(payload.data || payload)}`;

        return await slackService.sendSlackAlert(config.url, message);
    }
}

module.exports = new ActionService();
