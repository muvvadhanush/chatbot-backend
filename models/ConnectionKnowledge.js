const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ConnectionKnowledge = sequelize.define("ConnectionKnowledge", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
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

    sourceType: {
        type: DataTypes.ENUM("URL", "TEXT"),
        allowNull: false
    },

    sourceValue: {
        type: DataTypes.TEXT,
        allowNull: false
    },

    rawText: {
        type: DataTypes.TEXT,
        allowNull: true
    },

    cleanedText: {
        type: DataTypes.TEXT,
        allowNull: true
    },

    status: {
        type: DataTypes.ENUM("PENDING", "READY", "FAILED", "REJECTED"),
        defaultValue: "PENDING"
    },

    visibility: {
        type: DataTypes.ENUM("SHADOW", "ACTIVE"),
        defaultValue: "SHADOW"
    },

    confidenceScore: {
        type: DataTypes.FLOAT,
        defaultValue: 0.5
    },

    contentHash: {
        type: DataTypes.STRING,
        allowNull: true
    },

    lastCheckedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },

    metadata: {
        type: DataTypes.JSONB,
        allowNull: true
    },

    // TRUE VECTOR TYPE
    embedding: {
        type: DataTypes.JSON,
        allowNull: true
    }

}, {
    indexes: [
        { fields: ["connectionId"] },
        { fields: ["status"] },
        { fields: ["visibility"] },

        // Composite index for RAG filtering
        {
            fields: ["connectionId", "status"]
        },

        // Prevent duplicate knowledge
        {
            unique: true,
            fields: ["connectionId", "contentHash"]
        }
    ]
});

module.exports = ConnectionKnowledge;
