const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const BehaviorSuggestion = sequelize.define("BehaviorSuggestion", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    connectionId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    documentId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'FK to BehaviorDocument'
    },
    suggestedTone: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Professional, Friendly, Casual, Technical, Sales-Oriented'
    },
    suggestedSalesIntensity: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Low, Medium, High'
    },
    suggestedResponseLength: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Short, Medium, Long'
    },
    suggestedEmpathyLevel: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Low, Medium, High'
    },
    suggestedComplianceStrictness: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Relaxed, Standard, Strict'
    },
    reasoning: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'AI explanation of why these values were suggested'
    },
    confidenceScore: {
        type: DataTypes.FLOAT,
        defaultValue: 0.0,
        comment: '0.0–1.0 overall confidence'
    },
    diff: {
        type: DataTypes.JSONB,
        defaultValue: {},
        comment: '{ field: { from, to } } change delta vs current profile'
    },
    status: {
        type: DataTypes.ENUM('PENDING', 'ACCEPTED', 'REJECTED'),
        defaultValue: 'PENDING'
    },
    reviewedBy: {
        type: DataTypes.STRING,
        allowNull: true
    },
    reviewedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    reviewNotes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    indexes: [
        { fields: ['connectionId'] },
        { fields: ['documentId'] },
        { fields: ['status'] }
    ]
});

module.exports = BehaviorSuggestion;
