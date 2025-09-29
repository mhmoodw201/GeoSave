// // // routes/productRoutes.js
// مسارات المنتجات
const express = require('express');
const router = express.Router();
const Product = require('../models/productModel'); // استيراد مودياز
const Booking = require('../models/bookingModel');
const userModel = require('../models/userModel');
const multer = require('multer');


// إعداد Multer لتخزين الصور محليًا
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // مسار مجلد التخزين
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname); // اسم فريد للصورة
    }
});

const upload = multer({ storage });



// إضافة منتج جديد
router.post('/products',upload.single('image'), async (req, res) => {
    // 
    try {
        
        // التأكد من أن جميع الحقول المطلوبة موجودة
        const { name, description, pricePerDay, latitude, longitude, owner, phoneNumber } = req.body;
        if (!req.file) {
            return res.status(400).json({ error: 'Image file is required.' });
        }
        const image = `uploads/${req.file.filename}`; // الحصول على المسار الصحيح للصورة

        // إنشاء المنتج وتخزينه في قاعدة البيانات
        const product = new Product({ name, description, pricePerDay, latitude, longitude, image, owner, phoneNumber });
        await product.save();

        return res.json({name, description: description})

    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ error: 'An error occurred while adding the product. Please try again later.' });
    }

});

module.exports = router;



// جلب جميع المنتجات
router.get('/products', async (req, res) => {
    try {
        const products = await Product.find().populate('owner', 'name');

        res.json(products);
    } catch (error) {
        res.status(500).json({ error: error.message });
        
    }
});



// جلب منتجات المستخدم المسجل
router.get('/my-products', async (req, res) => {
    try {
        const userId = req.query.userId; // Get userId from query parameter

        const products = await Product.find({ owner: userId });
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// حذف منتج
router.post('/products/:id', async (req, res) => {
    try {
        const product = await Product.findOneAndDelete({ _id: req.params.id });
        if (!product) {
            return res.status(404).json({ error: 'Product not found or not authorized to delete.' });
        }

        const booking = await Booking.findOneAndDelete({ productId: req.params.id});
        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }
        res.json({ message: 'Product deleted successfully!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;