// app.js
// بناء تطبيق Express مع جميع طبقات الحماية (منفصل عن server.js لتسهيل الاختبار)

const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const config = require('./config');
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const demoRoutes = require('./routes/demoRoutes');
const {
    helmetMiddleware, permissionsPolicy, corsMiddleware, csrfProtection, apiLimiter,
} = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const HttpError = require('./utils/httpError');

mongoose.set('strictQuery', true);

// يرفض أي مفتاح يبدأ بـ $ أو يحتوي على نقطة (حماية إضافية من حقن NoSQL)
function hasUnsafeKeys(value, depth = 0) {
    if (depth > 10) return true;
    if (Array.isArray(value)) return value.some((item) => hasUnsafeKeys(item, depth + 1));
    if (value && typeof value === 'object') {
        return Object.keys(value).some(
            (key) => key.startsWith('$') || key.includes('.') || hasUnsafeKeys(value[key], depth + 1)
        );
    }
    return false;
}

function rejectUnsafeInput(req, _res, next) {
    if (hasUnsafeKeys(req.body) || hasUnsafeKeys(req.query)) {
        return next(new HttpError(400, 'مدخلات غير صالحة.'));
    }
    return next();
}

/**
 * @param {{ demo?: boolean }} [options] demo: تفعيل مسارات العرض التجريبي (قاعدة البيانات المدمجة فقط)
 */
function createApp({ demo = false } = {}) {
    const app = express();

    app.disable('x-powered-by');
    app.set('trust proxy', config.trustProxy);
    app.set('query parser', 'simple'); // لا كائنات متداخلة في الاستعلام

    app.use(helmetMiddleware);
    app.use(permissionsPolicy);

    // ---- API ----
    const api = express.Router();
    api.use(corsMiddleware);
    api.use(apiLimiter);
    api.use(express.json({ limit: '20kb' }));
    api.use(cookieParser());
    api.use(csrfProtection);
    api.use(rejectUnsafeInput);

    api.get('/health', (_req, res) => {
        res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'up' : 'down', demo });
    });
    if (demo && !config.isProduction) {
        api.use('/demo', demoRoutes);
    }
    api.use('/auth', authRoutes);
    api.use('/products', productRoutes);
    api.use('/bookings', bookingRoutes);
    api.use(notFound);

    app.use('/api', api);

    // ---- الصور المرفوعة ----
    app.use('/uploads', express.static(config.uploadDir, {
        dotfiles: 'deny',
        index: false,
        maxAge: '7d',
        immutable: true,
        setHeaders(res) {
            res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
        },
    }));

    // ---- الواجهة الأمامية ----
    app.use(express.static(config.frontendDir, {
        dotfiles: 'deny',
        extensions: ['html'],
        maxAge: config.isProduction ? '1h' : 0,
    }));

    app.use(notFound);
    app.use(errorHandler);

    return app;
}

module.exports = { createApp, hasUnsafeKeys };
