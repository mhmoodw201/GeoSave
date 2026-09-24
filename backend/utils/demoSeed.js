// utils/demoSeed.js
// تعبئة قاعدة البيانات ببيانات تجريبية قرب نقطة معينة (يعمل فقط في وضع العرض التجريبي)

const bcrypt = require('bcryptjs');
const sharp = require('sharp');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const User = require('../models/userModel');
const Product = require('../models/productModel');
const Booking = require('../models/bookingModel');
const {
    DEMO_CENTER, DEMO_PASSWORD, DEMO_USERS, DEMO_PRODUCTS, DEMO_BOOKINGS, DEMO_PHONE,
    offsetPoint, illustrationSvg,
} = require('../../shared/demo-data');

async function ensureDemoUsers() {
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const users = {};
    for (const demo of DEMO_USERS) {
        users[demo.key] = await User.findOneAndUpdate(
            { email: demo.email },
            { $setOnInsert: { name: demo.name, email: demo.email, password: hash, role: 'user' } },
            { upsert: true, new: true }
        ).lean();
    }
    return users;
}

async function renderImage(item) {
    const fileName = `${crypto.randomUUID()}.webp`;
    await fs.mkdir(config.uploadDir, { recursive: true });
    await sharp(Buffer.from(illustrationSvg(item))).webp({ quality: 82 }).toFile(path.join(config.uploadDir, fileName));
    return `uploads/${fileName}`;
}

/**
 * ينشئ المنتجات التجريبية حول النقطة إن لم تكن موجودة بالقرب منها.
 * @returns {Promise<number>} عدد المنتجات التي أُنشئت
 */
async function seedDemoData(center = DEMO_CENTER) {
    const users = await ensureDemoUsers();
    const demoOwnerIds = Object.values(users).map((u) => u._id);

    const nearby = await Product.countDocuments({
        owner: { $in: demoOwnerIds },
        location: { $geoWithin: { $centerSphere: [[center.lng, center.lat], 3 / 6378.1] } },
    });
    if (nearby >= 3) return 0;

    const created = {};
    for (const item of DEMO_PRODUCTS) {
        const point = offsetPoint(center, item.dx, item.dy);
        created[item.key] = await Product.create({
            name: item.name,
            description: item.description,
            pricePerDay: item.pricePerDay,
            owner: users[item.owner]._id,
            location: { type: 'Point', coordinates: [point.lng, point.lat] },
            image: await renderImage(item),
            phoneNumber: DEMO_PHONE,
        });
    }

    for (const booking of DEMO_BOOKINGS) {
        const product = created[booking.product];
        const user = users[booking.user];
        await Booking.create({ productId: product._id, userId: user._id });
        await Product.updateOne({ _id: product._id }, { $set: { status: 'booked' } });
    }

    return DEMO_PRODUCTS.length;
}

module.exports = { seedDemoData };
