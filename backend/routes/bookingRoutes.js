// routes/bookingRoutes.js
// مسارات الحجوزات: الحجز بفترة محددة، الإرجاع، الإلغاء، والتقييم المتبادل

const express = require('express');
const Booking = require('../models/bookingModel');
const Product = require('../models/productModel');
const Review = require('../models/reviewModel');
const User = require('../models/userModel');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { requireObjectId, requireIsoDate, requireNumber } = require('../utils/validators');
const { authenticate } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const { TERMS_VERSION, MAX_BOOKING_LEAD_DAYS } = require('../../shared/business');
const {
    todayIso, parseIsoDate, toIso, diffDays,
} = require('../../shared/dates');

const router = express.Router();

router.use(authenticate);

function ratingOf(user) {
    return user && user.ratingCount ? Math.round((user.ratingSum / user.ratingCount) * 10) / 10 : null;
}

// حجز منتج لفترة محددة — تحديث ذري يمنع الحجز المزدوج
router.post('/', writeLimiter, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const productId = requireObjectId(body.productId, 'معرّف المنتج');
    const startDate = requireIsoDate(body.startDate, 'تاريخ الاستلام');
    const endDate = requireIsoDate(body.endDate, 'تاريخ الإرجاع');
    if (body.acceptTerms !== true) {
        throw new HttpError(400, 'يجب الإقرار بأن المنصة غير مسؤولة عن الضياع أو التلف قبل الحجز.');
    }

    const today = todayIso();
    if (diffDays(today, startDate) < 0) throw new HttpError(400, 'تاريخ الاستلام لا يمكن أن يكون في الماضي.');
    if (diffDays(today, startDate) > MAX_BOOKING_LEAD_DAYS) {
        throw new HttpError(400, `يمكن الحجز قبل ${MAX_BOOKING_LEAD_DAYS} يوماً كحد أقصى.`);
    }
    const days = diffDays(startDate, endDate) + 1;
    if (days < 1) throw new HttpError(400, 'تاريخ الإرجاع يجب أن يكون بعد تاريخ الاستلام أو في نفس اليوم.');

    const existing = await Product.findById(productId).select('owner status maxDays').lean();
    if (!existing) throw new HttpError(404, 'المنتج غير موجود.');
    if (String(existing.owner) === req.user.id) throw new HttpError(400, 'لا يمكنك حجز منتجك.');
    const maxDays = existing.maxDays || 7;
    if (days > maxDays) throw new HttpError(400, `أقصى مدة لهذا الغرض ${maxDays} أيام.`);

    const product = await Product.findOneAndUpdate(
        { _id: productId, status: 'available', owner: { $ne: req.user.id } },
        { $set: { status: 'booked' } },
        { new: true }
    ).lean();
    if (!product) throw new HttpError(409, 'هذا المنتج محجوز حالياً.');

    let booking;
    try {
        booking = await Booking.create({
            productId: product._id,
            userId: req.user.id,
            ownerId: product.owner,
            startDate: parseIsoDate(startDate),
            endDate: parseIsoDate(endDate),
            status: 'active',
            termsAcceptedAt: new Date(),
            termsVersion: TERMS_VERSION,
        });
    } catch (error) {
        // إعادة الحالة إذا فشل إنشاء الحجز
        await Product.updateOne({ _id: product._id }, { $set: { status: 'available' } });
        if (error && error.code === 11000) throw new HttpError(409, 'هذا المنتج محجوز حالياً.');
        throw error;
    }

    res.status(201).json({ booking });
}));

// نظرة عامة على حجوزاتي كمستعير وكمالك (للحساب والتنبيهات والتقييمات)
router.get('/overview', asyncHandler(async (req, res) => {
    const me = req.user.id;
    const bookings = await Booking.find({ $or: [{ userId: me }, { ownerId: me }] })
        .sort({ createdAt: -1 })
        .limit(200)
        .populate('productId', 'name description pricePerDay deposit image phoneNumber')
        .populate('userId', 'name ratingSum ratingCount')
        .populate('ownerId', 'name ratingSum ratingCount')
        .lean();

    const reviewed = new Set((await Review.find({ reviewer: me, bookingId: { $in: bookings.map((b) => b._id) } })
        .select('bookingId').lean()).map((r) => String(r.bookingId)));

    const shape = (booking, role) => {
        const other = role === 'borrower' ? booking.ownerId : booking.userId;
        const product = booking.productId;
        return {
            _id: booking._id,
            role,
            status: booking.status,
            startDate: toIso(booking.startDate),
            endDate: toIso(booking.endDate),
            returnedAt: booking.returnedAt || null,
            createdAt: booking.createdAt,
            canReview: booking.status === 'returned' && !reviewed.has(String(booking._id)) && Boolean(other),
            counterpart: other ? { _id: other._id, name: other.name, rating: ratingOf(other), ratingCount: other.ratingCount || 0 } : null,
            product: product
                ? {
                    _id: product._id,
                    name: product.name,
                    description: product.description,
                    pricePerDay: product.pricePerDay,
                    deposit: product.deposit || 0,
                    image: product.image,
                    // رقم التواصل يظهر فقط للمستعير أثناء الحجز النشط
                    phoneNumber: role === 'borrower' && booking.status === 'active' ? product.phoneNumber : undefined,
                }
                : null,
        };
    };

    res.set('Cache-Control', 'no-store');
    res.json({
        today: todayIso(),
        asBorrower: bookings.filter((b) => String(b.userId && b.userId._id) === me).map((b) => shape(b, 'borrower')),
        asOwner: bookings.filter((b) => String(b.ownerId && b.ownerId._id) === me).map((b) => shape(b, 'owner')),
    });
}));

// المالك يؤكد استلام الغرض (إنهاء الحجز) — بعدها يستطيع الطرفان التقييم
router.post('/:id/return', asyncHandler(async (req, res) => {
    const id = requireObjectId(req.params.id, 'معرّف الحجز');
    const booking = await Booking.findById(id).lean();
    if (!booking) throw new HttpError(404, 'الحجز غير موجود.');
    if (String(booking.ownerId) !== req.user.id && req.user.role !== 'admin') {
        throw new HttpError(403, 'المالك فقط يستطيع تأكيد استلام الغرض.');
    }

    const updated = await Booking.findOneAndUpdate(
        { _id: booking._id, status: 'active' },
        { $set: { status: 'returned', returnedAt: new Date() } },
        { new: true }
    ).lean();
    if (!updated) throw new HttpError(409, 'تم إنهاء هذا الحجز مسبقاً.');
    await Product.updateOne({ _id: booking.productId }, { $set: { status: 'available' } });

    res.json({ message: 'تم تأكيد الإرجاع.' });
}));

// إلغاء حجز نشط (للمستعير أو المالك أو المشرف)
router.delete('/:id', asyncHandler(async (req, res) => {
    const id = requireObjectId(req.params.id, 'معرّف الحجز');
    const booking = await Booking.findById(id).lean();
    if (!booking) {
        throw new HttpError(404, 'الحجز غير موجود.');
    }

    const isBooker = String(booking.userId) === req.user.id;
    const isOwner = String(booking.ownerId) === req.user.id;
    if (!isBooker && !isOwner && req.user.role !== 'admin') {
        throw new HttpError(403, 'لا تملك صلاحية إلغاء هذا الحجز.');
    }
    if (booking.status !== 'active') {
        throw new HttpError(409, 'لا يمكن إلغاء حجز منتهٍ.');
    }

    const deleted = await Booking.deleteOne({ _id: booking._id, status: 'active' });
    if (deleted.deletedCount) {
        await Product.updateOne({ _id: booking.productId }, { $set: { status: 'available' } });
    }

    res.json({ message: 'تم إلغاء الحجز.' });
}));

// تقييم الطرف الآخر بعد انتهاء الحجز
router.post('/:id/review', writeLimiter, asyncHandler(async (req, res) => {
    const id = requireObjectId(req.params.id, 'معرّف الحجز');
    const body = req.body || {};
    const rating = requireNumber(body.rating, 'التقييم', { min: 1, max: 5 });
    if (!Number.isInteger(rating)) throw new HttpError(400, 'التقييم يجب أن يكون من 1 إلى 5 نجوم.');
    if (body.comment !== undefined && typeof body.comment !== 'string') throw new HttpError(400, 'التعليق غير صالح.');
    const comment = (body.comment || '').trim();
    if (comment.length > 300) throw new HttpError(400, 'التعليق يجب ألا يتجاوز 300 حرف.');

    const booking = await Booking.findById(id).lean();
    if (!booking) throw new HttpError(404, 'الحجز غير موجود.');
    const isBorrower = String(booking.userId) === req.user.id;
    const isOwner = String(booking.ownerId) === req.user.id;
    if (!isBorrower && !isOwner) throw new HttpError(403, 'فقط طرفا الحجز يستطيعان التقييم.');
    if (booking.status !== 'returned') throw new HttpError(409, 'يمكن التقييم بعد تأكيد إرجاع الغرض فقط.');

    const reviewee = isBorrower ? booking.ownerId : booking.userId;
    try {
        await Review.create({
            bookingId: booking._id,
            productId: booking.productId,
            reviewer: req.user.id,
            reviewee,
            revieweeRole: isBorrower ? 'owner' : 'borrower',
            rating,
            comment,
        });
    } catch (error) {
        if (error && error.code === 11000) throw new HttpError(409, 'قيّمت هذا الحجز مسبقاً.');
        throw error;
    }
    await User.updateOne({ _id: reviewee }, { $inc: { ratingSum: rating, ratingCount: 1 } });

    res.status(201).json({ message: 'شكراً لتقييمك.' });
}));

module.exports = router;
