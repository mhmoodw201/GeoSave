// models/orderModel.js
// طلبات شراء الخدمات الرقمية (تمييز الإعلان، اشتراك Plus).
// المبالغ تُحسب في الخادم من كتالوج الخدمات ولا تُقبل من العميل أبداً.

const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        service: { type: String, required: true },
        kind: { type: String, enum: ['featured', 'plus'], required: true },
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        days: { type: Number, required: true, min: 1 },
        amount: { type: Number, required: true, min: 0 }, // شامل الضريبة
        netAmount: { type: Number, required: true, min: 0 },
        vatAmount: { type: Number, required: true, min: 0 },
        currency: { type: String, default: 'SAR' },
        status: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
        provider: { type: String, required: true },
        providerRef: String,
        paidAt: Date,
        appliedAt: Date,
    },
    { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
