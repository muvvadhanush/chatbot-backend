const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const BehaviorMetrics = sequelize.define("BehaviorMetrics", {
    connectionId: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false
    },
    totalConversations: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    lowConfidenceAnswers: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    policyViolations: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    avgConfidence: {
        type: DataTypes.FLOAT,
        defaultValue: 0.0
    },
    avgResponseLength: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    salesConversionEvents: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    negativeFeedbackCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    positiveFeedbackCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    lastUpdated: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

module.exports = BehaviorMetrics;
