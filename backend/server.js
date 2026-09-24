// server.js
// نقطة تشغيل الخادم: الاتصال بقاعدة البيانات ثم بدء الاستماع

const mongoose = require('mongoose');
const config = require('./config');
const { createApp } = require('./app');

async function start() {
    try {
        await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('MongoDB connection error:', error.message);
        process.exit(1);
    }

    const app = createApp();
    const server = app.listen(config.port, () => {
        console.log(`GeoSave is running on http://localhost:${config.port}`);
    });

    const shutdown = (signal) => {
        console.log(`${signal} received, shutting down...`);
        server.close(async () => {
            await mongoose.connection.close();
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
