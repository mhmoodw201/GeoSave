// مسارات الحجوزات

const express = require('express');
const router = express.Router();
const Booking = require('../models/bookingModel');
const Product = require('../models/productModel');


// إضافة حجز جديد
router.post('/', async (req, res) => {
    try {
        const booking = new Booking({
            ...req.body,
        });
        await booking.save();

        const product = await Product.findById(booking.productId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        product.status = 'confirmed';
        await product.save();
        
        res.status(201).json({ message: 'Booking created successfully!', booking });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});


// جلب حجوزات المستخدم
router.get('/my-bookings', async (req, res) => {
    const userId = req.query.userId; // Get userId from query parameter

    try {
        const bookings = await Booking.find({ userId: userId }).populate('productId');
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// إلغاء حجز

router.delete('/del/:bookingId', async (req, res) => {
    try {
        const booking = await Booking.findOneAndDelete({ _id: req.params.bookingId});
        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const product = await Product.findById(booking.productId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        product.status = 'pending';
        await product.save();
        res.json({ message: 'Booking cancelled successfully!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

