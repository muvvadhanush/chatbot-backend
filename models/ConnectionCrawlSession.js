const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ConnectionCrawlSession = sequelize.define('ConnectionCrawlSession', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    connectionId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    method: {
        type: DataTypes.ENUM('SITEMAP', 'CRAWLER'),
        allowNull: false
    },
    totalUrls: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    validUrls: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    filteredUrls: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    status: {
        type: DataTypes.ENUM('RUNNING', 'COMPLETED', 'FAILED'),
        defaultValue: 'RUNNING'
    }
});

module.exports = ConnectionCrawlSession;
