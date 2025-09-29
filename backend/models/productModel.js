// models/productModel.js

const mongoose = require('mongoose');

// تعريف مخطط المنتج
const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: false,
        trim: true
    },
    description: {
        type: String,
        required: false,
        trim: true
    },
    pricePerDay: {
        type: Number,
        required: false
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    longitude: {
        type: Number,
        required: false
    },
    latitude: {
        type: Number,
        required: false
    },
    image: {
        type: String,
        required: false
    },
    phoneNumber: {
        type: Number,
        required: true,
    },
    status: {
            type: String,
            enum: ['pending', 'confirmed'],
            default: 'pending'
        },
    
});

// تصدير النموذج
module.exports = mongoose.model('Product', productSchema);