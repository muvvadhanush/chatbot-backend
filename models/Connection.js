const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Connection = sequelize.define("Connection", {

  connectionId: {
    type: DataTypes.STRING,
    primaryKey: true
  },

  // Store ONLY hash
  connectionSecretHash: {
    type: DataTypes.STRING,
    allowNull: true
  },

  websiteName: DataTypes.STRING,

  websiteUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },

  websiteDescription: DataTypes.TEXT,

  logoUrl: DataTypes.STRING,

  faviconPath: DataTypes.STRING,
  logoPath: DataTypes.STRING,

  brandingStatus: {
    type: DataTypes.ENUM('PENDING', 'READY', 'PARTIAL', 'FAILED'),
    defaultValue: 'PENDING'
  },

  assistantName: {
    type: DataTypes.STRING,
    defaultValue: "AI Assistant"
  },

  responseLength: {
    type: DataTypes.STRING,
    defaultValue: "medium"
  },

  temperature: {
    type: DataTypes.FLOAT,
    defaultValue: 0.3
  },

  allowedDomains: {
    type: DataTypes.JSONB,
    defaultValue: []
  },

  theme: {
    type: DataTypes.JSONB,
    defaultValue: {
      primary: "#4f46e5",
      background: "#ffffff",
      text: "#111111"
    }
  },

  systemPrompt: DataTypes.TEXT,

  extractedTools: {
    type: DataTypes.JSONB,
    defaultValue: []
  },

  welcomeMessage: {
    type: DataTypes.STRING,
    defaultValue: "Hi! How can I help you today?"
  },

  capabilities: {
    type: DataTypes.JSONB,
    defaultValue: ["general"]
  },

  actionConfig: {
    type: DataTypes.JSONB,
    defaultValue: { type: "SAVE", config: {} }
  },

  permissions: {
    type: DataTypes.JSONB,
    defaultValue: {
      modes: ["FREE_CHAT"],
      actions: ["SAVE"],
      aiEnabled: true
    }
  },

  behaviorProfile: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },

  behaviorOverrides: {
    type: DataTypes.JSONB,
    defaultValue: []
  },

  passwordHash: {
    type: DataTypes.STRING,
    allowNull: true
  },

  status: {
    type: DataTypes.ENUM('DRAFT', 'CONNECTED', 'DISCOVERING', 'TRAINED', 'TUNED', 'READY', 'LAUNCHED'),
    defaultValue: 'DRAFT'
  },

  onboardingStep: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    comment: 'Current wizard step (1-6)'
  },

  onboardingCompletedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when onboarding reached LAUNCHED'
  },

  version: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Optimistic locking counter for race condition safety'
  },

  stateLockedBy: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Job name holding the state lock (e.g. discovery:job-abc)'
  },

  stateLockedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When the state lock was acquired'
  },

  extractionEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },

  policies: {
    type: DataTypes.JSONB,
    defaultValue: []
  },

  widgetConfig: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },

  healthScore: {
    type: DataTypes.FLOAT,
    defaultValue: 100.0
  },

  driftCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },

  confidenceGateStatus: {
    type: DataTypes.ENUM('ACTIVE', 'WARNING', 'FAILED'),
    defaultValue: 'ACTIVE'
  },

  lastActivityAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },

  launchStatus: {
    type: DataTypes.ENUM('DRAFT', 'LAUNCHED'),
    defaultValue: 'DRAFT'
  },

  onboardingMeta: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Stores per-step metadata like discoveryState, training stats'
  }

}, {
  indexes: [
    { unique: true, fields: ['connectionId'] },
    { fields: ['status'] },
    { fields: ['launchStatus'] },
    { fields: ['lastActivityAt'] }
  ]
});

module.exports = Connection;
