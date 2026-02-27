const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ManualUpload = sequelize.define("ManualUpload", {
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
    rawText: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    cleanText: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    contentHash: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('PROCESSED', 'FAILED'),
        defaultValue: 'PROCESSED'
    }
}, {
    indexes: [
        { fields: ['connectionId'] }
    ]
});

module.exports = ManualUpload;
