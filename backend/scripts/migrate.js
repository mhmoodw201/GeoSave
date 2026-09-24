// scripts/migrate.js
// ترحيل البيانات إلى أحدث إصدار (آمن للتشغيل أكثر من مرة).
// من الإصدار 1 إلى 2:
//  - تحويل latitude/longitude إلى حقل location بصيغة GeoJSON
//  - تحويل حالة المنتج pending/confirmed إلى available/booked
//  - تحويل رقم الجوال من Number إلى String
//  - إنشاء الفهارس (2dsphere والفهارس الفريدة)
// من الإصدار 2 إلى 3:
//  - حقول الإعارة (deposit, maxDays) للمنتجات
//  - فترة وحالة ومالك لكل حجز قديم
//  - حقول التقييم والباقة للمستخدمين
// التشغيل:  npm run migrate

const mongoose = require('mongoose');
const { connectDatabase } = require('../db');
const Product = require('../models/productModel');
const Booking = require('../models/bookingModel');
const User = require('../models/userModel');
const Review = require('../models/reviewModel');
const Order = require('../models/orderModel');

async function main() {
    const database = await connectDatabase(); // أوقف الخادم أولاً عند استخدام قاعدة البيانات المدمجة
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

    // الإصدار 3
    await products.updateMany({ maxDays: { $exists: false } }, { $set: { maxDays: 7 } });
    await products.updateMany({ deposit: { $exists: false } }, { $set: { deposit: 0 } });
    await users.updateMany({ plan: { $exists: false } }, { $set: { plan: 'free' } });
    await users.updateMany({ ratingSum: { $exists: false } }, { $set: { ratingSum: 0, ratingCount: 0 } });

    const bookingsCollection = mongoose.connection.collection('bookings');
    let bookingsUpgraded = 0;
    for (const booking of await bookingsCollection.find({ status: { $exists: false } }).toArray()) {
        const product = await products.findOne({ _id: booking.productId }, { projection: { owner: 1 } });
        if (!product) {
            await bookingsCollection.deleteOne({ _id: booking._id });
            continue;
        }
        const start = booking.createdAt ? new Date(booking.createdAt) : new Date();
        start.setUTCHours(0, 0, 0, 0);
        await bookingsCollection.updateOne({ _id: booking._id }, {
            $set: {
                status: 'active',
                ownerId: product.owner,
                startDate: start,
                endDate: new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000),
                termsAcceptedAt: booking.createdAt || new Date(),
                termsVersion: 'legacy',
            },
        });
        bookingsUpgraded += 1;
    }
    console.log(`Bookings upgraded: ${bookingsUpgraded}`);

    // إزالة الحجوزات المكررة لنفس المنتج قبل إنشاء الفهرس الفريد
    const duplicates = await Booking.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: '$productId', ids: { $push: '$_id' }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
    ]);
    for (const dup of duplicates) {
        await Booking.deleteMany({ _id: { $in: dup.ids.slice(1) } });
    }

    await Promise.all([User.syncIndexes(), Product.syncIndexes(), Booking.syncIndexes(), Review.syncIndexes(), Order.syncIndexes()]);

    console.log(`Products converted: ${converted}, skipped (invalid coordinates): ${skipped}`);
    console.log(`Duplicate bookings removed: ${duplicates.reduce((n, d) => n + d.count - 1, 0)}`);
    console.log('Migration complete.');
    await database.stop();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
