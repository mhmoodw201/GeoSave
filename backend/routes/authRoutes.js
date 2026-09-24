// routes/authRoutes.js
// مسارات التسجيل وتسجيل الدخول والخروج وبيانات الحساب

const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/userModel');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { requireString, requireEmail, requirePassword } = require('../utils/validators');
const { optionalAuth, setAuthCookie, clearAuthCookie } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');

const router = express.Router();
const BCRYPT_ROUNDS = 12;
// هاش وهمي يُستخدم عند عدم وجود البريد حتى يبقى زمن الاستجابة متساوياً (يمنع كشف الحسابات)
const DUMMY_HASH = bcrypt.hashSync('geosave-dummy-password', BCRYPT_ROUNDS);

function publicUser(user) {
    return { id: String(user._id), name: user.name, email: user.email, role: user.role || 'user' };
}

// تسجيل مستخدم جديد
router.post('/register', authLimiter, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const name = requireString(body.name, 'الاسم', { min: 2, max: 60 });
    const email = requireEmail(body.email);
    const password = requirePassword(body.password);

    if (await User.exists({ email })) {
        throw new HttpError(409, 'هذا البريد الإلكتروني مسجل مسبقاً.');
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    let user;
    try {
        user = await User.create({ name, email, password: hashedPassword });
    } catch (error) {
        if (error && error.code === 11000) throw new HttpError(409, 'هذا البريد الإلكتروني مسجل مسبقاً.');
        throw error;
    }

    setAuthCookie(res, user);
    res.status(201).json({ user: publicUser(user) });
}));

// تسجيل الدخول
router.post('/login', authLimiter, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const email = requireEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';

    const user = await User.findOne({ email }).select('+password').lean();
    const valid = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);

    if (!user || !valid) {
        throw new HttpError(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
    }

    setAuthCookie(res, user);
    res.json({ user: publicUser(user) });
}));

// تسجيل الخروج
router.post('/logout', (_req, res) => {
    clearAuthCookie(res);
    res.json({ message: 'تم تسجيل الخروج.' });
});

// بيانات المستخدم الحالي (user = null للزائر)
router.get('/me', optionalAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ user: req.user || null });
});

module.exports = router;
