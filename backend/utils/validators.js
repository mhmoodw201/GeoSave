// utils/validators.js
// دوال تحقق صارمة من المدخلات — كل قيمة يجب أن تكون من النوع المتوقع
// (يمنع حقن استعلامات NoSQL مثل {"$ne": null} لأن الكائنات تُرفض)

const mongoose = require('mongoose');
const HttpError = require('./httpError');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function requireString(value, field, { min = 1, max = 255, trim = true } = {}) {
    if (typeof value !== 'string') {
        throw new HttpError(400, `الحقل "${field}" مطلوب.`);
    }
    const result = trim ? value.trim() : value;
    if (result.length < min) {
        throw new HttpError(400, `الحقل "${field}" يجب أن يكون ${min} أحرف على الأقل.`);
    }
    if (result.length > max) {
        throw new HttpError(400, `الحقل "${field}" يجب ألا يتجاوز ${max} حرفاً.`);
    }
    return result;
}

function requireEmail(value) {
    const email = requireString(value, 'البريد الإلكتروني', { max: 254 }).toLowerCase();
    if (!EMAIL_RE.test(email)) {
        throw new HttpError(400, 'صيغة البريد الإلكتروني غير صحيحة.');
    }
    return email;
}

function requirePassword(value) {
    if (typeof value !== 'string' || value.length < 8) {
        throw new HttpError(400, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
    }
    // bcrypt يتجاهل ما بعد 72 بايت، لذا نرفض الكلمات الأطول لتجنب الالتباس
    if (Buffer.byteLength(value, 'utf8') > 72) {
        throw new HttpError(400, 'كلمة المرور طويلة جداً (الحد الأقصى 72 بايت).');
    }
    if (!/[A-Za-z؀-ۿ]/.test(value) || !/\d/.test(value)) {
        throw new HttpError(400, 'كلمة المرور يجب أن تحتوي على حروف وأرقام.');
    }
    return value;
}

function requireNumber(value, field, { min = -Infinity, max = Infinity } = {}) {
    if (typeof value !== 'number' && typeof value !== 'string') {
        throw new HttpError(400, `الحقل "${field}" مطلوب.`);
    }
    if (typeof value === 'string' && value.trim() === '') {
        throw new HttpError(400, `الحقل "${field}" مطلوب.`);
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) {
        throw new HttpError(400, `قيمة الحقل "${field}" غير صحيحة.`);
    }
    return number;
}

function optionalNumber(value, field, options) {
    if (value === undefined || value === '') return undefined;
    return requireNumber(value, field, options);
}

// يحوّل رقم الجوال إلى صيغة دولية بالأرقام فقط (مناسبة لروابط wa.me)
function normalizePhone(value) {
    if (typeof value !== 'string' && typeof value !== 'number') {
        throw new HttpError(400, 'رقم الجوال مطلوب.');
    }
    let digits = String(value).replace(/[\s\-()]/g, '');
    if (digits.startsWith('+')) digits = digits.slice(1);
    else if (digits.startsWith('00')) digits = digits.slice(2);
    else if (/^05\d{8}$/.test(digits)) digits = `966${digits.slice(1)}`;
    else if (/^5\d{8}$/.test(digits)) digits = `966${digits}`;

    if (!/^[1-9]\d{7,14}$/.test(digits)) {
        throw new HttpError(400, 'رقم الجوال غير صحيح. مثال: 05XXXXXXXX أو 9665XXXXXXXX');
    }
    return digits;
}

function requireObjectId(value, field = 'المعرّف') {
    if (typeof value !== 'string' || !mongoose.isValidObjectId(value) || !/^[a-f\d]{24}$/i.test(value)) {
        throw new HttpError(400, `${field} غير صالح.`);
    }
    return value;
}

module.exports = {
    requireString,
    requireEmail,
    requirePassword,
    requireNumber,
    optionalNumber,
    normalizePhone,
    requireObjectId,
};
