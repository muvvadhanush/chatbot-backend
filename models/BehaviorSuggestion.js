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
    suggestedField: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: "BehaviorConfig field to change: salesIntensity, responseLength, tone, role"
    },
    currentValue: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    recommendedValue: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    reason: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    confidence: {
        type: DataTypes.FLOAT,
        defaultValue: 0.7
    },
    status: {
        type: DataTypes.ENUM('PENDING', 'ACCEPTED', 'REJECTED'),
        defaultValue: 'PENDING'
    }
});

module.exports = BehaviorSuggestion;
