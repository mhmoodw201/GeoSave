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

const router = express.Router();
const PAGE_SIZE = 24;

// الصورة تُحفظ في الذاكرة أولاً ثم تُعالج وتُعاد كتابتها بواسطة sharp (لا يُكتب ملف المستخدم كما هو)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: 10, fieldSize: 4 * 1024 },
    fileFilter(_req, file, cb) {
        if (/^image\/(jpeg|png|webp|gif|avif|heic|heif)$/.test(file.mimetype)) return cb(null, true);
        return cb(new HttpError(400, 'يُسمح فقط برفع الصور (JPG, PNG, WebP).'));
    },
});

function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// البحث عن المنتجات القريبة
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
        { $skip: (page - 1) * PAGE_SIZE },
        { $limit: PAGE_SIZE + 1 },
        { $lookup: { from: 'users', localField: 'owner', foreignField: '_id', as: 'ownerDoc' } },
        {
            $project: {
                // لا نعيد الإحداثيات الدقيقة ولا رقم الجوال للعامة — المسافة فقط
                name: 1,
                description: 1,
                pricePerDay: 1,
                image: 1,
                status: 1,
                createdAt: 1,
                distance: { $round: ['$distance', 0] },
                owner: {
                    _id: { $arrayElemAt: ['$ownerDoc._id', 0] },
                    name: { $arrayElemAt: ['$ownerDoc.name', 0] },
                },
            },
        },
    ]);

    res.json({ items: items.slice(0, PAGE_SIZE), page, hasMore: items.length > PAGE_SIZE, radiusKm });
}));

// منتجات المستخدم الحالي مع حالة الحجز
router.get('/mine', authenticate, asyncHandler(async (req, res) => {
    const products = await Product.find({ owner: req.user.id })
        .select('name description pricePerDay image status phoneNumber createdAt')
        .sort({ createdAt: -1 })
        .lean();

    const bookings = await Booking.find({ productId: { $in: products.map((p) => p._id) } })
        .populate('userId', 'name')
        .lean();
    const bookingByProduct = new Map(bookings.map((b) => [String(b.productId), b]));

    res.set('Cache-Control', 'no-store');
    res.json({
        items: products.map((product) => {
            const booking = bookingByProduct.get(String(product._id));
            return {
                ...product,
                booking: booking
                    ? { _id: booking._id, bookedBy: booking.userId ? booking.userId.name : null, createdAt: booking.createdAt }
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
    const pricePerDay = requireNumber(body.pricePerDay, 'السعر اليومي', { min: 1, max: 100000 });
    const latitude = requireNumber(body.latitude, 'خط العرض', { min: -90, max: 90 });
    const longitude = requireNumber(body.longitude, 'خط الطول', { min: -180, max: 180 });
    const phoneNumber = normalizePhone(body.phoneNumber);

    if (!req.file) {
        throw new HttpError(400, 'صورة المنتج مطلوبة.');
    }

    const image = await saveProductImage(req.file.buffer);
    try {
        const product = await Product.create({
            name,
            description,
            pricePerDay: Math.round(pricePerDay * 100) / 100,
            location: { type: 'Point', coordinates: [longitude, latitude] },
            image,
            phoneNumber,
            owner: req.user.id, // المالك يؤخذ من الجلسة وليس من الطلب
        });
        res.status(201).json({ product });
    } catch (error) {
        await deleteProductImage(image);
        throw error;
    }
}));

// حذف منتج (للمالك أو المشرف فقط)
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
    const id = requireObjectId(req.params.id, 'معرّف المنتج');
    const product = await Product.findById(id).lean();
    if (!product) {
        throw new HttpError(404, 'المنتج غير موجود.');
    }
    if (String(product.owner) !== req.user.id && req.user.role !== 'admin') {
        throw new HttpError(403, 'لا تملك صلاحية حذف هذا المنتج.');
    }

    await Product.deleteOne({ _id: product._id });
    await Booking.deleteMany({ productId: product._id });
    await deleteProductImage(product.image);

    res.json({ message: 'تم حذف المنتج.' });
}));

module.exports = router;
