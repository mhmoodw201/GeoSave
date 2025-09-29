
const mongoose = require('mongoose');

// تعريف مخطط المستخدم
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
    }
    
});

// تصدير النموذج
module.exports = mongoose.model('User', userSchema);
