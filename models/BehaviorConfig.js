const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const BehaviorConfig = sequelize.define("BehaviorConfig", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    connectionId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    role: {
        type: DataTypes.STRING(100),
        defaultValue: 'Support Assistant'
    },
    tone: {
        type: DataTypes.STRING(50),
        defaultValue: 'Neutral'
    },
    salesIntensity: {
        type: DataTypes.FLOAT,
        defaultValue: 0.5
    },
    responseLength: {
        type: DataTypes.ENUM('SHORT', 'MEDIUM', 'LONG'),
        defaultValue: 'MEDIUM'
    },
    source: {
        type: DataTypes.ENUM('AUTO', 'MANUAL'),
        defaultValue: 'AUTO'
    }
});

module.exports = BehaviorConfig;
