require('dotenv').config();
const User = require('./models/User');
const sequelize = require('./config/db');
const bcrypt = require('bcryptjs');

async function createAdmin() {
    try {
        await sequelize.authenticate();
        console.log("DB Authenticated");

        const password = process.env.ADMIN_PASSWORD || 'admin123';
        const hashedPassword = await bcrypt.hash(password, 10);
        const username = process.env.ADMIN_USER || 'admin';

        console.log(`Creating/Updating user: ${username}`);

        // Check if user exists
        let user = await User.findOne({ where: { username } });

        if (user) {
            console.log("User found, updating...");
            user.passwordHash = hashedPassword;
            user.role = 'OWNER';
            user.status = 'ACTIVE';
            user.failedAttempts = 0;
            user.lockUntil = null;
            await user.save();
            console.log('Admin user updated successfully.');
        } else {
            console.log("User not found, creating...");
            user = await User.create({
                username,
                passwordHash: hashedPassword,
                role: 'OWNER',
                status: 'ACTIVE'
            });
            console.log('Admin user created successfully.');
        }

        process.exit(0);
    } catch (error) {
        console.error('Error creating admin:', error);
        process.exit(1);
    }
}

createAdmin();
