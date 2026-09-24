// routes/serviceRoutes.js
// الخدمات الرقمية المدفوعة (مصدر دخل المنصة): تمييز الإعلانات واشتراك Plus.
// السعر يُحدد في الخادم فقط، والتفعيل يتم مرة واحدة بعد التحقق من الدفع لدى البوابة.

const express = require('express');
const Order = require('../models/orderModel');
const Product = require('../models/productModel');
const User = require('../models/userModel');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { requireObjectId } = require('../utils/validators');
const { authenticate } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const { getPaymentProvider } = require('../payments');
const {
    SERVICES, FREE_LISTING_LIMIT, priceBreakdown, publicCatalog,
} = require('../../shared/business');

const router = express.Router();
const DAY_MS = 24 * 60 * 60 * 1000;

function extendFrom(current, days) {
    const base = current && new Date(current).getTime() > Date.now() ? new Date(current).getTime() : Date.now();
    return new Date(base + days * DAY_MS);
}

function shapeOrder(order) {
    return {
        _id: order._id,
        service: order.service,
        title: SERVICES[order.service] ? SERVICES[order.service].title : order.service,
        productId: order.productId || null,
        amount: order.amount,
        netAmount: order.netAmount,
        vatAmount: order.vatAmount,
        currency: order.currency,
        status: order.status,
        createdAt: order.createdAt,
        paidAt: order.paidAt || null,
    };
}

// تفعيل الخدمة مرة واحدة فقط (حتى لو وصل التحقق أكثر من مرة)
async function markPaidAndApply(order) {
    const claimed = await Order.findOneAndUpdate(
        { _id: order._id, appliedAt: null },
        { $set: { status: 'paid', paidAt: new Date(), appliedAt: new Date() } },
        { new: true }
    ).lean();
    if (!claimed) return Order.findById(order._id).lean();

    if (claimed.kind === 'featured' && claimed.productId) {
        const product = await Product.findById(claimed.productId).select('featuredUntil').lean();
        if (product) {
            await Product.updateOne({ _id: product._id }, { $set: { featuredUntil: extendFrom(product.featuredUntil, claimed.days) } });
        }
    } else if (claimed.kind === 'plus') {
        const user = await User.findById(claimed.user).select('plan planUntil').lean();
        const current = user && user.plan === 'plus' ? user.planUntil : null;
        await User.updateOne({ _id: claimed.user }, { $set: { plan: 'plus', planUntil: extendFrom(current, claimed.days) } });
    }
    return claimed;
}

// الكتالوج (عام)
router.get('/', (_req, res) => {
    res.json({
        services: publicCatalog(),
        freeListingLimit: FREE_LISTING_LIMIT,
        paymentsEnabled: Boolean(getPaymentProvider()),
        provider: getPaymentProvider() ? getPaymentProvider().name : null,
    });
});

router.get('/orders', authenticate, asyncHandler(async (req, res) => {
    const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(50).lean();
    res.set('Cache-Control', 'no-store');
    res.json({ items: orders.map(shapeOrder) });
}));

// إنشاء طلب شراء خدمة
router.post('/checkout', authenticate, writeLimiter, asyncHandler(async (req, res) => {
    const provider = getPaymentProvider();
    if (!provider) throw new HttpError(503, 'الخدمات المدفوعة غير متاحة حالياً.');

    const body = req.body || {};
    const key = typeof body.service === 'string' ? body.service : '';
    const service = Object.prototype.hasOwnProperty.call(SERVICES, key) ? SERVICES[key] : null;
    if (!service) throw new HttpError(400, 'الخدمة المطلوبة غير موجودة.');

    let productId;
    let description = service.title;
    if (service.kind === 'featured') {
        productId = requireObjectId(body.productId, 'معرّف الإعلان');
        const product = await Product.findById(productId).select('owner name').lean();
        if (!product) throw new HttpError(404, 'الإعلان غير موجود.');
        if (String(product.owner) !== req.user.id) throw new HttpError(403, 'يمكنك تمييز إعلاناتك فقط.');
        description = `${service.title}: ${product.name}`.slice(0, 250);
    }

    const price = priceBreakdown(service.price);
    const order = await Order.create({
        user: req.user.id,
        service: key,
        kind: service.kind,
        productId,
        days: service.days,
        amount: price.total,
        netAmount: price.net,
        vatAmount: price.vat,
        currency: price.currency,
        provider: provider.name,
    });

    let checkout;
    try {
        checkout = await provider.createCheckout(order, { description });
    } catch (error) {
        await Order.updateOne({ _id: order._id }, { $set: { status: 'failed' } });
        throw error;
    }
    await Order.updateOne({ _id: order._id }, { $set: { providerRef: checkout.providerRef } });

    if (checkout.paidImmediately) {
        const applied = await markPaidAndApply(order);
        return res.status(201).json({ order: shapeOrder(applied), status: 'paid' });
    }
    return res.status(201).json({ order: shapeOrder(order), status: 'pending', redirectUrl: checkout.redirectUrl });
}));

// التحقق من الدفع بعد العودة من بوابة الدفع
router.post('/orders/:id/verify', authenticate, asyncHandler(async (req, res) => {
    const id = requireObjectId(req.params.id, 'معرّف الطلب');
    const order = await Order.findOne({ _id: id, user: req.user.id }).lean();
    if (!order) throw new HttpError(404, 'الطلب غير موجود.');
    if (order.appliedAt) return res.json({ order: shapeOrder(order), status: 'paid' });

    const provider = getPaymentProvider();
    if (!provider || provider.name !== order.provider) throw new HttpError(503, 'تعذر التحقق من الدفع حالياً.');

    const result = await provider.verify({ ...order, providerRef: order.providerRef });
    if (result.paid) {
        const applied = await markPaidAndApply(order);
        return res.json({ order: shapeOrder(applied), status: 'paid' });
    }
    if (result.failed) {
        await Order.updateOne({ _id: order._id, appliedAt: null }, { $set: { status: 'failed' } });
        return res.json({ order: shapeOrder({ ...order, status: 'failed' }), status: 'failed' });
    }
    return res.json({ order: shapeOrder(order), status: 'pending' });
}));

module.exports = router;
