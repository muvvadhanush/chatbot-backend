const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Connection = sequelize.define("Connection", {
  connectionId: {
    type: DataTypes.STRING,
    // unique: true, -- Removed to fix ER_TOO_MANY_KEYS
    allowNull: false
  },

  connectionSecret: {
    type: DataTypes.STRING,
    allowNull: true // Transition to passwordHash
  },

  websiteName: DataTypes.STRING,
  websiteUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  websiteDescription: DataTypes.TEXT,
  logoUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: "Extracted or uploaded branding logo URL"
  },

  // Branding (Phase 10)
  faviconPath: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: "Local path to favicon icon"
  },
  logoPath: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: "Local path to branding logo"
  },
  brandingStatus: {
    type: DataTypes.ENUM('PENDING', 'READY', 'PARTIAL', 'FAILED'),
    defaultValue: 'PENDING'
  },

  assistantName: {
    type: DataTypes.STRING,
    defaultValue: "AI Assistant"
  },

  tone: {
    type: DataTypes.STRING,
    defaultValue: "professional"
  },

  // 👇 IMPORTANT FOR SECURITY
  allowedDomains: {
    type: DataTypes.JSON, // ["http://localhost:3000", "https://mydomain.com"]
    allowNull: true
  },

  theme: {
    type: DataTypes.JSON,
    defaultValue: {
      primary: "#4f46e5",
      background: "#ffffff",
      text: "#111111"
    }
  },

  // Universal AI Assistant fields
  systemPrompt: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "Custom AI instructions for this website"
  },

  knowledgeBase: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "FAQs, product info, company details for AI context"
  },

  extractedTools: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: "Tools automatically discovered from the website (forms, navigation)"
  },

  welcomeMessage: {
    type: DataTypes.STRING,
    defaultValue: "Hi! How can I help you today?"
  },

  capabilities: {
    type: DataTypes.JSON,
    defaultValue: ["general"],
    comment: "e.g. ['support', 'sales', 'booking']"
  },

  // Phase 5: Generic Action Configuration
  actionConfig: {
    type: DataTypes.JSON,
    defaultValue: {
      type: "SAVE",
      config: { target: "ideas_table" }
    },
    comment: "Defines what happens after flow completion: { type: 'WEBHOOK'|'SAVE'|'EMAIL'|'NONE', config: {} }"
  },

  // Phase 6: Granular Permissions
  permissions: {
    type: DataTypes.JSON, // { modes: [], actions: [], aiEnabled: true }
    defaultValue: {
      modes: ["FREE_CHAT"], // Default: No Guided Flow
      actions: ["SAVE"],    // Default: Save only
      aiEnabled: true
    },
    comment: "Explicitly allowed modes and actions"
  },

  // Step 1: Website Behavior Engine
  behaviorProfile: {
    type: DataTypes.JSON,
    defaultValue: {
      assistantRole: "support_agent",
      tone: "neutral",
      responseLength: "medium",
      salesIntensity: 0.0,
      empathyLevel: 0.5,
      primaryGoal: "support",
      hardConstraints: {
        never_claim: [],
        escalation_path: "human_support"
      }
    },
    comment: "Controls how the bot thinks and responds globally"
  },

  behaviorOverrides: {
    type: DataTypes.JSON,
    defaultValue: [], // Array of { match: "/path", overrides: {} }
    comment: "Page-level rules that override the global behavior profile"
  },
  // --- Phase 1: Secure Handshake & Extraction ---
  passwordHash: {
    type: DataTypes.STRING,
    allowNull: true, // Transitioning existing connections
  },

  status: {
    type: DataTypes.ENUM('CREATED', 'CONNECTED', 'EXTRACTION_REQUESTED', 'READY', 'FAILED'),
    defaultValue: 'CREATED'
  },

  widgetSeen: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },

  extractionEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },

  allowedExtractors: {
    type: DataTypes.JSON, // ["branding", "knowledge", "forms"]
    defaultValue: []
  },

  extractionToken: {
    type: DataTypes.STRING,
    allowNull: true
  },

  extractionTokenExpires: {
    type: DataTypes.DATE,
    allowNull: true
  },

  // Phase 3.3: Policy-Driven AI
  policies: {
    type: DataTypes.JSON,
    defaultValue: [] // Array of policy strings
  }
});

module.exports = Connection;
