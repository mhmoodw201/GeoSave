// models/bookingModel.js
// نموذج الحجز (استعارة أو استئجار) بفترة محددة.
// حجز "نشط" واحد فقط لكل منتج (فهرس فريد جزئي)، مع الاحتفاظ بالحجوزات المنتهية للتقييم والسجل.

const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
    {
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        status: {
            type: String,
            enum: ['active', 'returned'],
            default: 'active',
        },
        returnedAt: Date,
        // إقرار المستعير بأن المنصة وسيط تقني غير مسؤول عن الضياع أو التلف
        termsAcceptedAt: { type: Date, required: true },
        termsVersion: { type: String, required: true },
    },
    { timestamps: true }
);

bookingSchema.index(
    { productId: 1 },
    { unique: true, partialFilterExpression: { status: 'active' }, name: 'one_active_booking_per_product' }
);
bookingSchema.index({ productId: 1, createdAt: -1 });

module.exports = mongoose.model('Booking', bookingSchema);
