// routes/demoRoutes.js
// مسارات العرض التجريبي — تُفعّل فقط عند تشغيل قاعدة البيانات المدمجة في بيئة التطوير

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireNumber } = require('../utils/validators');
const { writeLimiter } = require('../middleware/security');
const { seedDemoData } = require('../utils/demoSeed');

const router = express.Router();

// إضافة منتجات تجريبية قرب موقع الزائر
router.post('/seed', writeLimiter, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const lat = requireNumber(body.lat, 'lat', { min: -90, max: 90 });
    const lng = requireNumber(body.lng, 'lng', { min: -180, max: 180 });
    const created = await seedDemoData({ lat, lng });
    res.status(created ? 201 : 200).json({ created });
}));

module.exports = router;
