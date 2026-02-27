const MissedQuestion = require('../models/MissedQuestion');
const logger = require('../utils/logger');

async function detectKnowledgeGap({
  connectionId,
  query,
  similarityScore,
  aiResponse,
  threshold = 0.65,
  slackWebhook = null
}) {

  let gapDetected = false;

  // ... (checks remain same)
  // Threshold check
  if (similarityScore < threshold) {
    gapDetected = true;
  }

  // Explicit refusal check
  const refusalPhrases = ["i'm not sure", "i don't have information", "i don't know"];
  if (refusalPhrases.some(phrase => aiResponse.toLowerCase().includes(phrase))) {
    gapDetected = true;
  }

  if (gapDetected) {
    logger.warn("Knowledge gap detected", { connectionId, query, similarityScore });

    try {
      await MissedQuestion.create({
        connectionId,
        question: query,
        confidenceScore: similarityScore,
        contextUsed: aiResponse,
        status: 'PENDING'
      });

      // Send Slack Alert if webhook provided
      if (slackWebhook) {
        const { sendSlackAlert } = require('./integrations/slackService');
        const alertMsg = `⚠️ *Knowledge Gap Detected*\n*Bot:* ${connectionId}\n*User Query:* ${query}\n*AI Response:* ${aiResponse}\n*Confidence:* ${(similarityScore || 0).toFixed(2)}`;
        await sendSlackAlert(slackWebhook, alertMsg);
      }

    } catch (err) {
      logger.error("Failed to process missed question", { error: err.message, connectionId });
    }
  }

  return gapDetected;
}

module.exports = { detectKnowledgeGap };
