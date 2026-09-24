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
const Review = require('../models/reviewModel');
const Order = require('../models/orderModel');
const moyasar = require('../payments/moyasarProvider');
const { TERMS_VERSION, FREE_LISTING_LIMIT } = require('../../shared/business');
const { todayIso, addDays } = require('../../shared/dates');

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
        limit: () => q,
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

    test('register requires accepting the terms', async () => {
        mock.method(User, 'exists', async () => null);
        const res = await request(app).post('/api/auth/register').set(HEADERS)
            .send({ name: 'Alice', email: 'alice@example.com', password: 'secret123', acceptTerms: 'yes' });
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
            .send({ name: 'Alice', email: 'ALICE@example.com', password: 'secret123', acceptTerms: true });
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
            .send({ name: 'Alice', email: 'Alice@Example.com', password: 'secret123', role: 'admin', plan: 'plus', acceptTerms: true });

        assert.equal(res.status, 201);
        assert.ok(saved.termsAcceptedAt instanceof Date, 'terms acceptance must be recorded');
        assert.equal(saved.termsVersion, TERMS_VERSION);
        assert.equal(saved.plan, undefined, 'plan must not be mass-assignable');
        assert.equal(res.body.user.plan, 'free');
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

    test('search filters free items and ranks featured listings first', async () => {
        let pipeline;
        mock.method(Product, 'aggregate', async (p) => {
            pipeline = p;
            return [];
        });
        const res = await request(app).get('/api/products?lat=24.7&lng=46.6&free=true');
        assert.equal(res.status, 200);
        assert.equal(pipeline[0].$geoNear.query.pricePerDay, 0);
        assert.deepEqual(Object.keys(pipeline.find((stage) => stage.$sort).$sort), ['isFeatured', 'distance', '_id']);
    });

    test('creating a product requires authentication', async () => {
        const res = await request(app).post('/api/products').set(HEADERS).field('name', 'Tent');
        assert.equal(res.status, 401);
    });

    const productFields = (req, extra = {}) => {
        const fields = {
            name: 'Tent', description: 'A nice tent', offerType: 'rent', pricePerDay: '50', latitude: '24.7', longitude: '46.6',
            phoneNumber: '0512345678', acceptTerms: 'true', ...extra,
        };
        Object.entries(fields).forEach(([key, value]) => { if (value !== undefined) req.field(key, value); });
        return req;
    };
    const png = () => sharp({ create: { width: 20, height: 20, channels: 3, background: '#0f766e' } }).png().toBuffer();

    test('creating a product rejects non-image uploads', async () => {
        mock.method(Product, 'countDocuments', async () => 0);
        const res = await productFields(request(app).post('/api/products').set(HEADERS).set('Cookie', cookieFor(alice)))
            .attach('image', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });
        assert.equal(res.status, 400);
    });

    test('creating a product requires the owner to accept the terms', async () => {
        mock.method(Product, 'countDocuments', async () => 0);
        const res = await productFields(request(app).post('/api/products').set(HEADERS).set('Cookie', cookieFor(alice)), { acceptTerms: undefined })
            .attach('image', await png(), { filename: 'x.png', contentType: 'image/png' });
        assert.equal(res.status, 400);
    });

    test('creating a product re-encodes the image and takes the owner from the session', async () => {
        mock.method(Product, 'countDocuments', async () => 0);
        let saved;
        mock.method(Product, 'create', async (doc) => {
            saved = doc;
            return { _id: new mongoose.Types.ObjectId(), ...doc };
        });

        const res = await productFields(request(app).post('/api/products').set(HEADERS).set('Cookie', cookieFor(alice)), { owner: String(bob._id) })
            .attach('image', await png(), { filename: '../../evil.png', contentType: 'image/png' });

        try {
            assert.equal(res.status, 201, JSON.stringify(res.body));
            assert.equal(String(saved.owner), String(alice._id));
            assert.equal(saved.phoneNumber, '966512345678');
            assert.equal(saved.pricePerDay, 50);
            assert.deepEqual(saved.location.coordinates, [46.6, 24.7]);
            assert.match(saved.image, /^uploads\/[0-9a-f-]{36}\.webp$/);
            assert.equal(saved.termsVersion, TERMS_VERSION);
            assert.ok(fs.existsSync(path.join(config.uploadDir, path.basename(saved.image))));
        } finally {
            if (saved) fs.rmSync(path.join(config.uploadDir, path.basename(saved.image)), { force: true });
        }
    });

    test('free lending ignores any price and stores deposit and max days', async () => {
        mock.method(Product, 'countDocuments', async () => 0);
        let saved;
        mock.method(Product, 'create', async (doc) => {
            saved = doc;
            return { _id: new mongoose.Types.ObjectId(), ...doc };
        });
        const res = await productFields(request(app).post('/api/products').set(HEADERS).set('Cookie', cookieFor(alice)),
            { offerType: 'free', pricePerDay: '999', deposit: '150', maxDays: '14' })
            .attach('image', await png(), { filename: 'x.png', contentType: 'image/png' });
        try {
            assert.equal(res.status, 201, JSON.stringify(res.body));
            assert.equal(saved.pricePerDay, 0);
            assert.equal(saved.deposit, 150);
            assert.equal(saved.maxDays, 14);
        } finally {
            if (saved) fs.rmSync(path.join(config.uploadDir, path.basename(saved.image)), { force: true });
        }
    });

    test('the free plan is limited and Plus is unlimited', async () => {
        mock.method(Product, 'countDocuments', async () => FREE_LISTING_LIMIT);
        const limited = await productFields(request(app).post('/api/products').set(HEADERS).set('Cookie', cookieFor(alice)))
            .attach('image', await png(), { filename: 'x.png', contentType: 'image/png' });
        assert.equal(limited.status, 403);

        const plusUser = { _id: new mongoose.Types.ObjectId(), name: 'Plus', email: 'plus@example.com', role: 'user', plan: 'plus', planUntil: new Date(Date.now() + 86400000) };
        users.set(String(plusUser._id), plusUser);
        let saved;
        mock.method(Product, 'create', async (doc) => {
            saved = doc;
            return { _id: new mongoose.Types.ObjectId(), ...doc };
        });
        const allowed = await productFields(request(app).post('/api/products').set(HEADERS).set('Cookie', cookieFor(plusUser)))
            .attach('image', await png(), { filename: 'x.png', contentType: 'image/png' });
        try {
            assert.equal(allowed.status, 201, JSON.stringify(allowed.body));
        } finally {
            if (saved) fs.rmSync(path.join(config.uploadDir, path.basename(saved.image)), { force: true });
        }
    });

    test('only the owner or an admin can delete a product, and not during an active booking', async () => {
        const product = { _id: new mongoose.Types.ObjectId(), owner: alice._id, image: 'uploads/missing.webp' };
        mock.method(Product, 'findById', () => query(product));
        const deleteOne = mock.method(Product, 'deleteOne', async () => ({ deletedCount: 1 }));
        mock.method(Booking, 'deleteMany', async () => ({ deletedCount: 0 }));
        let activeBooking = null;
        mock.method(Booking, 'exists', async () => activeBooking);

        const url = `/api/products/${product._id}`;
        assert.equal((await request(app).delete(url).set(HEADERS).set('Cookie', cookieFor(bob))).status, 403);
        assert.equal(deleteOne.mock.callCount(), 0);
        activeBooking = { _id: new mongoose.Types.ObjectId() };
        assert.equal((await request(app).delete(url).set(HEADERS).set('Cookie', cookieFor(alice))).status, 409);
        assert.equal((await request(app).delete(url).set(HEADERS).set('Cookie', cookieFor(admin))).status, 200);
        activeBooking = null;
        assert.equal((await request(app).delete(url).set(HEADERS).set('Cookie', cookieFor(alice))).status, 200);
    });

    test('invalid ids are rejected', async () => {
        const res = await request(app).delete('/api/products/not-an-id').set(HEADERS).set('Cookie', cookieFor(alice));
        assert.equal(res.status, 400);
    });
});

describe('bookings', () => {
    const productId = new mongoose.Types.ObjectId();
    const today = todayIso();
    const bookingBody = (extra = {}) => ({ productId: String(productId), startDate: today, endDate: addDays(today, 1), acceptTerms: true, ...extra });
    const available = { _id: productId, owner: alice._id, status: 'available', maxDays: 3 };

    test('requires authentication', async () => {
        assert.equal((await request(app).post('/api/bookings').set(HEADERS).send(bookingBody())).status, 401);
        assert.equal((await request(app).get('/api/bookings/overview')).status, 401);
    });

    test('requires the borrower to accept the liability terms', async () => {
        const res = await request(app).post('/api/bookings').set(HEADERS).set('Cookie', cookieFor(bob)).send(bookingBody({ acceptTerms: undefined }));
        assert.equal(res.status, 400);
    });

    test('validates the borrowing period', async () => {
        mock.method(Product, 'findById', () => query(available));
        const send = (body) => request(app).post('/api/bookings').set(HEADERS).set('Cookie', cookieFor(bob)).send(body);
        assert.equal((await send(bookingBody({ startDate: addDays(today, -1) }))).status, 400, 'past start');
        assert.equal((await send(bookingBody({ endDate: addDays(today, -1) }))).status, 400, 'end before start');
        assert.equal((await send(bookingBody({ endDate: addDays(today, 3) }))).status, 400, 'longer than maxDays');
        assert.equal((await send(bookingBody({ startDate: addDays(today, 61), endDate: addDays(today, 61) }))).status, 400, 'too far ahead');
        assert.equal((await send(bookingBody({ startDate: '2026-02-30' }))).status, 400, 'invalid date');
    });

    test('cannot book your own product', async () => {
        mock.method(Product, 'findById', () => query(available));
        const res = await request(app).post('/api/bookings').set(HEADERS).set('Cookie', cookieFor(alice)).send(bookingBody());
        assert.equal(res.status, 400);
    });

    test('cannot double-book', async () => {
        mock.method(Product, 'findById', () => query(available));
        mock.method(Product, 'findOneAndUpdate', () => query(null));
        const res = await request(app).post('/api/bookings').set(HEADERS).set('Cookie', cookieFor(bob)).send(bookingBody());
        assert.equal(res.status, 409);
    });

    test('booking uses the session user, records the terms and updates atomically', async () => {
        mock.method(Product, 'findById', () => query(available));
        let filter;
        mock.method(Product, 'findOneAndUpdate', (f) => {
            filter = f;
            return query({ ...available, status: 'booked' });
        });
        let created;
        mock.method(Booking, 'create', async (doc) => {
            created = doc;
            return { _id: new mongoose.Types.ObjectId(), ...doc };
        });
        const res = await request(app).post('/api/bookings').set(HEADERS).set('Cookie', cookieFor(bob))
            .send(bookingBody({ userId: String(alice._id) }));
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal(String(created.userId), String(bob._id));
        assert.equal(String(created.ownerId), String(alice._id));
        assert.equal(created.startDate.toISOString().slice(0, 10), today);
        assert.equal(created.termsVersion, TERMS_VERSION);
        assert.equal(filter.status, 'available');
        assert.deepEqual(filter.owner, { $ne: String(bob._id) });
    });

    test('a stranger cannot cancel someone else\'s booking, and finished bookings cannot be cancelled', async () => {
        const booking = { _id: new mongoose.Types.ObjectId(), productId, userId: bob._id, ownerId: alice._id, status: 'active' };
        mock.method(Booking, 'findById', () => query(booking));
        const deleteOne = mock.method(Booking, 'deleteOne', async () => ({ deletedCount: 1 }));
        mock.method(Product, 'updateOne', async () => ({ modifiedCount: 1 }));

        const url = `/api/bookings/${booking._id}`;
        const stranger = { _id: new mongoose.Types.ObjectId(), name: 'Eve', email: 'eve@example.com', role: 'user' };
        users.set(String(stranger._id), stranger);

        assert.equal((await request(app).delete(url).set(HEADERS).set('Cookie', cookieFor(stranger))).status, 403);
        assert.equal(deleteOne.mock.callCount(), 0);
        assert.equal((await request(app).delete(url).set(HEADERS).set('Cookie', cookieFor(bob))).status, 200);
        assert.equal((await request(app).delete(url).set(HEADERS).set('Cookie', cookieFor(alice))).status, 200);
        booking.status = 'returned';
        assert.equal((await request(app).delete(url).set(HEADERS).set('Cookie', cookieFor(bob))).status, 409);
    });

    test('only the owner can confirm the return', async () => {
        const booking = { _id: new mongoose.Types.ObjectId(), productId, userId: bob._id, ownerId: alice._id, status: 'active' };
        mock.method(Booking, 'findById', () => query(booking));
        mock.method(Booking, 'findOneAndUpdate', () => query({ ...booking, status: 'returned' }));
        const productUpdate = mock.method(Product, 'updateOne', async () => ({ modifiedCount: 1 }));
        const url = `/api/bookings/${booking._id}/return`;
        assert.equal((await request(app).post(url).set(HEADERS).set('Cookie', cookieFor(bob))).status, 403);
        assert.equal((await request(app).post(url).set(HEADERS).set('Cookie', cookieFor(alice))).status, 200);
        assert.deepEqual(productUpdate.mock.calls[0].arguments[1], { $set: { status: 'available' } });
    });
});

describe('reviews', () => {
    const booking = { _id: new mongoose.Types.ObjectId(), productId: new mongoose.Types.ObjectId(), userId: bob._id, ownerId: alice._id, status: 'returned' };
    const url = `/api/bookings/${booking._id}/review`;

    test('only participants can review, only after the return, once, with 1-5 stars', async () => {
        const current = { ...booking };
        mock.method(Booking, 'findById', () => query(current));
        let reviewDoc;
        const createReview = mock.method(Review, 'create', async (doc) => {
            if (reviewDoc) {
                const error = new Error('duplicate');
                error.code = 11000;
                throw error;
            }
            reviewDoc = doc;
            return doc;
        });
        const ratingUpdate = mock.method(User, 'updateOne', async () => ({ modifiedCount: 1 }));
        const stranger = { _id: new mongoose.Types.ObjectId(), name: 'Eve', email: 'eve2@example.com', role: 'user' };
        users.set(String(stranger._id), stranger);
        const send = (user, body) => request(app).post(url).set(HEADERS).set('Cookie', cookieFor(user)).send(body);

        assert.equal((await send(bob, { rating: 6 })).status, 400);
        assert.equal((await send(bob, { rating: 4.5 })).status, 400);
        assert.equal((await send(stranger, { rating: 5 })).status, 403);
        current.status = 'active';
        assert.equal((await send(bob, { rating: 5 })).status, 409);
        current.status = 'returned';

        assert.equal((await send(bob, { rating: 5, comment: 'ممتاز' })).status, 201);
        assert.equal(String(reviewDoc.reviewee), String(alice._id));
        assert.equal(reviewDoc.revieweeRole, 'owner');
        assert.deepEqual(ratingUpdate.mock.calls[0].arguments[1], { $inc: { ratingSum: 5, ratingCount: 1 } });
        assert.equal((await send(bob, { rating: 5 })).status, 409, 'duplicate review');
        assert.equal(createReview.mock.callCount(), 2);
        assert.equal(ratingUpdate.mock.callCount(), 1, 'rating counted once');
    });

    test('public profile shows first names only', async () => {
        const target = { _id: alice._id, name: 'Alice', ratingSum: 9, ratingCount: 2, createdAt: new Date() };
        mock.method(User, 'findById', () => query(target));
        mock.method(Review, 'find', () => query([{ _id: 'r1', rating: 5, comment: 'x', revieweeRole: 'owner', reviewer: { name: 'Bob Smith' }, createdAt: new Date() }]));
        const res = await request(app).get(`/api/users/${alice._id}/reviews`);
        assert.equal(res.status, 200);
        assert.equal(res.body.user.rating, 4.5);
        assert.equal(res.body.reviews[0].reviewerName, 'Bob');
        assert.equal(res.body.user.email, undefined);
    });
});

describe('digital services', () => {
    test('catalog shows VAT-inclusive prices', async () => {
        const res = await request(app).get('/api/services');
        assert.equal(res.status, 200);
        const featured = res.body.services.find((service) => service.key === 'featured_7');
        assert.equal(featured.total, 9);
        assert.equal(Math.round((featured.net + featured.vat) * 100), 900);
        assert.equal(res.body.paymentsEnabled, true);
    });

    test('checkout validates the service and ownership', async () => {
        const send = (body, user = alice) => request(app).post('/api/services/checkout').set(HEADERS).set('Cookie', cookieFor(user)).send(body);
        assert.equal((await request(app).post('/api/services/checkout').set(HEADERS).send({ service: 'plus_30' })).status, 401);
        assert.equal((await send({ service: 'free_money' })).status, 400);
        assert.equal((await send({ service: '__proto__' })).status, 400);
        mock.method(Product, 'findById', () => query({ _id: new mongoose.Types.ObjectId(), owner: bob._id, name: 'x' }));
        assert.equal((await send({ service: 'featured_7', productId: String(new mongoose.Types.ObjectId()) })).status, 403);
    });

    test('the server sets the price and applies the service once', async () => {
        const productId = new mongoose.Types.ObjectId();
        mock.method(Product, 'findById', () => query({ _id: productId, owner: alice._id, name: 'Tent', featuredUntil: null }));
        let order;
        mock.method(Order, 'create', async (doc) => {
            order = { _id: new mongoose.Types.ObjectId(), ...doc };
            return order;
        });
        mock.method(Order, 'updateOne', async () => ({ modifiedCount: 1 }));
        mock.method(Order, 'findOneAndUpdate', () => query({ ...order, status: 'paid', appliedAt: new Date() }));
        const productUpdate = mock.method(Product, 'updateOne', async () => ({ modifiedCount: 1 }));

        const res = await request(app).post('/api/services/checkout').set(HEADERS).set('Cookie', cookieFor(alice))
            .send({ service: 'featured_30', productId: String(productId), amount: 0.01 });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal(res.body.status, 'paid');
        assert.equal(order.amount, 29, 'client-supplied amount is ignored');
        assert.equal(order.vatAmount, 3.78);
        const featuredUntil = productUpdate.mock.calls[0].arguments[1].$set.featuredUntil;
        const days = Math.round((featuredUntil.getTime() - Date.now()) / 86400000);
        assert.equal(days, 30);
    });

    test('Plus extends the plan', async () => {
        let order;
        mock.method(Order, 'create', async (doc) => {
            order = { _id: new mongoose.Types.ObjectId(), ...doc };
            return order;
        });
        mock.method(Order, 'updateOne', async () => ({ modifiedCount: 1 }));
        mock.method(Order, 'findOneAndUpdate', () => query({ ...order, status: 'paid', appliedAt: new Date() }));
        const userUpdate = mock.method(User, 'updateOne', async () => ({ modifiedCount: 1 }));
        const res = await request(app).post('/api/services/checkout').set(HEADERS).set('Cookie', cookieFor(bob)).send({ service: 'plus_30' });
        assert.equal(res.status, 201);
        assert.equal(userUpdate.mock.calls[0].arguments[1].$set.plan, 'plus');
    });

    test('orders can only be verified by their owner', async () => {
        mock.method(Order, 'findOne', () => query(null));
        const res = await request(app).post(`/api/services/orders/${new mongoose.Types.ObjectId()}/verify`).set(HEADERS).set('Cookie', cookieFor(bob));
        assert.equal(res.status, 404);
    });

    test('Moyasar verification requires paid status with the exact amount and currency', async () => {
        const order = { _id: new mongoose.Types.ObjectId(), amount: 19, currency: 'SAR', providerRef: 'inv_1' };
        const respond = (invoice) => mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => invoice }));
        respond({ status: 'paid', amount: 1900, currency: 'SAR', metadata: { order_id: String(order._id) } });
        assert.equal((await moyasar.verify(order)).paid, true);
        mock.restoreAll();
        respond({ status: 'paid', amount: 100, currency: 'SAR' });
        assert.equal((await moyasar.verify(order)).paid, false, 'amount mismatch');
        mock.restoreAll();
        respond({ status: 'paid', amount: 1900, currency: 'SAR', metadata: { order_id: 'another' } });
        assert.equal((await moyasar.verify(order)).paid, false, 'order mismatch');
        mock.restoreAll();
        respond({ status: 'initiated', amount: 1900, currency: 'SAR' });
        assert.equal((await moyasar.verify(order)).paid, false);
    });
});
