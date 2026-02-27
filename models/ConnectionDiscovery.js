const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ConnectionDiscovery = sequelize.define('ConnectionDiscovery', {
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
        type: DataTypes.ENUM('SITEMAP', 'ROBOTS', 'CRAWLER'),
        allowNull: false
    },
    discoveredUrl: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    depth: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    status: {
        type: DataTypes.ENUM('DISCOVERED', 'FILTERED', 'INDEXED', 'APPROVED', 'FAILED'),
        defaultValue: 'DISCOVERED'
    },
    httpStatus: {
        type: DataTypes.INTEGER
    },
    contentType: {
        type: DataTypes.STRING
    }
}, {
    indexes: [
        {
            unique: true,
            fields: ['connectionId', 'discoveredUrl']
        }
    ]
});

module.exports = ConnectionDiscovery;
