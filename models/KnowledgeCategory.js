const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const KnowledgeCategory = sequelize.define("KnowledgeCategory", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    connectionId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    category: {
        type: DataTypes.ENUM(
            'PRICING', 'SUPPORT', 'ABOUT', 'LEGAL',
            'FAQ', 'BLOG', 'PRODUCT', 'OTHER'
        ),
        allowNull: false
    },
    pageCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    confidence: {
        type: DataTypes.FLOAT,
        defaultValue: 0.0
    }
}, {
    indexes: [
        {
            unique: true,
            fields: ['connectionId', 'category']
        }
    ]
});

module.exports = KnowledgeCategory;
