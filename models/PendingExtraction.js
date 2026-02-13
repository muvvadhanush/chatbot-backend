const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const PendingExtraction = sequelize.define("PendingExtraction", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    connectionId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    sourceType: {
        type: DataTypes.ENUM('AUTO', 'MANUAL', 'DRIFT'),
        defaultValue: 'AUTO'
    },
    contentType: {
        type: DataTypes.ENUM('PAGE', 'PDF', 'DOCX', 'TEXT', 'NAVIGATION'),
        defaultValue: 'PAGE'
    },
    pageContentId: {
        type: DataTypes.UUID,
        allowNull: true
    },
    // Legacy support removed to avoid Sequelize conflicts
    // source: {
    //    type: DataTypes.ENUM('WIDGET', 'MANUAL'),
    //    defaultValue: 'WIDGET'
    // },
    extractorType: {
        type: DataTypes.ENUM('BRANDING', 'KNOWLEDGE', 'FORM', 'METADATA', 'NAVIGATION', 'DRIFT'),
        allowNull: false
    },
    rawData: {
        type: DataTypes.JSONB,
        allowNull: false
    },
    pageUrl: {
        type: DataTypes.STRING,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
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
    },
    // Phase 2: Explainability
    triggerQueries: {
        type: DataTypes.JSONB,
        comment: "Queries that triggered this extraction suggestion",
        defaultValue: []
    },
    relevanceScore: {
        type: DataTypes.FLOAT,
        defaultValue: 0.0
    }
}, {
    indexes: [
        { fields: ['connectionId'] },
        { fields: ['status'] }
    ]
});

module.exports = PendingExtraction;
