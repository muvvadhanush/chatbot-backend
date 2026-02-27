const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const bcrypt = require("bcryptjs");

const User = sequelize.define("User", {

    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },

    username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },

    email: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
        validate: {
            isEmail: true
        }
    },

    passwordHash: {
        type: DataTypes.STRING,
        allowNull: false
    },

    role: {
        type: DataTypes.ENUM('OWNER', 'EDITOR', 'VIEWER'),
        defaultValue: 'VIEWER'
    },

    status: {
        type: DataTypes.ENUM('ACTIVE', 'DISABLED', 'LOCKED'),
        defaultValue: 'ACTIVE'
    },

    failedAttempts: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },

    lockUntil: {
        type: DataTypes.DATE,
        allowNull: true
    }

}, {
    indexes: [
        { unique: true, fields: ['username'] },
        { unique: true, fields: ['email'] },
        { fields: ['role'] }
    ],
    hooks: {

        async beforeCreate(user) {
            if (!isBcryptHash(user.passwordHash)) {
                user.passwordHash = await hashPassword(user.passwordHash);
            }
        },

        async beforeUpdate(user) {
            if (user.changed('passwordHash') && !isBcryptHash(user.passwordHash)) {
                user.passwordHash = await hashPassword(user.passwordHash);
            }
        }
    }
});

// =======================
// Helper Functions
// =======================

function isBcryptHash(hash) {
    return typeof hash === "string" &&
        (hash.startsWith("$2a$") ||
            hash.startsWith("$2b$") ||
            hash.startsWith("$2y$"));
}

async function hashPassword(password) {
    const salt = await bcrypt.genSalt(12); // stronger
    return bcrypt.hash(password, salt);
}

// =======================
// Instance Methods
// =======================

User.prototype.validPassword = async function (password) {
    if (this.status !== "ACTIVE") return false;

    return bcrypt.compare(password, this.passwordHash);
};

User.prototype.recordFailedLogin = async function () {
    this.failedAttempts += 1;

    if (this.failedAttempts >= 5) {
        this.status = "LOCKED";
        this.lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 min
    }

    await this.save();
};

User.prototype.resetLoginAttempts = async function () {
    this.failedAttempts = 0;
    this.lockUntil = null;
    await this.save();
};

module.exports = User;
