const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const MissedQuestion = sequelize.define('MissedQuestion', {
    connectionId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    question: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    confidenceScore: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    contextUsed: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('PENDING', 'RESOLVED'),
        defaultValue: 'PENDING'
    }
});

module.exports = MissedQuestion;
