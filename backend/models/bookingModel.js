// models/bookingModel.js
// نموذج الحجز — منتج واحد لا يمكن أن يملك أكثر من حجز نشط (فهرس فريد)

const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
    {
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
            unique: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Booking', bookingSchema);
