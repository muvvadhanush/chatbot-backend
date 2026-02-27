const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ChatSession = sequelize.define("ChatSession", {

  sessionId: {
    type: DataTypes.STRING,
    allowNull: false
  },

  connectionId: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: "Connections",
      key: "connectionId"
    },
    onDelete: "CASCADE"
  },

  messages: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: []
  },

  currentStep: {
    type: DataTypes.ENUM(
      'NONE',
      'TITLE',
      'DESCRIPTION',
      'IMPACT',
      'CONFIRM',
      'SUBMITTED'
    ),
    defaultValue: 'NONE'
  },

  tempData: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },

  mode: {
    type: DataTypes.ENUM('FREE_CHAT', 'GUIDED_FLOW'),
    defaultValue: 'FREE_CHAT'
  },

  memory: {
    type: DataTypes.JSONB,
    allowNull: true
  },

  lastMessageAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }

}, {
  indexes: [
    {
      unique: true,
      fields: ['sessionId', 'connectionId']
    },
    {
      fields: ['connectionId']
    },
    {
      fields: ['lastMessageAt']
    }
  ]
});

module.exports = ChatSession;
