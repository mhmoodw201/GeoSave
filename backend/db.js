// db.js
// الاتصال بقاعدة البيانات:
//  - إذا وُجد MONGODB_URI نتصل به (Atlas أو خادم محلي).
//  - في بيئة التطوير بدونه نشغّل MongoDB مدمجة تلقائياً وتُحفظ بياناتها في backend/.data
//    حتى تعمل المنصة مباشرة بعد npm install دون أي إعداد.

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const config = require('./config');

const EMBEDDED_DB_PATH = path.join(__dirname, '.data', 'mongo');

async function connectDatabase() {
    if (config.mongoUri) {
        await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
        return { embedded: false, stop: () => mongoose.connection.close() };
    }

    if (config.isProduction) {
        throw new Error('MONGODB_URI must be set in production.');
    }

    let MongoMemoryServer;
    try {
        ({ MongoMemoryServer } = require('mongodb-memory-server'));
    } catch {
        throw new Error('MONGODB_URI is not set and the embedded database is not installed. Run "npm install" (with dev dependencies) or set MONGODB_URI in backend/.env.');
    }

    fs.mkdirSync(EMBEDDED_DB_PATH, { recursive: true });
    const server = await MongoMemoryServer.create({
        instance: { dbPath: EMBEDDED_DB_PATH, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
    });
    await mongoose.connect(server.getUri('geosave'));

    return {
        embedded: true,
        stop: async () => {
            await mongoose.connection.close();
            await server.stop({ doCleanup: false }); // نحتفظ بالبيانات بين مرات التشغيل
        },
    };
}

module.exports = { connectDatabase, EMBEDDED_DB_PATH };
