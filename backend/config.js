// config.js
// إعدادات التطبيق المركزية — تُقرأ من متغيرات البيئة فقط ولا تُكتب أي أسرار في الكود.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';
const isTest = env === 'test';

function parseList(value) {
    return (value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function resolveJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (secret && secret.length >= 32) return secret;

    if (isProduction) {
        throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
    }
    if (secret) {
        console.warn('[config] JWT_SECRET is shorter than 32 characters; using it only because NODE_ENV is not production.');
        return secret;
    }
    if (isTest) return crypto.randomBytes(48).toString('hex');

    // بيئة التطوير: نولّد مفتاحاً عشوائياً مرة واحدة ونحفظه محلياً (backend/.data مستثنى من git)
    // حتى لا تنتهي الجلسات عند كل إعادة تشغيل
    const secretFile = path.join(__dirname, '.data', 'dev-jwt-secret');
    try {
        const saved = fs.readFileSync(secretFile, 'utf8').trim();
        if (saved.length >= 32) return saved;
    } catch { /* الملف غير موجود بعد */ }
    const generated = crypto.randomBytes(48).toString('hex');
    try {
        fs.mkdirSync(path.dirname(secretFile), { recursive: true });
        fs.writeFileSync(secretFile, generated, { mode: 0o600 });
    } catch {
        console.warn('[config] Could not save the development JWT secret; sessions will reset on restart.');
    }
    return generated;
}

// بدون MONGODB_URI في بيئة التطوير تُستخدم قاعدة بيانات مدمجة (انظر db.js)
function resolveMongoUri() {
    const uri = process.env.MONGODB_URI;
    if (uri) return uri;
    if (isProduction) throw new Error('MONGODB_URI must be set in production.');
    return null;
}

// مزود الدفع للخدمات الرقمية: mock (محاكاة للتطوير فقط) | moyasar (بوابة مرخّصة من ساما) | none
function resolvePayments() {
    const provider = (process.env.PAYMENT_PROVIDER || (isProduction ? 'none' : 'mock')).toLowerCase();
    if (!['mock', 'moyasar', 'none'].includes(provider)) {
        throw new Error(`Unknown PAYMENT_PROVIDER "${provider}". Use mock, moyasar or none.`);
    }
    if (provider === 'mock' && isProduction) {
        throw new Error('PAYMENT_PROVIDER=mock is not allowed in production.');
    }
    const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
    const moyasarSecretKey = process.env.MOYASAR_SECRET_KEY || '';
    if (provider === 'moyasar' && (!moyasarSecretKey || !/^https:\/\//.test(publicUrl))) {
        throw new Error('PAYMENT_PROVIDER=moyasar requires MOYASAR_SECRET_KEY and an https PUBLIC_URL.');
    }
    return { provider, publicUrl, moyasarSecretKey };
}

const config = Object.freeze({
    env,
    isProduction,
    isTest,
    port: Number.parseInt(process.env.PORT, 10) || 5000,
    mongoUri: resolveMongoUri(),
    jwtSecret: resolveJwtSecret(),
    sessionTtlSeconds: Math.round((Number.parseFloat(process.env.SESSION_DAYS) || 7) * 24 * 60 * 60),
    corsOrigins: parseList(process.env.CORS_ORIGINS),
    trustProxy: Number.parseInt(process.env.TRUST_PROXY, 10) || 0,
    maxUploadBytes: (Number.parseFloat(process.env.MAX_UPLOAD_MB) || 5) * 1024 * 1024,
    uploadDir: path.join(__dirname, 'uploads'),
    frontendDir: path.join(__dirname, '..', 'frontend'),
    authCookieName: 'geosave_token',
    defaultRadiusKm: 5,
    maxRadiusKm: 50,
    payments: Object.freeze(resolvePayments()),
});

module.exports = config;
