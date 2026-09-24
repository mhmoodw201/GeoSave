// server.js
// نقطة تشغيل الخادم: الاتصال بقاعدة البيانات ثم بدء الاستماع

const config = require('./config');
const { connectDatabase } = require('./db');
const { createApp } = require('./app');
require('./models/userModel');
require('./models/productModel');
require('./models/bookingModel');
require('./models/reviewModel');
require('./models/orderModel');

async function start() {
    let database;
    try {
        database = await connectDatabase();
        console.log(database.embedded
            ? 'Connected to the embedded MongoDB (data saved in backend/.data)'
            : 'Connected to MongoDB');
    } catch (error) {
        console.error('Database connection error:', error.message);
        process.exit(1);
    }

    // مزامنة الفهارس مع المخططات (مثل الفهرس الفريد الجزئي للحجوزات النشطة)
    try {
        await Promise.all(['User', 'Product', 'Booking', 'Review', 'Order']
            .map((name) => require('mongoose').model(name).syncIndexes()));
    } catch (error) {
        console.error('Index sync failed:', error.message);
        process.exit(1);
    }

    if (database.embedded) {
        const { seedDemoData } = require('./utils/demoSeed');
        const { DEMO_PASSWORD, DEMO_USERS } = require('../shared/demo-data');
        const created = await seedDemoData();
        if (created) console.log(`Demo data created (${created} products around Riyadh).`);
        console.log(`Demo login: ${DEMO_USERS[0].email} / ${DEMO_PASSWORD}`);
    }

    const app = createApp({ demo: database.embedded });
    const server = app.listen(config.port, () => {
        console.log(`GeoSave is running on http://localhost:${config.port}`);
    });

    const shutdown = (signal) => {
        console.log(`${signal} received, shutting down...`);
        server.close(async () => {
            await database.stop();
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
