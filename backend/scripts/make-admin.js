// scripts/make-admin.js
// ترقية مستخدم موجود إلى مشرف:  npm run make-admin -- user@example.com

const mongoose = require('mongoose');
const config = require('../config');
const User = require('../models/userModel');

async function main() {
    const email = (process.argv[2] || '').trim().toLowerCase();
    if (!email) {
        console.error('Usage: npm run make-admin -- <email>');
        process.exit(1);
    }
    await mongoose.connect(config.mongoUri);
    const result = await User.updateOne({ email }, { $set: { role: 'admin' } });
    console.log(result.matchedCount ? `${email} is now an admin.` : `No user found with email ${email}.`);
    await mongoose.disconnect();
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
