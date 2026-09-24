// middleware/errorHandler.js
// معالج أخطاء مركزي — لا يكشف تفاصيل داخلية أو Stack Trace للعميل

const multer = require('multer');
const mongoose = require('mongoose');
const HttpError = require('../utils/httpError');

function notFound(req, _res, next) {
    next(new HttpError(404, 'المسار غير موجود.'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
    let status = 500;
    let message = 'حدث خطأ غير متوقع، حاول لاحقاً.';

    if (err instanceof HttpError) {
        status = err.status;
        message = err.message;
    } else if (err instanceof multer.MulterError) {
        status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        message = err.code === 'LIMIT_FILE_SIZE' ? 'حجم الصورة أكبر من المسموح.' : 'ملف مرفوع غير صالح.';
    } else if (err instanceof mongoose.Error.ValidationError) {
        status = 400;
        message = 'البيانات المرسلة غير صحيحة.';
    } else if (err instanceof mongoose.Error.CastError) {
        status = 400;
        message = 'معرّف غير صالح.';
    } else if (err && err.code === 11000) {
        status = 409;
        message = 'السجل موجود مسبقاً.';
    } else if (err && err.type === 'entity.too.large') {
        status = 413;
        message = 'حجم الطلب كبير جداً.';
    } else if (err && err.type === 'entity.parse.failed') {
        status = 400;
        message = 'صيغة JSON غير صحيحة.';
    }

    if (status >= 500) {
        console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
    }

    res.status(status).json({ error: message });
}

module.exports = { notFound, errorHandler };
