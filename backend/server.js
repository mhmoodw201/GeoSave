// server.js
// هنا ببدء تشغيل السيرفر والاتصال بقاعدة البيانات 

const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const cors = require("cors")
const path = require('path');
const app = express();

app.use(cors())


// إعداد الاتصال بقاعدة البيانات
mongoose.connect('mongodb+srv://mhmoodw201:b7z4kN5YkC5D1P4h@cluster0.lhl76.mongodb.net/geosave', {
    // useNewUrlParser: true,
    // useUnifiedTopology: true,
    
}).then(() => console.log('Connected to MongoDB'))
    .catch((error) => console.error('MongoDB connection error:', error));

// إعداد الجلسات
app.use(session({
    secret: 'mySecretKey', // مفتاح سري لتشفير الجلسات
    resave: false,
    saveUninitialized: false,
}));


// معالجة بيانات JSON
app.use(express.json());

// استخدام الـRoutes
app.use(userRoutes);
app.use(productRoutes);
app.use('/bookings', bookingRoutes);


// الصور المخزنة في مجلد uploads/ 
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// بدء تشغيل السيرفر
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

