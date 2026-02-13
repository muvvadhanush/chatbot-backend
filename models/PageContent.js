const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const PageContent = sequelize.define("PageContent", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    connectionId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    url: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    rawHtml: {
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
    wordCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    status: {
        type: DataTypes.ENUM('FETCHED', 'FAILED', 'STALE'),
        defaultValue: 'FETCHED'
    },
    category: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "PRICING, SUPPORT, ABOUT, LEGAL, FAQ, BLOG, PRODUCT, OTHER"
    },
    importanceScore: {
        type: DataTypes.FLOAT,
        defaultValue: 0.5,
        comment: "0.0-1.0, critical categories score higher"
    },
    fetchedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    indexes: [
        {
            unique: true,
            fields: ['connectionId', 'url']
        }
    ]
});

module.exports = PageContent;
