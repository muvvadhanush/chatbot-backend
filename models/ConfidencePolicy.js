const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ConfidencePolicy = sequelize.define("ConfidencePolicy", {
    connectionId: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false
    },
    minAnswerConfidence: {
        type: DataTypes.FLOAT,
        defaultValue: 0.65,
        comment: "Minimum confidence score to pass answer through"
    },
    minSourceCount: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        comment: "Minimum number of knowledge sources required"
    },
    lowConfidenceAction: {
        type: DataTypes.ENUM('REFUSE', 'CLARIFY', 'ESCALATE', 'SOFT_ANSWER'),
        defaultValue: 'SOFT_ANSWER',
        comment: "Action when confidence is below threshold"
    }
});

module.exports = ConfidencePolicy;
