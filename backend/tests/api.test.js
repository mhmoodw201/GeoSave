// tests/api.test.js
// اختبارات الواجهة البرمجية والحماية — تعمل دون قاعدة بيانات عبر محاكاة دوال النماذج

process.env.NODE_ENV = 'test';

const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const request = require('supertest');
const sharp = require('sharp');

const config = require('../config');
const { createApp } = require('../app');
const { signToken } = require('../middleware/auth');
const User = require('../models/userModel');
const Product = require('../models/productModel');
const Booking = require('../models/bookingModel');

const app = createApp();
const HEADERS = { 'X-Requested-With': 'GeoSave' };

const alice = { _id: new mongoose.Types.ObjectId(), name: 'Alice', email: 'alice@example.com', role: 'user' };
const bob = { _id: new mongoose.Types.ObjectId(), name: 'Bob', email: 'bob@example.com', role: 'user' };
const admin = { _id: new mongoose.Types.ObjectId(), name: 'Admin', email: 'admin@example.com', role: 'admin' };
const users = new Map([alice, bob, admin].map((u) => [String(u._id), u]));

// كائن استعلام وهمي يدعم السلاسل الشائعة في Mongoose
function query(value) {
    const q = {
        select: () => q,
        sort: () => q,
        populate: () => q,
        lean: async () => value,
        then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
    };
    return q;
}

function cookieFor(user) {
    return `${config.authCookieName}=${signToken(user)}`;
}

beforeEach(() => {
    // المصادقة تقرأ المستخدم من قاعدة البيانات في كل طلب
    mock.method(User, 'findById', (id) => query(users.get(String(id)) || null));
});

afterEach(() => {
    mock.restoreAll();
});

describe('security baseline', () => {
    test('sets security headers and hides the framework', async () => {
        const res = await request(app).get('/api/health');
        assert.equal(res.status, 200);
        assert.equal(res.headers['x-powered-by'], undefined);
        assert.match(res.headers['content-security-policy'], /default-src 'self'/);
        assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
        assert.equal(res.headers['x-content-type-options'], 'nosniff');
        assert.ok(res.headers['permissions-policy']);
    });

    test('serves the frontend with a strict CSP', async () => {
        const res = await request(app).get('/');
        assert.equal(res.status, 200);
        assert.match(res.text, /<html lang="ar" dir="rtl">/);
        assert.match(res.headers['content-security-policy'], /script-src 'self'/);
    });

    test('rejects state-changing requests without the anti-CSRF header', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: 'a@b.co', password: 'x' });
        assert.equal(res.status, 403);
    });

    test('rejects Mongo operator injection in the body', async () => {
        const res = await request(app).post('/api/auth/login').set(HEADERS)
            .send({ email: { $ne: null }, password: { $ne: null } });
        assert.equal(res.status, 400);
    });

    test('rejects nested query objects', async () => {
        const res = await request(app).get('/api/products?lat[$gt]=1&lng=2');
        assert.equal(res.status, 400);
    });

    test('does not allow cross-origin credentialed requests from unknown origins', async () => {
        const res = await request(app).get('/api/health').set('Origin', 'https://evil.example');
        assert.equal(res.headers['access-control-allow-origin'], undefined);
    });

    test('blocks path traversal on uploads', async () => {
        const res = await request(app).get('/uploads/..%2fserver.js');
        assert.notEqual(res.status, 200);
        assert.doesNotMatch(res.text || '', /mongoose/);
    });

    test('rejects oversized JSON bodies', async () => {
        const res = await request(app).post('/api/auth/login').set(HEADERS)
            .send({ email: 'a@b.co', password: 'x'.repeat(30 * 1024) });
        assert.equal(res.status, 413);
    });

    test('unknown API routes return JSON 404', async () => {
        const res = await request(app).get('/api/nope');
        assert.equal(res.status, 404);
        assert.ok(res.body.error);
    });
});

describe('auth', () => {
    test('register validates input', async () => {
        const res = await request(app).post('/api/auth/register').set(HEADERS)
            .send({ name: 'A', email: 'bad', password: 'short' });
        assert.equal(res.status, 400);
    });

    test('register rejects weak passwords', async () => {
        const res = await request(app).post('/api/auth/register').set(HEADERS)
            .send({ name: 'Alice', email: 'alice@example.com', password: 'onlyletters' });
        assert.equal(res.status, 400);
    });

    test('register rejects duplicate email', async () => {
        mock.method(User, 'exists', async () => ({ _id: alice._id }));
        const res = await request(app).post('/api/auth/register').set(HEADERS)
            .send({ name: 'Alice', email: 'ALICE@example.com', password: 'secret123' });
        assert.equal(res.status, 409);
    });

    test('register creates a user, never returns the hash, and sets a secure cookie', async () => {
        mock.method(User, 'exists', async () => null);
        let saved;
        mock.method(User, 'create', async (doc) => {
            saved = doc;
            return { _id: new mongoose.Types.ObjectId(), role: 'user', ...doc };
        });
        const res = await request(app).post('/api/auth/register').set(HEADERS)
            .send({ name: 'Alice', email: 'Alice@Example.com', password: 'secret123', role: 'admin' });

        assert.equal(res.status, 201);
        assert.equal(saved.email, 'alice@example.com');
        assert.equal(saved.role, undefined, 'role must not be mass-assignable');
        assert.notEqual(saved.password, 'secret123');
        assert.ok(await bcrypt.compare('secret123', saved.password));
        assert.equal(res.body.user.password, undefined);
        assert.equal(res.body.user.role, 'user');
        const cookie = res.headers['set-cookie'][0];
        assert.match(cookie, /HttpOnly/);
        assert.match(cookie, /SameSite=Strict/);
        assert.equal(res.body.token, undefined, 'token must not be exposed to JavaScript');
    });

    test('login uses the same error for unknown email and wrong password', async () => {
        const hash = await bcrypt.hash('secret123', 4);
        mock.method(User, 'findOne', ({ email }) => query(email === 'alice@example.com' ? { ...alice, password: hash } : null));

        const wrong = await request(app).post('/api/auth/login').set(HEADERS).send({ email: 'alice@example.com', password: 'nope' });
        const unknown = await request(app).post('/api/auth/login').set(HEADERS).send({ email: 'ghost@example.com', password: 'nope' });
        assert.equal(wrong.status, 401);
        assert.equal(unknown.status, 401);
        assert.equal(wrong.body.error, unknown.body.error);

        const ok = await request(app).post('/api/auth/login').set(HEADERS).send({ email: 'alice@example.com', password: 'secret123' });
        assert.equal(ok.status, 200);
        assert.equal(ok.body.user.name, 'Alice');
        assert.match(ok.headers['set-cookie'][0], new RegExp(`^${config.authCookieName}=`));
    });

    test('/me returns the user only for a valid token', async () => {
        assert.equal((await request(app).get('/api/auth/me')).body.user, null);
        assert.equal((await request(app).get('/api/auth/me').set('Cookie', `${config.authCookieName}=garbage`)).body.user, null);

        const res = await request(app).get('/api/auth/me').set('Cookie', cookieFor(alice));
        assert.equal(res.status, 200);
        assert.equal(res.body.user.email, 'alice@example.com');
        assert.equal(res.body.user.password, undefined);
    });

    test('rejects tokens signed with another secret or algorithm', async () => {
        const jwt = require('jsonwebtoken');
        const forged = jwt.sign({ sub: String(admin._id) }, 'not-the-secret');
        const none = jwt.sign({ sub: String(admin._id) }, '', { algorithm: 'none' });
        for (const token of [forged, none]) {
            const res = await request(app).get('/api/auth/me').set('Cookie', `${config.authCookieName}=${token}`);
            assert.equal(res.body.user, null);
            assert.equal((await request(app).get('/api/products/mine').set('Cookie', `${config.authCookieName}=${token}`)).status, 401);
        }
    });

    test('logout clears the cookie', async () => {
        const res = await request(app).post('/api/auth/logout').set(HEADERS);
        assert.equal(res.status, 200);
        assert.match(res.headers['set-cookie'][0], /Expires=Thu, 01 Jan 1970/);
    });
});

describe('products', () => {
    test('search validates coordinates and radius', async () => {
        assert.equal((await request(app).get('/api/products')).status, 400);
        assert.equal((await request(app).get('/api/products?lat=100&lng=10')).status, 400);
        assert.equal((await request(app).get('/api/products?lat=24.7&lng=46.6&radius=5000')).status, 400);
    });

    test('search runs a geospatial query and hides private fields', async () => {
        let pipeline;
        mock.method(Product, 'aggregate', async (p) => {
            pipeline = p;
            return [{ _id: 'x', name: 'Tent', distance: 120 }];
        });
        const res = await request(app).get('/api/products?lat=24.7&lng=46.6&radius=3&q=te.nt(');
        assert.equal(res.status, 200);
        assert.equal(res.body.items.length, 1);
        const geo = pipeline[0].$geoNear;
        assert.deepEqual(geo.near.coordinates, [46.6, 24.7]);
        assert.equal(geo.maxDistance, 3000);
        assert.equal(geo.query.name.$regex, 'te\\.nt\\(', 'search text must be regex-escaped');
        const projection = pipeline.find((stage) => stage.$project).$project;
        assert.equal(projection.phoneNumber, undefined);
        assert.equal(projection.location, undefined);
    });

    test('creating a product requires authentication', async () => {
        const res = await request(app).post('/api/products').set(HEADERS).field('name', 'Tent');
        assert.equal(res.status, 401);
    });

    test('creating a product rejects non-image uploads', async () => {
        const res = await request(app).post('/api/products').set(HEADERS).set('Cookie', cookieFor(alice))
            .field('name', 'Tent').field('description', 'A nice tent').field('pricePerDay', '50')
            .field('latitude', '24.7').field('longitude', '46.6').field('phoneNumber', '0512345678')
            .attach('image', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });
        assert.equal(res.status, 400);
    });

    test('creating a product re-encodes the image and takes the owner from the session', async () => {
        const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#0f766e' } }).png().toBuffer();
        let saved;
        mock.method(Product, 'create', async (doc) => {
            saved = doc;
            return { _id: new mongoose.Types.ObjectId(), ...doc };
        });

        const res = await request(app).post('/api/products').set(HEADERS).set('Cookie', cookieFor(alice))
            .field('name', 'Tent').field('description', 'A nice tent').field('pricePerDay', '50')
            .field('latitude', '24.7').field('longitude', '46.6').field('phoneNumber', '0512345678')
            .field('owner', String(bob._id))
            .attach('image', png, { filename: '../../evil.png', contentType: 'image/png' });

        try {
            assert.equal(res.status, 201, JSON.stringify(res.body));
            assert.equal(String(saved.owner), String(alice._id));
            assert.equal(saved.phoneNumber, '966512345678');
            assert.deepEqual(saved.location.coordinates, [46.6, 24.7]);
            assert.match(saved.image, /^uploads\/[0-9a-f-]{36}\.webp$/);
            assert.ok(fs.existsSync(path.join(config.uploadDir, path.basename(saved.image))));
        } finally {
            if (saved) fs.rmSync(path.join(config.uploadDir, path.basename(saved.image)), { force: true });
        }
    });

    test('only the owner or an admin can delete a product', async () => {
        const product = { _id: new mongoose.Types.ObjectId(), owner: alice._id, image: 'uploads/missing.webp' };
        mock.method(Product, 'findById', () => query(product));
        const deleteOne = mock.method(Product, 'deleteOne', async () => ({ deletedCount: 1 }));
        mock.method(Booking, 'deleteMany', async () => ({ deletedCount: 0 }));

        const url = `/api/products/${product._id}`;
        assert.equal((await request(app).delete(url).set(HEADERS).set('Cookie', cookieFor(bob))).status, 403);
        assert.equal(deleteOne.mock.callCount(), 0);
        assert.equal((await request(app).delete(url).set(HEADERS).set('Cookie', cookieFor(alice))).status, 200);
        assert.equal((await request(app).delete(url).set(HEADERS).set('Cookie', cookieFor(admin))).status, 200);
    });

    test('invalid ids are rejected', async () => {
        const res = await request(app).delete('/api/products/not-an-id').set(HEADERS).set('Cookie', cookieFor(alice));
        assert.equal(res.status, 400);
    });
});

describe('bookings', () => {
    const productId = new mongoose.Types.ObjectId();

    test('requires authentication', async () => {
        assert.equal((await request(app).post('/api/bookings').set(HEADERS).send({ productId: String(productId) })).status, 401);
        assert.equal((await request(app).get('/api/bookings/mine')).status, 401);
    });

    test('cannot book your own product', async () => {
        mock.method(Product, 'findOneAndUpdate', () => query(null));
        mock.method(Product, 'findById', () => query({ _id: productId, owner: alice._id, status: 'available' }));
        const res = await request(app).post('/api/bookings').set(HEADERS).set('Cookie', cookieFor(alice))
            .send({ productId: String(productId) });
        assert.equal(res.status, 400);
    });

    test('cannot double-book', async () => {
        mock.method(Product, 'findOneAndUpdate', () => query(null));
        mock.method(Product, 'findById', () => query({ _id: productId, owner: alice._id, status: 'booked' }));
        const res = await request(app).post('/api/bookings').set(HEADERS).set('Cookie', cookieFor(bob))
            .send({ productId: String(productId) });
        assert.equal(res.status, 409);
    });

    test('booking uses the session user and an atomic status update', async () => {
        let filter;
        mock.method(Product, 'findOneAndUpdate', (f) => {
            filter = f;
            return query({ _id: productId, owner: alice._id, status: 'booked' });
        });
        let created;
        mock.method(Booking, 'create', async (doc) => {
            created = doc;
            return { _id: new mongoose.Types.ObjectId(), ...doc };
        });
        const res = await request(app).post('/api/bookings').set(HEADERS).set('Cookie', cookieFor(bob))
            .send({ productId: String(productId), userId: String(alice._id) });
        assert.equal(res.status, 201);
        assert.equal(String(created.userId), String(bob._id));
        assert.equal(filter.status, 'available');
        assert.deepEqual(filter.owner, { $ne: String(bob._id) });
    });

    test('a stranger cannot cancel someone else\'s booking', async () => {
        const booking = { _id: new mongoose.Types.ObjectId(), productId, userId: bob._id };
        mock.method(Booking, 'findById', () => query(booking));
        mock.method(Product, 'findById', () => query({ _id: productId, owner: alice._id }));
        const deleteOne = mock.method(Booking, 'deleteOne', async () => ({ deletedCount: 1 }));
        mock.method(Product, 'updateOne', async () => ({ modifiedCount: 1 }));

        const url = `/api/bookings/${booking._id}`;
        const stranger = { _id: new mongoose.Types.ObjectId(), name: 'Eve', email: 'eve@example.com', role: 'user' };
        users.set(String(stranger._id), stranger);

        assert.equal((await request(app).delete(url).set(HEADERS).set('Cookie', cookieFor(stranger))).status, 403);
        assert.equal(deleteOne.mock.callCount(), 0);
        assert.equal((await request(app).delete(url).set(HEADERS).set('Cookie', cookieFor(bob))).status, 200);
        assert.equal((await request(app).delete(url).set(HEADERS).set('Cookie', cookieFor(alice))).status, 200);
    });
});
