// scripts/migrate-v2.js
// ترحيل بيانات الإصدار القديم إلى الإصدار 2:
//  - تحويل latitude/longitude إلى حقل location بصيغة GeoJSON
//  - تحويل حالة المنتج pending/confirmed إلى available/booked
//  - تحويل رقم الجوال من Number إلى String
//  - إنشاء الفهارس (2dsphere والفهارس الفريدة)
// التشغيل:  npm run migrate

const mongoose = require('mongoose');
const config = require('../config');
const Product = require('../models/productModel');
const Booking = require('../models/bookingModel');
const User = require('../models/userModel');

async function main() {
    await mongoose.connect(config.mongoUri);
    const products = mongoose.connection.collection('products');

    const legacy = await products.find({ location: { $exists: false } }).toArray();
    let converted = 0;
    let skipped = 0;
    for (const doc of legacy) {
        const lat = Number(doc.latitude);
        const lng = Number(doc.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            skipped += 1;
            continue;
        }
        await products.updateOne(
            { _id: doc._id },
            {
                $set: {
                    location: { type: 'Point', coordinates: [lng, lat] },
                    phoneNumber: doc.phoneNumber != null ? String(doc.phoneNumber) : doc.phoneNumber,
                },
                $unset: { latitude: '', longitude: '' },
            }
        );
        converted += 1;
    }

    await products.updateMany({ status: 'pending' }, { $set: { status: 'available' } });
    await products.updateMany({ status: 'confirmed' }, { $set: { status: 'booked' } });
    await products.updateMany({ phoneNumber: { $type: 'number' } }, [{ $set: { phoneNumber: { $toString: '$phoneNumber' } } }]);
    const users = mongoose.connection.collection('users');
    await users.updateMany({ role: { $exists: false } }, { $set: { role: 'user' } });

    // توحيد البريد الإلكتروني بأحرف صغيرة (تسجيل الدخول أصبح غير حساس لحالة الأحرف)
    for (const user of await users.find({}, { projection: { email: 1 } }).toArray()) {
        const normalized = String(user.email || '').trim().toLowerCase();
        if (normalized === user.email) continue;
        try {
            await users.updateOne({ _id: user._id }, { $set: { email: normalized } });
        } catch (error) {
            console.warn(`Could not normalize email for user ${user._id}: ${error.message}`);
        }
    }

    // إزالة الحجوزات المكررة لنفس المنتج قبل إنشاء الفهرس الفريد
    const duplicates = await Booking.aggregate([
        { $group: { _id: '$productId', ids: { $push: '$_id' }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
    ]);
    for (const dup of duplicates) {
        await Booking.deleteMany({ _id: { $in: dup.ids.slice(1) } });
    }

    await Promise.all([User.syncIndexes(), Product.syncIndexes(), Booking.syncIndexes()]);

    console.log(`Products converted: ${converted}, skipped (invalid coordinates): ${skipped}`);
    console.log(`Duplicate bookings removed: ${duplicates.reduce((n, d) => n + d.count - 1, 0)}`);
    console.log('Migration complete.');
    await mongoose.disconnect();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
