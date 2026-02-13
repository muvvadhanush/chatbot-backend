const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ConnectionBrandProfile = sequelize.define("ConnectionBrandProfile", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    connectionId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true // One profile per connection
    },
    industry: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    tone: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    audience: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    salesIntensityScore: {
        type: DataTypes.FLOAT,
        defaultValue: 0.5
    },
    complexityScore: {
        type: DataTypes.FLOAT,
        defaultValue: 0.5
    },
    emotionalTone: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    primaryGoal: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    confidence: {
        type: DataTypes.FLOAT,
        defaultValue: 0.0
    },
    detectedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    source: {
        type: DataTypes.ENUM('AUTO', 'MANUAL'),
        defaultValue: 'AUTO'
    },
    profileHash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: "SHA256 of key profile fields for drift comparison"
    },
    sourceContentHash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: "Aggregate SHA256 of all approved page content hashes"
    }
});

module.exports = ConnectionBrandProfile;
