// routes/userRoutes.js
// الملف العام للمستخدم: التقييم وآخر المراجعات (بدون أي بيانات تواصل)

const express = require('express');
const User = require('../models/userModel');
const Review = require('../models/reviewModel');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { requireObjectId } = require('../utils/validators');
const { isPlusActive } = require('../../shared/business');

const router = express.Router();

router.get('/:id/reviews', asyncHandler(async (req, res) => {
    const id = requireObjectId(req.params.id, 'معرّف المستخدم');
    const user = await User.findById(id).select('name ratingSum ratingCount plan planUntil createdAt').lean();
    if (!user) throw new HttpError(404, 'المستخدم غير موجود.');

    const reviews = await Review.find({ reviewee: user._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('reviewer', 'name')
        .lean();

    res.json({
        user: {
            _id: user._id,
            name: user.name,
            rating: user.ratingCount ? Math.round((user.ratingSum / user.ratingCount) * 10) / 10 : null,
            ratingCount: user.ratingCount || 0,
            plus: isPlusActive(user),
            memberSince: user.createdAt,
        },
        reviews: reviews.map((review) => ({
            _id: review._id,
            rating: review.rating,
            comment: review.comment,
            revieweeRole: review.revieweeRole,
            // الاسم الأول فقط لحماية الخصوصية
            reviewerName: review.reviewer ? String(review.reviewer.name).split(/\s+/)[0] : 'مستخدم',
            createdAt: review.createdAt,
        })),
    });
}));

module.exports = router;
