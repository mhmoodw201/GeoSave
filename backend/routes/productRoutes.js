// routes/productRoutes.js
// مسارات المنتجات: البحث الجغرافي، الإضافة، منتجاتي، والحذف

const express = require('express');
const multer = require('multer');
const config = require('../config');
const Product = require('../models/productModel');
const Booking = require('../models/bookingModel');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { saveProductImage, deleteProductImage } = require('../utils/images');
const {
    requireString, requireNumber, optionalNumber, normalizePhone, requireObjectId,
} = require('../utils/validators');
const { authenticate } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const {
    FREE_LISTING_LIMIT, MAX_BOOKING_DAYS, MAX_DEPOSIT, TERMS_VERSION, isPlusActive,
} = require('../../shared/business');
const { toIso } = require('../../shared/dates');

const router = express.Router();
const PAGE_SIZE = 24;

// الصورة تُحفظ في الذاكرة أولاً ثم تُعالج وتُعاد كتابتها بواسطة sharp (لا يُكتب ملف المستخدم كما هو)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: 12, fieldSize: 4 * 1024 },
    fileFilter(_req, file, cb) {
        if (/^image\/(jpeg|png|webp|gif|avif|heic|heif)$/.test(file.mimetype)) return cb(null, true);
        return cb(new HttpError(400, 'يُسمح فقط برفع الصور (JPG, PNG, WebP).'));
    },
});

function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ratingOf(user) {
    return user && user.ratingCount ? Math.round((user.ratingSum / user.ratingCount) * 10) / 10 : null;
}

// البحث عن المنتجات القريبة — الإعلانات المميزة أولاً ثم الأقرب
router.get('/', asyncHandler(async (req, res) => {
    const lat = requireNumber(req.query.lat, 'lat', { min: -90, max: 90 });
    const lng = requireNumber(req.query.lng, 'lng', { min: -180, max: 180 });
    const radiusKm = optionalNumber(req.query.radius, 'radius', { min: 0.1, max: config.maxRadiusKm }) ?? config.defaultRadiusKm;
    const page = Math.floor(optionalNumber(req.query.page, 'page', { min: 1, max: 1000 }) ?? 1);

    const query = {};
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
        query.name = { $regex: escapeRegex(req.query.q.trim().slice(0, 50)), $options: 'i' };
    }
    if (req.query.available === 'true') {
        query.status = 'available';
    }
    if (req.query.free === 'true') {
        query.pricePerDay = 0;
    }

    const now = new Date();
    const items = await Product.aggregate([
        {
            $geoNear: {
                near: { type: 'Point', coordinates: [lng, lat] },
                key: 'location',
                distanceField: 'distance',
                maxDistance: radiusKm * 1000,
                spherical: true,
                query,
            },
        },
        { $addFields: { isFeatured: { $gt: [{ $ifNull: ['$featuredUntil', null] }, now] } } },
        { $sort: { isFeatured: -1, distance: 1, _id: 1 } },
        { $skip: (page - 1) * PAGE_SIZE },
        { $limit: PAGE_SIZE + 1 },
        { $lookup: { from: 'users', localField: 'owner', foreignField: '_id', as: 'ownerDoc' } },
        { $set: { ownerDoc: { $arrayElemAt: ['$ownerDoc', 0] } } },
        {
            $project: {
                // لا نعيد الإحداثيات الدقيقة ولا رقم الجوال للعامة — المسافة فقط
                name: 1,
                description: 1,
                pricePerDay: 1,
                deposit: 1,
                maxDays: 1,
                image: 1,
                status: 1,
                createdAt: 1,
                isFeatured: 1,
                distance: { $round: ['$distance', 0] },
                owner: {
                    _id: '$ownerDoc._id',
                    name: '$ownerDoc.name',
                    ratingSum: '$ownerDoc.ratingSum',
                    ratingCount: '$ownerDoc.ratingCount',
                    plan: '$ownerDoc.plan',
                    planUntil: '$ownerDoc.planUntil',
                },
            },
        },
    ]);

    res.json({
        items: items.slice(0, PAGE_SIZE).map((item) => {
            const owner = item.owner || {}; // قد يكون المالك محذوفاً
            return {
                ...item,
                deposit: item.deposit || 0,
                maxDays: item.maxDays || 7,
                isFeatured: Boolean(item.isFeatured),
                owner: {
                    _id: owner._id || null,
                    name: owner.name || null,
                    rating: ratingOf(owner),
                    ratingCount: owner.ratingCount || 0,
                    plus: isPlusActive(owner),
                },
            };
        }),
        page,
        hasMore: items.length > PAGE_SIZE,
        radiusKm,
    });
}));

// منتجات المستخدم الحالي مع الحجز النشط وحالة التمييز
router.get('/mine', authenticate, asyncHandler(async (req, res) => {
    const products = await Product.find({ owner: req.user.id })
        .select('name description pricePerDay deposit maxDays image status phoneNumber featuredUntil createdAt')
        .sort({ createdAt: -1 })
        .lean();

    const bookings = await Booking.find({ productId: { $in: products.map((p) => p._id) }, status: 'active' })
        .populate('userId', 'name ratingSum ratingCount')
        .lean();
    const bookingByProduct = new Map(bookings.map((b) => [String(b.productId), b]));
    const now = Date.now();

    res.set('Cache-Control', 'no-store');
    res.json({
        limit: req.user.plan === 'plus' ? null : FREE_LISTING_LIMIT,
        items: products.map((product) => {
            const booking = bookingByProduct.get(String(product._id));
            return {
                ...product,
                deposit: product.deposit || 0,
                maxDays: product.maxDays || 7,
                isFeatured: Boolean(product.featuredUntil && new Date(product.featuredUntil).getTime() > now),
                booking: booking
                    ? {
                        _id: booking._id,
                        bookedBy: booking.userId ? booking.userId.name : null,
                        bookedByRating: ratingOf(booking.userId),
                        startDate: toIso(booking.startDate),
                        endDate: toIso(booking.endDate),
                        createdAt: booking.createdAt,
                    }
                    : null,
            };
        }),
    });
}));

// إضافة منتج جديد
router.post('/', authenticate, writeLimiter, upload.single('image'), asyncHandler(async (req, res) => {
    const body = req.body || {};
    const name = requireString(body.name, 'اسم المنتج', { min: 2, max: 80 });
    const description = requireString(body.description, 'الوصف', { min: 5, max: 1000 });
    const offerType = body.offerType === 'free' ? 'free' : 'rent';
    const pricePerDay = offerType === 'free' ? 0 : requireNumber(body.pricePerDay, 'السعر اليومي', { min: 1, max: 100000 });
    const deposit = optionalNumber(body.deposit, 'مبلغ التأمين', { min: 0, max: MAX_DEPOSIT }) ?? 0;
    const maxDays = Math.floor(optionalNumber(body.maxDays, 'أقصى مدة', { min: 1, max: MAX_BOOKING_DAYS }) ?? 7);
    const latitude = requireNumber(body.latitude, 'خط العرض', { min: -90, max: 90 });
    const longitude = requireNumber(body.longitude, 'خط الطول', { min: -180, max: 180 });
    const phoneNumber = normalizePhone(body.phoneNumber);

    if (!req.file) {
        throw new HttpError(400, 'صورة المنتج مطلوبة.');
    }
    if (body.acceptTerms !== 'true') {
        throw new HttpError(400, 'يجب الإقرار بمسؤوليتك عن الغرض وبأن المنصة غير مسؤولة عن الضياع أو التلف.');
    }

    // الباقة المجانية: عدد محدود من الإعلانات
    if (req.user.plan !== 'plus') {
        const count = await Product.countDocuments({ owner: req.user.id });
        if (count >= FREE_LISTING_LIMIT) {
            throw new HttpError(403, `وصلت للحد الأقصى في الباقة المجانية (${FREE_LISTING_LIMIT} إعلانات). اشترك في GeoSave Plus لإعلانات غير محدودة.`);
        }
    }

    const image = await saveProductImage(req.file.buffer);
    try {
        const product = await Product.create({
            name,
            description,
            pricePerDay: Math.round(pricePerDay * 100) / 100,
            deposit: Math.round(deposit * 100) / 100,
            maxDays,
            location: { type: 'Point', coordinates: [longitude, latitude] },
            image,
            phoneNumber,
            owner: req.user.id, // المالك يؤخذ من الجلسة وليس من الطلب
            termsAcceptedAt: new Date(),
            termsVersion: TERMS_VERSION,
        });
        res.status(201).json({ product });
    } catch (error) {
        await deleteProductImage(image);
        throw error;
    }
}));

// حذف منتج (للمالك أو المشرف فقط) — غير مسموح أثناء وجود حجز نشط إلا للمشرف
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
    const id = requireObjectId(req.params.id, 'معرّف المنتج');
    const product = await Product.findById(id).lean();
    if (!product) {
        throw new HttpError(404, 'المنتج غير موجود.');
    }
    const isAdmin = req.user.role === 'admin';
    if (String(product.owner) !== req.user.id && !isAdmin) {
        throw new HttpError(403, 'لا تملك صلاحية حذف هذا المنتج.');
    }
    if (!isAdmin && await Booking.exists({ productId: product._id, status: 'active' })) {
        throw new HttpError(409, 'لا يمكن حذف الإعلان أثناء وجود حجز نشط. أنهِ الحجز أولاً.');
    }

    await Product.deleteOne({ _id: product._id });
    await Booking.deleteMany({ productId: product._id, status: 'active' });
    await deleteProductImage(product.image);

    res.json({ message: 'تم حذف المنتج.' });
}));

module.exports = router;
