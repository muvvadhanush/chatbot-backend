const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const BrandDriftLog = sequelize.define("BrandDriftLog", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    connectionId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    previousProfileHash: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    currentContentHash: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    driftScore: {
        type: DataTypes.FLOAT,
        defaultValue: 0.0
    },
    severity: {
        type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH'),
        defaultValue: 'LOW'
    },
    driftDetails: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "Field-level breakdown: {field, oldValue, newValue, weight}"
    },
    status: {
        type: DataTypes.ENUM('PENDING', 'CONFIRMED', 'IGNORED'),
        defaultValue: 'PENDING'
    }
});

module.exports = BrandDriftLog;
