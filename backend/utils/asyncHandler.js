// utils/asyncHandler.js
// يمرر أخطاء الدوال غير المتزامنة إلى معالج الأخطاء المركزي

module.exports = function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
};
