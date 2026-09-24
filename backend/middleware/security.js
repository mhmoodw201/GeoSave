// middleware/security.js
// طبقات الحماية العامة: الترويسات الأمنية، CORS، حماية CSRF، وتحديد معدل الطلبات

const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const HttpError = require('../utils/httpError');

const helmetMiddleware = helmet({
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            fontSrc: ["'self'"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            ...(config.isProduction ? { upgradeInsecureRequests: [] } : {}),
        },
    },
    // HSTS مفيد فقط خلف HTTPS في بيئة الإنتاج
    strictTransportSecurity: config.isProduction ? { maxAge: 15552000, includeSubDomains: true } : false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

function permissionsPolicy(_req, res, next) {
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=(), payment=()');
    next();
}

// CORS مغلق افتراضياً (الواجهة تُخدم من نفس الأصل)، ويمكن فتحه لأصول محددة عبر CORS_ORIGINS
const corsMiddleware = cors({
    origin(origin, callback) {
        if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Requested-With'],
    maxAge: 600,
});

// حماية CSRF: كل طلب يغير البيانات يجب أن يحمل ترويسة مخصصة لا تستطيع النماذج
// العابرة للمواقع إرسالها، إضافة إلى كوكي SameSite=Strict.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
function csrfProtection(req, _res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    if (req.get('X-Requested-With') !== 'GeoSave') {
        return next(new HttpError(403, 'طلب غير مسموح.'));
    }
    return next();
}

function limiter(options) {
    return rateLimit({
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        skip: () => config.isTest,
        handler: (_req, _res, next, opts) => next(new HttpError(opts.statusCode, opts.message)),
        ...options,
    });
}

const apiLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 300, message: 'عدد كبير من الطلبات، حاول لاحقاً.' });
const authLimiter = limiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    message: 'محاولات كثيرة لتسجيل الدخول، حاول بعد 15 دقيقة.',
});
const writeLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 30, message: 'تجاوزت الحد المسموح من العمليات، حاول لاحقاً.' });

module.exports = {
    helmetMiddleware,
    permissionsPolicy,
    corsMiddleware,
    csrfProtection,
    apiLimiter,
    authLimiter,
    writeLimiter,
};
