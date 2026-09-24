// models/productModel.js
// نموذج المنتج (الإعلان) — الموقع مخزن بصيغة GeoJSON مع فهرس 2dsphere للبحث الجغرافي

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 80,
        },
        description: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000,
        },
        // 0 = إعارة مجانية
        pricePerDay: {
            type: Number,
            required: true,
            min: 0,
            max: 100000,
        },
        // مبلغ تأمين اختياري يُتفق عليه ويُسلَّم مباشرة بين الطرفين — لا تستلمه المنصة
        deposit: {
            type: Number,
            default: 0,
            min: 0,
            max: 100000,
        },
        // أقصى مدة للاستعارة بالأيام
        maxDays: {
            type: Number,
            default: 7,
            min: 1,
            max: 30,
        },
        // تمييز الإعلان (خدمة مدفوعة): يظهر أولاً حتى هذا التاريخ
        featuredUntil: Date,
        // إقرار المالك بشروط الاستخدام عند النشر
        termsAcceptedAt: Date,
        termsVersion: String,
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        location: {
            type: {
                type: String,
                enum: ['Point'],
                required: true,
                default: 'Point',
            },
            coordinates: {
                type: [Number], // [longitude, latitude]
                required: true,
            },
        },
        image: {
            type: String,
            required: true,
        },
        phoneNumber: {
            type: String,
            required: true,
            match: /^[1-9]\d{7,14}$/,
        },
        status: {
            type: String,
            enum: ['available', 'booked'],
            default: 'available',
        },
    },
    { timestamps: true }
);

productSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Product', productSchema);
