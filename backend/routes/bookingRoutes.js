// routes/bookingRoutes.js
// مسارات الحجوزات

const express = require('express');
const Booking = require('../models/bookingModel');
const Product = require('../models/productModel');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { requireObjectId } = require('../utils/validators');
const { authenticate } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');

const router = express.Router();

router.use(authenticate);

// حجز منتج — تحديث ذري يمنع الحجز المزدوج
router.post('/', writeLimiter, asyncHandler(async (req, res) => {
    const productId = requireObjectId((req.body || {}).productId, 'معرّف المنتج');

    const product = await Product.findOneAndUpdate(
        { _id: productId, status: 'available', owner: { $ne: req.user.id } },
        { $set: { status: 'booked' } },
        { new: true }
    ).lean();

    if (!product) {
        const existing = await Product.findById(productId).select('owner status').lean();
        if (!existing) throw new HttpError(404, 'المنتج غير موجود.');
        if (String(existing.owner) === req.user.id) throw new HttpError(400, 'لا يمكنك حجز منتجك.');
        throw new HttpError(409, 'هذا المنتج محجوز حالياً.');
    }

    let booking;
    try {
        booking = await Booking.create({ productId: product._id, userId: req.user.id });
    } catch (error) {
        // إعادة الحالة إذا فشل إنشاء الحجز
        await Product.updateOne({ _id: product._id }, { $set: { status: 'available' } });
        if (error && error.code === 11000) throw new HttpError(409, 'هذا المنتج محجوز حالياً.');
        throw error;
    }

    res.status(201).json({ booking });
}));

// حجوزات المستخدم الحالي — رقم التواصل يظهر فقط لمن حجز المنتج
router.get('/mine', asyncHandler(async (req, res) => {
    const bookings = await Booking.find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .populate({
            path: 'productId',
            select: 'name description pricePerDay image phoneNumber owner',
            populate: { path: 'owner', select: 'name' },
        })
        .lean();

    res.set('Cache-Control', 'no-store');
    res.json({
        items: bookings
            .filter((booking) => booking.productId)
            .map((booking) => ({
                _id: booking._id,
                createdAt: booking.createdAt,
                product: {
                    _id: booking.productId._id,
                    name: booking.productId.name,
                    description: booking.productId.description,
                    pricePerDay: booking.productId.pricePerDay,
                    image: booking.productId.image,
                    phoneNumber: booking.productId.phoneNumber,
                    ownerName: booking.productId.owner ? booking.productId.owner.name : null,
                },
            })),
    });
}));

// إلغاء حجز (لصاحب الحجز أو مالك المنتج أو المشرف)
router.delete('/:id', asyncHandler(async (req, res) => {
    const id = requireObjectId(req.params.id, 'معرّف الحجز');
    const booking = await Booking.findById(id).lean();
    if (!booking) {
        throw new HttpError(404, 'الحجز غير موجود.');
    }

    const product = await Product.findById(booking.productId).select('owner').lean();
    const isBooker = String(booking.userId) === req.user.id;
    const isOwner = product && String(product.owner) === req.user.id;
    if (!isBooker && !isOwner && req.user.role !== 'admin') {
        throw new HttpError(403, 'لا تملك صلاحية إلغاء هذا الحجز.');
    }

    await Booking.deleteOne({ _id: booking._id });
    if (product) {
        await Product.updateOne({ _id: product._id }, { $set: { status: 'available' } });
    }

    res.json({ message: 'تم إلغاء الحجز.' });
}));

module.exports = router;
