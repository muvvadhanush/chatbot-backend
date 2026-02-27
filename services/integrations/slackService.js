const axios = require('axios');
const logger = require('../../utils/logger');

/**
 * Enhanced Slack Service for Enterprise Notifications
 */
const sendSlackAlert = async (webhookUrl, message) => {
  try {
    if (!webhookUrl) return;

    await axios.post(webhookUrl, {
      text: message
    });

    return { success: true };
  } catch (error) {
    logger.error('Slack Alert Failed', { error: error.message });
    return { success: false, error: error.message };
  }
};

const sendFormattedAlert = async (webhookUrl, blocks) => {
  try {
    if (!webhookUrl) return;

    await axios.post(webhookUrl, {
      blocks: blocks
    });

    return { success: true };
  } catch (error) {
    logger.error('Formatted Slack Alert Failed', { error: error.message });
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendSlackAlert,
  sendFormattedAlert
};
