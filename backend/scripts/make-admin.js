// scripts/make-admin.js
// ترقية مستخدم موجود إلى مشرف:  npm run make-admin -- user@example.com

const mongoose = require('mongoose');
const { connectDatabase } = require('../db');
const User = require('../models/userModel');

async function main() {
    const email = (process.argv[2] || '').trim().toLowerCase();
    if (!email) {
        console.error('Usage: npm run make-admin -- <email>');
        process.exit(1);
    }
    const database = await connectDatabase(); // أوقف الخادم أولاً عند استخدام قاعدة البيانات المدمجة
    const result = await User.updateOne({ email }, { $set: { role: 'admin' } });
    console.log(result.matchedCount ? `${email} is now an admin.` : `No user found with email ${email}.`);
    await database.stop();
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
