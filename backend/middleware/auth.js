// middleware/auth.js
// التحقق من هوية المستخدم عبر رمز JWT مخزّن في كوكي HttpOnly

const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/userModel');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');

const JWT_ALGORITHM = 'HS256';

function signToken(user) {
    return jwt.sign({ sub: String(user._id) }, config.jwtSecret, {
        algorithm: JWT_ALGORITHM,
        expiresIn: config.sessionTtlSeconds,
    });
}

function cookieOptions() {
    return {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'strict',
        path: '/',
    };
}

function setAuthCookie(res, user) {
    res.cookie(config.authCookieName, signToken(user), {
        ...cookieOptions(),
        maxAge: config.sessionTtlSeconds * 1000,
    });
}

function clearAuthCookie(res) {
    res.clearCookie(config.authCookieName, cookieOptions());
}

async function resolveUser(req) {
    const token = req.cookies?.[config.authCookieName];
    if (!token) return null;

    let payload;
    try {
        payload = jwt.verify(token, config.jwtSecret, { algorithms: [JWT_ALGORITHM] });
    } catch {
        return null;
    }
    if (!payload || typeof payload.sub !== 'string') return null;

    return User.findById(payload.sub).lean();
}

// يتطلب مستخدماً مسجلاً
const authenticate = asyncHandler(async (req, res, next) => {
    const user = await resolveUser(req);
    if (!user) {
        clearAuthCookie(res);
        throw new HttpError(401, 'يجب تسجيل الدخول أولاً.');
    }
    req.user = { id: String(user._id), name: user.name, email: user.email, role: user.role || 'user' };
    next();
});

// يضيف المستخدم إن وُجد دون أن يفرض تسجيل الدخول
const optionalAuth = asyncHandler(async (req, _res, next) => {
    const user = await resolveUser(req);
    if (user) {
        req.user = { id: String(user._id), name: user.name, email: user.email, role: user.role || 'user' };
    }
    next();
});

module.exports = { authenticate, optionalAuth, setAuthCookie, clearAuthCookie, signToken };
