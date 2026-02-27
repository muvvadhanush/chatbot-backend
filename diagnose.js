
require('dotenv').config();
const sequelize = require('./config/db');
const Connection = require('./models/Connection');
const { OpenAI } = require('openai');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function runDiagnostics() {
    console.log('\n===========================================');
    console.log('🔍 UNIVERSAL CHATBOT SYSTEM DIAGNOSTICS');
    console.log('===========================================\n');

    let issues = [];

    // 1. Environment Variables Check
    console.log('📝 Checking Environment Variables...');
    const requiredEnv = ['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'OPENAI_API_KEY'];
    requiredEnv.forEach(key => {
        if (!process.env[key]) {
            console.error(`   ❌ MISSING: ${key}`);
            issues.push(`Set your ${key} in the .env file.`);
        } else {
            const val = key === 'DB_PASSWORD' || key === 'OPENAI_API_KEY' ? '********' : process.env[key];
            console.log(`   ✅ FOUND: ${key} (${val})`);
        }
    });
    console.log('');

    // 2. Database Connection
    console.log('📅 Testing Database Connectivity...');
    try {
        await sequelize.authenticate();
        console.log('   ✅ Database Connection: SUCCESS');
        const count = await Connection.count();
        console.log(`   📊 Connections in DB: ${count}`);
    } catch (err) {
        console.error('   ❌ Database Connection: FAILED');
        console.error(`      Error: ${err.message}`);
        issues.push('Database is down or credentials in .env are incorrect.');
    }
    console.log('');

    // 3. OpenAI API Connection
    console.log('🤖 Testing OpenAI API Connectivity...');
    try {
        if (!process.env.OPENAI_API_KEY) throw new Error('No API key provided');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 5
        });
        if (response.choices && response.choices.length > 0) {
            console.log('   ✅ OpenAI API: SUCCESS');
        }
    } catch (err) {
        console.error('   ❌ OpenAI API: FAILED');
        console.error(`      Error: ${err.message}`);
        issues.push('OpenAI API key is invalid or your usage limit has been reached.');
    }
    console.log('');

    // 4. Backend Server Health
    console.log('🚀 Testing Backend Server Health...');
    const port = process.env.PORT || 5000; // Updated to 5000 based on app.js
    try {
        const res = await axios.get(`http://localhost:${port}/health`);
        console.log(`   ✅ Backend Health Check: SUCCESS (Status ${res.status})`);
        console.log(`      Server Response: "${res.data}"`);
    } catch (err) {
        console.error('   ❌ Backend Health Check: FAILED');
        console.error(`      Error: ${err.message}`);
        issues.push(`Backend server (app.js) is not running on port ${port}. Run "npm start" to fix.`);
    }
    console.log('');

    // 5. Critical Files Check
    console.log('🖥️ Checking Critical File Integrity...');
    const requiredFiles = [
        'public/admin.html',
        'public/admin.js',
        'public/admin.css',
        'public/widget.js',
        'app.js'
    ];

    requiredFiles.forEach(file => {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
            console.log(`   ✅ File Valid: ${file}`);
        } else {
            console.error(`   ❌ File MISSING: ${file}`);
            issues.push(`The required file "${file}" is missing from the directory.`);
        }
    });

    // FINAL SUMMARY
    console.log('\n===========================================');
    console.log('🏁 DIAGNOSTICS SUMMARY');
    console.log('===========================================');
    if (issues.length === 0) {
        console.log('✅ ALL SYSTEMS OPERATIONAL. You are ready to go! 🚀');
    } else {
        console.log(`⚠️ FOUND ${issues.length} ISSUE(S):`);
        issues.forEach((issue, i) => console.log(`${i + 1}. ${issue}`));
        console.log('\n💡 Tip: Fix these issues and run this script again.');
    }
    console.log('===========================================\n');
    process.exit(issues.length > 0 ? 1 : 0);
}

runDiagnostics();
