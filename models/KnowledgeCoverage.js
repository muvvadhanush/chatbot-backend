const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const KnowledgeCoverage = sequelize.define("KnowledgeCoverage", {
    connectionId: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false
    },
    totalDiscoveredPages: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    approvedPages: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    indexedPages: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    coverageScore: {
        type: DataTypes.FLOAT,
        defaultValue: 0.0,
        comment: "Weighted coverage: (critical*2 + normal) / (critDisc*2 + normDisc)"
    },
    criticalCoverageScore: {
        type: DataTypes.FLOAT,
        defaultValue: 0.0,
        comment: "approvedCriticalCategories / requiredCriticalCategories"
    },
    riskLevel: {
        type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
        defaultValue: 'HIGH'
    },
    lastCalculatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

module.exports = KnowledgeCoverage;
