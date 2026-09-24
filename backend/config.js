// config.js
// إعدادات التطبيق المركزية — تُقرأ من متغيرات البيئة فقط ولا تُكتب أي أسرار في الكود.

const crypto = require('crypto');
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
    if (!isTest) {
        console.warn('[config] JWT_SECRET is not set; using a random secret. Sessions will be invalidated on restart.');
    }
    return crypto.randomBytes(48).toString('hex');
}

function resolveMongoUri() {
    const uri = process.env.MONGODB_URI;
    if (uri) return uri;
    if (isProduction) throw new Error('MONGODB_URI must be set in production.');
    return 'mongodb://127.0.0.1:27017/geosave';
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
});

module.exports = config;
