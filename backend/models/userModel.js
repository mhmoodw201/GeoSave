// models/userModel.js
// نموذج المستخدم

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 60,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
            maxlength: 254,
        },
        password: {
            type: String,
            required: true,
            select: false, // لا يُعاد الهاش في أي استعلام إلا عند طلبه صراحةً
        },
        role: {
            type: String,
            enum: ['user', 'admin'],
            default: 'user',
        },
        // الموافقة على شروط الاستخدام وسياسة الخصوصية (إثبات قانوني بالتاريخ والإصدار)
        termsAcceptedAt: Date,
        termsVersion: String,
        // التقييمات: نخزن المجموع والعدد ونحسب المتوسط عند العرض (تحديث ذري بـ $inc)
        ratingSum: { type: Number, default: 0, min: 0 },
        ratingCount: { type: Number, default: 0, min: 0 },
        // الباقة المدفوعة
        plan: { type: String, enum: ['free', 'plus'], default: 'free' },
        planUntil: Date,
    },
    { timestamps: true }
);

userSchema.set('toJSON', {
    transform(_doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model('User', userSchema);
