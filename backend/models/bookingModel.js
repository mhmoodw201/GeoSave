// models/bookingModel.js

const mongoose = require('mongoose');

// تعريف مخطط الحجز
const bookingSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
    // ,owner: {
    //     type: mongoose.Schema.Types.ObjectId,
    //     ref: 'User',
    //     required: false
    //     // type: String,
    //     // required: false
    // }
    
});

// تصدير النموذج
module.exports = mongoose.model('Booking', bookingSchema);
