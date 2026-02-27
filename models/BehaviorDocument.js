const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const BehaviorDocument = sequelize.define("BehaviorDocument", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    connectionId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    fileName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    fileType: {
        type: DataTypes.ENUM('PDF', 'DOCX', 'TEXT'),
        allowNull: false
    },
    fileSize: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'File size in bytes'
    },
    extractedText: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Cleaned extracted content (max ~1MB)'
    },
    classification: {
        type: DataTypes.ENUM('SALES_GUIDE', 'SUPPORT_SCRIPT', 'BRAND_GUIDELINES', 'COMPLIANCE_POLICY', 'UNKNOWN'),
        defaultValue: 'UNKNOWN'
    },
    classificationConfidence: {
        type: DataTypes.FLOAT,
        defaultValue: 0.0,
        comment: '0.0–1.0 confidence of classification'
    },
    signals: {
        type: DataTypes.JSONB,
        defaultValue: {},
        comment: '{ persuasion, compliance, empathy, authority, verbosity } scores 0-1'
    },
    processingStatus: {
        type: DataTypes.ENUM('PENDING', 'PROCESSING', 'DONE', 'FAILED'),
        defaultValue: 'PENDING'
    },
    errorMessage: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    indexes: [
        { fields: ['connectionId'] },
        { fields: ['processingStatus'] }
    ]
});

module.exports = BehaviorDocument;
