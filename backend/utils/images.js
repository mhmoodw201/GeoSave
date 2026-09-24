// utils/images.js
// معالجة الصور المرفوعة: التحقق من أنها صورة حقيقية، تصغيرها، إزالة البيانات الوصفية
// (مثل إحداثيات GPS في EXIF) وإعادة ترميزها بصيغة WebP باسم عشوائي.

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const config = require('../config');
const HttpError = require('./httpError');

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif']);
const MAX_DIMENSION = 1280;

async function saveProductImage(buffer) {
    let metadata;
    try {
        metadata = await sharp(buffer).metadata();
    } catch {
        throw new HttpError(400, 'الملف المرفوع ليس صورة صالحة.');
    }
    if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
        throw new HttpError(400, 'صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP.');
    }
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > 40_000_000) {
        throw new HttpError(400, 'أبعاد الصورة غير مدعومة.');
    }

    const fileName = `${crypto.randomUUID()}.webp`;
    await fs.mkdir(config.uploadDir, { recursive: true });

    try {
        await sharp(buffer, { limitInputPixels: 40_000_000 })
            .rotate() // يطبق اتجاه EXIF قبل حذفه
            .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(path.join(config.uploadDir, fileName));
    } catch {
        throw new HttpError(400, 'تعذرت معالجة الصورة.');
    }

    return `uploads/${fileName}`;
}

// يحذف صورة منتج بأمان — يقبل فقط الأسماء التي أنشأها الخادم داخل مجلد الرفع
async function deleteProductImage(imagePath) {
    if (typeof imagePath !== 'string') return;
    const fileName = path.basename(imagePath);
    if (!/^[\w.-]+$/.test(fileName)) return;
    try {
        await fs.unlink(path.join(config.uploadDir, fileName));
    } catch (error) {
        if (error.code !== 'ENOENT') console.error('[images] failed to delete image:', error.message);
    }
}

module.exports = { saveProductImage, deleteProductImage };
