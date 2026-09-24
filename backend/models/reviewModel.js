// models/reviewModel.js
// تقييم متبادل بعد انتهاء الحجز: المستعير يقيّم المالك، والمالك يقيّم المستعير

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
    {
        bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        reviewee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        // دور الشخص الذي تم تقييمه في هذه العملية
        revieweeRole: { type: String, enum: ['owner', 'borrower'], required: true },
        rating: { type: Number, required: true, min: 1, max: 5 },
        comment: { type: String, trim: true, maxlength: 300, default: '' },
    },
    { timestamps: true }
);

// تقييم واحد فقط لكل طرف في كل حجز
reviewSchema.index({ bookingId: 1, reviewer: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
