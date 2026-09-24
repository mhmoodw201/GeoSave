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
const Review = require('../models/reviewModel');
const {
    DEMO_CENTER, DEMO_PASSWORD, DEMO_USERS, DEMO_PRODUCTS, DEMO_BOOKINGS, DEMO_HISTORY, DEMO_PHONE,
    offsetPoint, illustrationSvg,
} = require('../../shared/demo-data');
const { TERMS_VERSION } = require('../../shared/business');
const { todayIso, addDays, parseIsoDate } = require('../../shared/dates');

const DAY_MS = 24 * 60 * 60 * 1000;

async function ensureDemoUsers() {
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const users = {};
    for (const demo of DEMO_USERS) {
        users[demo.key] = await User.findOneAndUpdate(
            { email: demo.email },
            {
                $setOnInsert: {
                    name: demo.name,
                    email: demo.email,
                    password: hash,
                    role: 'user',
                    termsAcceptedAt: new Date(),
                    termsVersion: TERMS_VERSION,
                    ratingSum: 0,
                    ratingCount: 0,
                    plan: 'free',
                },
            },
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

function bookingDates(startOffset, days) {
    const start = addDays(todayIso(), startOffset);
    return { startDate: parseIsoDate(start), endDate: parseIsoDate(addDays(start, days - 1)) };
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
            deposit: item.deposit || 0,
            maxDays: item.maxDays || 7,
            featuredUntil: item.featuredDays ? new Date(Date.now() + item.featuredDays * DAY_MS) : undefined,
            owner: users[item.owner]._id,
            location: { type: 'Point', coordinates: [point.lng, point.lat] },
            image: await renderImage(item),
            phoneNumber: DEMO_PHONE,
            termsAcceptedAt: new Date(),
            termsVersion: TERMS_VERSION,
        });
    }

    const makeBooking = (spec, status) => Booking.create({
        productId: created[spec.product]._id,
        userId: users[spec.user]._id,
        ownerId: created[spec.product].owner,
        ...bookingDates(spec.startOffset, spec.days),
        status,
        returnedAt: status === 'returned' ? parseIsoDate(addDays(todayIso(), spec.startOffset + spec.days)) : undefined,
        termsAcceptedAt: new Date(),
        termsVersion: TERMS_VERSION,
    });

    for (const spec of DEMO_BOOKINGS) {
        await makeBooking(spec, 'active');
        await Product.updateOne({ _id: created[spec.product]._id }, { $set: { status: 'booked' } });
    }

    // سجل الحجوزات المنتهية والتقييمات مرة واحدة فقط (حتى لا تتضاعف التقييمات مع كل منطقة)
    const hasHistory = await Review.exists({ reviewer: { $in: demoOwnerIds } });
    if (!hasHistory) {
        for (const spec of DEMO_HISTORY) {
            const booking = await makeBooking(spec, 'returned');
            for (const review of spec.reviews) {
                const reviewerIsBorrower = review.by === spec.user;
                const reviewee = reviewerIsBorrower ? created[spec.product].owner : users[spec.user]._id;
                await Review.create({
                    bookingId: booking._id,
                    productId: booking.productId,
                    reviewer: users[review.by]._id,
                    reviewee,
                    revieweeRole: reviewerIsBorrower ? 'owner' : 'borrower',
                    rating: review.rating,
                    comment: review.comment,
                });
                await User.updateOne({ _id: reviewee }, { $inc: { ratingSum: review.rating, ratingCount: 1 } });
            }
        }
    }

    return DEMO_PRODUCTS.length;
}

module.exports = { seedDemoData };
