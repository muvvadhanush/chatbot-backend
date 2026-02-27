const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ButtonSet = sequelize.define("ButtonSet", {

    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },

    connectionId: {
        type: DataTypes.STRING,
        allowNull: false,
        references: {
            model: "Connections",
            key: "connectionId"
        },
        onDelete: "CASCADE"
    },

    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'Human-readable name, e.g. "Welcome Buttons"'
    },

    schemaVersion: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        comment: 'Bumped on breaking schema changes for forward-compat'
    },

    buttons: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Array of button objects (max 5)',
        validate: {
            isValidButtons(value) {
                if (!Array.isArray(value)) throw new Error("buttons must be an array");
                if (value.length > 5) throw new Error("Maximum 5 buttons per set");

                const VALID_TYPES = ['SEND_MESSAGE', 'GO_TO_BLOCK', 'OPEN_URL', 'PHONE_CALL', 'POSTBACK'];

                for (const btn of value) {
                    if (!btn.label || typeof btn.label !== 'string') {
                        throw new Error("Each button must have a label string");
                    }
                    if (btn.label.length > 20) {
                        throw new Error(`Button label "${btn.label}" exceeds 20 characters`);
                    }
                    if (!VALID_TYPES.includes(btn.type)) {
                        throw new Error(`Invalid button type: ${btn.type}. Must be one of: ${VALID_TYPES.join(', ')}`);
                    }
                    if (btn.type === 'OPEN_URL' && btn.payload) {
                        try {
                            const url = new URL(btn.payload);
                            if (!['http:', 'https:'].includes(url.protocol)) {
                                throw new Error(`Unsafe URL protocol: ${url.protocol}`);
                            }
                        } catch (urlErr) {
                            if (urlErr.message.includes('protocol')) throw urlErr;
                            throw new Error(`Invalid URL: ${btn.payload}`);
                        }
                    }
                    if (btn.type === 'PHONE_CALL' && btn.payload) {
                        const clean = btn.payload.replace(/[\s\-\(\)]/g, '');
                        if (!/^\+?\d{7,15}$/.test(clean)) {
                            throw new Error(`Invalid phone number: ${btn.payload}`);
                        }
                    }
                    if (btn.type === 'POSTBACK' && btn.payload && btn.payload.length > 256) {
                        throw new Error("Postback payload exceeds 256 characters");
                    }
                }
            }
        }
    },

    isQuickReply: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'true = buttons disappear after user clicks one'
    },

    triggerType: {
        type: DataTypes.ENUM('WELCOME', 'KEYWORD', 'FALLBACK', 'MANUAL'),
        defaultValue: 'MANUAL',
        comment: 'When to show this button set'
    },

    triggerValue: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Keyword pattern for KEYWORD trigger, null for others'
    },

    active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }

}, {
    indexes: [
        { fields: ['connectionId'] },
        { fields: ['connectionId', 'triggerType'] },
        { fields: ['active'] }
    ]
});

module.exports = ButtonSet;
