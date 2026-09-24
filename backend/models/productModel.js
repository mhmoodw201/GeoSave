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
        pricePerDay: {
            type: Number,
            required: true,
            min: 1,
            max: 100000,
        },
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
