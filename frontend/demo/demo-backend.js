// demo/demo-backend.js
// خادم تجريبي يعمل داخل المتصفح بنفس واجهة GeoSave البرمجية وقواعدها.
// يُستخدم فقط في النسخة التجريبية أحادية الصفحة؛ البيانات تبقى في متصفح الزائر، والدفع محاكاة.

import demoData from '../../shared/demo-data.js';
import business from '../../shared/business.js';
import dates from '../../shared/dates.js';

const {
    DEMO_PASSWORD, DEMO_USERS, DEMO_PRODUCTS, DEMO_BOOKINGS, DEMO_HISTORY, DEMO_PHONE, offsetPoint, illustrationSvg,
} = demoData;
const {
    SERVICES, FREE_LISTING_LIMIT, MAX_BOOKING_DAYS, MAX_BOOKING_LEAD_DAYS, MAX_DEPOSIT, TERMS_VERSION,
    priceBreakdown, publicCatalog, isPlusActive,
} = business;
const {
    todayIso, parseIsoDate, addDays, diffDays,
} = dates;

const STORAGE_KEY = 'geosave-demo-v3';
const PAGE_SIZE = 24;
const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

let memoryStore = null;

class DemoError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function newId() {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function emptyStore() {
    return { users: [], products: [], bookings: [], reviews: [], orders: [], session: null, historySeeded: false };
}

function load() {
    if (memoryStore) return memoryStore;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        memoryStore = raw ? { ...emptyStore(), ...JSON.parse(raw) } : emptyStore();
    } catch {
        memoryStore = emptyStore();
    }
    return memoryStore;
}

function save(store) {
    memoryStore = store;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (error) {
        if (error && error.name === 'QuotaExceededError') {
            throw new DemoError(413, 'مساحة التخزين التجريبية في متصفحك ممتلئة. احذف بعض الإعلانات أو أعد ضبط البيانات.');
        }
        // التخزين غير متاح (نافذة خاصة مثلاً): نكمل بالذاكرة فقط
    }
}

export function resetDemoData() {
    memoryStore = emptyStore();
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* تجاهل */ }
}

async function hashPassword(password, salt) {
    const data = new TextEncoder().encode(`${salt}:${password}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function svgDataUrl(item) {
    return `data:image/svg+xml;base64,${btoa(illustrationSvg(item))}`;
}

function distanceMeters(a, b) {
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const ratingOf = (user) => (user && user.ratingCount ? Math.round((user.ratingSum / user.ratingCount) * 10) / 10 : null);
const findUser = (store, id) => store.users.find((u) => u.id === id) || null;
const isFeatured = (product) => Boolean(product.featuredUntil && Date.parse(product.featuredUntil) > Date.now());

function sessionUser(user) {
    const plus = isPlusActive(user);
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: plus ? 'plus' : 'free',
        planUntil: plus ? user.planUntil : null,
        rating: ratingOf(user),
        ratingCount: user.ratingCount || 0,
    };
}

// ---------- تعبئة البيانات ----------
async function ensureDemoUsers(store) {
    const ids = {};
    for (const demo of DEMO_USERS) {
        let user = store.users.find((u) => u.email === demo.email);
        if (!user) {
            const salt = newId();
            user = {
                id: newId(), name: demo.name, email: demo.email, role: 'user', salt, hash: await hashPassword(DEMO_PASSWORD, salt),
                ratingSum: 0, ratingCount: 0, plan: 'free', planUntil: null, termsVersion: TERMS_VERSION, createdAt: new Date().toISOString(),
            };
            store.users.push(user);
        }
        ids[demo.key] = user.id;
    }
    return ids;
}

export async function seedNear(center) {
    const store = load();
    const users = await ensureDemoUsers(store);
    const demoOwners = new Set(Object.values(users));
    const nearby = store.products.filter((p) => demoOwners.has(p.owner) && distanceMeters(center, p) < 3000).length;
    if (nearby >= 3) {
        save(store);
        return 0;
    }

    const created = {};
    const now = Date.now();
    DEMO_PRODUCTS.forEach((item, index) => {
        const point = offsetPoint(center, item.dx, item.dy);
        const product = {
            _id: newId(),
            name: item.name,
            description: item.description,
            pricePerDay: item.pricePerDay,
            deposit: item.deposit || 0,
            maxDays: item.maxDays || 7,
            featuredUntil: item.featuredDays ? new Date(now + item.featuredDays * DAY_MS).toISOString() : null,
            owner: users[item.owner],
            lat: point.lat,
            lng: point.lng,
            image: svgDataUrl(item),
            phoneNumber: DEMO_PHONE,
            status: 'available',
            createdAt: new Date(now - (index + 1) * DAY_MS).toISOString(),
        };
        store.products.push(product);
        created[item.key] = product;
    });

    const today = todayIso();
    const makeBooking = (spec, status) => {
        const start = addDays(today, spec.startOffset);
        const booking = {
            _id: newId(),
            productId: created[spec.product]._id,
            userId: users[spec.user],
            ownerId: created[spec.product].owner,
            startDate: start,
            endDate: addDays(start, spec.days - 1),
            status,
            returnedAt: status === 'returned' ? `${addDays(start, spec.days)}T12:00:00.000Z` : null,
            termsVersion: TERMS_VERSION,
            createdAt: `${start}T09:00:00.000Z`,
        };
        store.bookings.push(booking);
        return booking;
    };

    DEMO_BOOKINGS.forEach((spec) => {
        makeBooking(spec, 'active');
        created[spec.product].status = 'booked';
    });

    if (!store.historySeeded) {
        DEMO_HISTORY.forEach((spec) => {
            const booking = makeBooking(spec, 'returned');
            spec.reviews.forEach((review) => {
                const reviewerIsBorrower = review.by === spec.user;
                const reviewee = reviewerIsBorrower ? booking.ownerId : booking.userId;
                store.reviews.push({
                    _id: newId(), bookingId: booking._id, reviewer: users[review.by], reviewee,
                    revieweeRole: reviewerIsBorrower ? 'owner' : 'borrower', rating: review.rating, comment: review.comment,
                    createdAt: booking.returnedAt,
                });
                const user = findUser(store, reviewee);
                user.ratingSum += review.rating;
                user.ratingCount += 1;
            });
        });
        store.historySeeded = true;
    }
    save(store);
    return DEMO_PRODUCTS.length;
}

// ---------- أدوات التحقق ----------
function str(value, label, min, max) {
    if (typeof value !== 'string' || value.trim().length < min) throw new DemoError(400, `الحقل "${label}" يجب أن يكون ${min} أحرف على الأقل.`);
    if (value.trim().length > max) throw new DemoError(400, `الحقل "${label}" يجب ألا يتجاوز ${max} حرفاً.`);
    return value.trim();
}

function num(value, label, min, max) {
    const n = Number(value);
    if (value === '' || value === null || value === undefined || !Number.isFinite(n) || n < min || n > max) {
        throw new DemoError(400, `قيمة الحقل "${label}" غير صحيحة.`);
    }
    return n;
}

function optNum(value, label, min, max, fallback) {
    return value === '' || value === null || value === undefined ? fallback : num(value, label, min, max);
}

function isoDate(value, label) {
    if (!parseIsoDate(value)) throw new DemoError(400, `${label} غير صحيح.`);
    return value;
}

function phone(value) {
    let digits = String(value || '').replace(/[\s\-()]/g, '');
    if (digits.startsWith('+')) digits = digits.slice(1);
    else if (digits.startsWith('00')) digits = digits.slice(2);
    else if (/^05\d{8}$/.test(digits)) digits = `966${digits.slice(1)}`;
    else if (/^5\d{8}$/.test(digits)) digits = `966${digits}`;
    if (!/^[1-9]\d{7,14}$/.test(digits)) throw new DemoError(400, 'رقم الجوال غير صحيح. مثال: 05XXXXXXXX أو 9665XXXXXXXX');
    return digits;
}

function currentUser(store) {
    return findUser(store, store.session);
}

function requireUser(store) {
    const user = currentUser(store);
    if (!user) throw new DemoError(401, 'يجب تسجيل الدخول أولاً.');
    return user;
}

// يصغّر الصورة المرفوعة ويحوّلها إلى WebP (مثل الخادم الحقيقي) ثم يحفظها كـ data URL
async function processImage(file) {
    if (!(file instanceof Blob) || !/^image\//.test(file.type)) throw new DemoError(400, 'يُسمح فقط برفع الصور (JPG, PNG, WebP).');
    if (file.size > 5 * 1024 * 1024) throw new DemoError(413, 'حجم الصورة أكبر من المسموح.');
    let bitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        throw new DemoError(400, 'الملف المرفوع ليس صورة صالحة.');
    }
    const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    let url = canvas.toDataURL('image/webp', 0.72);
    if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', 0.75);
    return url;
}

function extendFrom(current, days) {
    const base = current && Date.parse(current) > Date.now() ? Date.parse(current) : Date.now();
    return new Date(base + days * DAY_MS).toISOString();
}

function shapeOrder(order) {
    return { ...order, title: SERVICES[order.service] ? SERVICES[order.service].title : order.service };
}

// ---------- المسارات ----------
const routes = [
    ['GET', /^\/health$/, () => ({ status: 'ok', db: 'up', demo: true })],

    ['GET', /^\/auth\/me$/, (store) => {
        const user = currentUser(store);
        return { user: user ? sessionUser(user) : null };
    }],

    ['POST', /^\/auth\/register$/, async (store, { body }) => {
        const name = str(body.name, 'الاسم', 2, 60);
        const email = String(body.email || '').trim().toLowerCase();
        if (!EMAIL_RE.test(email)) throw new DemoError(400, 'صيغة البريد الإلكتروني غير صحيحة.');
        const password = typeof body.password === 'string' ? body.password : '';
        if (password.length < 8) throw new DemoError(400, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
        if (!/[A-Za-z؀-ۿ]/.test(password) || !/\d/.test(password)) throw new DemoError(400, 'كلمة المرور يجب أن تحتوي على حروف وأرقام.');
        if (body.acceptTerms !== true) throw new DemoError(400, 'يجب الموافقة على شروط الاستخدام وسياسة الخصوصية لإنشاء حساب.');
        if (store.users.some((u) => u.email === email)) throw new DemoError(409, 'هذا البريد الإلكتروني مسجل مسبقاً.');
        const salt = newId();
        const user = {
            id: newId(), name, email, role: 'user', salt, hash: await hashPassword(password, salt),
            ratingSum: 0, ratingCount: 0, plan: 'free', planUntil: null, termsVersion: TERMS_VERSION, createdAt: new Date().toISOString(),
        };
        store.users.push(user);
        store.session = user.id;
        return { status: 201, data: { user: sessionUser(user) } };
    }],

    ['POST', /^\/auth\/login$/, async (store, { body }) => {
        const email = String(body.email || '').trim().toLowerCase();
        const user = store.users.find((u) => u.email === email);
        const password = typeof body.password === 'string' ? body.password : '';
        if (!user || (await hashPassword(password, user.salt)) !== user.hash) {
            throw new DemoError(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
        }
        store.session = user.id;
        return { user: sessionUser(user) };
    }],

    ['POST', /^\/auth\/logout$/, (store) => {
        store.session = null;
        return { message: 'تم تسجيل الخروج.' };
    }],

    ['GET', /^\/products$/, (store, { query }) => {
        const center = { lat: num(query.lat, 'lat', -90, 90), lng: num(query.lng, 'lng', -180, 180) };
        const radiusKm = optNum(query.radius, 'radius', 0.1, 50, 5);
        const page = Math.floor(optNum(query.page, 'page', 1, 1000, 1));
        const q = typeof query.q === 'string' ? query.q.trim().toLowerCase() : '';
        const items = store.products
            .map((p) => ({ p, distance: distanceMeters(center, p), featured: isFeatured(p) }))
            .filter(({ p, distance }) => distance <= radiusKm * 1000
                && (!q || p.name.toLowerCase().includes(q))
                && (query.available !== 'true' || p.status === 'available')
                && (query.free !== 'true' || Number(p.pricePerDay) === 0))
            .sort((a, b) => (b.featured - a.featured) || (a.distance - b.distance))
            .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE + 1)
            .map(({ p, distance, featured }) => {
                const owner = findUser(store, p.owner);
                return {
                    _id: p._id, name: p.name, description: p.description, pricePerDay: p.pricePerDay, deposit: p.deposit, maxDays: p.maxDays,
                    image: p.image, status: p.status, createdAt: p.createdAt, distance: Math.round(distance), isFeatured: featured,
                    owner: {
                        _id: p.owner, name: owner ? owner.name : null, rating: ratingOf(owner), ratingCount: owner ? owner.ratingCount : 0, plus: isPlusActive(owner),
                    },
                };
            });
        return { items: items.slice(0, PAGE_SIZE), page, hasMore: items.length > PAGE_SIZE, radiusKm };
    }],

    ['GET', /^\/products\/mine$/, (store) => {
        const user = requireUser(store);
        const items = store.products
            .filter((p) => p.owner === user.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((p) => {
                const booking = store.bookings.find((b) => b.productId === p._id && b.status === 'active');
                const booker = booking && findUser(store, booking.userId);
                return {
                    _id: p._id, name: p.name, description: p.description, pricePerDay: p.pricePerDay, deposit: p.deposit, maxDays: p.maxDays,
                    image: p.image, status: p.status, phoneNumber: p.phoneNumber, featuredUntil: p.featuredUntil, isFeatured: isFeatured(p), createdAt: p.createdAt,
                    booking: booking
                        ? {
                            _id: booking._id, bookedBy: booker ? booker.name : null, bookedByRating: ratingOf(booker),
                            startDate: booking.startDate, endDate: booking.endDate, createdAt: booking.createdAt,
                        }
                        : null,
                };
            });
        return { items, limit: isPlusActive(user) ? null : FREE_LISTING_LIMIT };
    }],

    ['POST', /^\/products$/, async (store, { form }) => {
        const user = requireUser(store);
        const get = (key) => (form ? form.get(key) : null);
        const offerType = get('offerType') === 'free' ? 'free' : 'rent';
        const product = {
            _id: newId(),
            name: str(get('name'), 'اسم المنتج', 2, 80),
            description: str(get('description'), 'الوصف', 5, 1000),
            pricePerDay: offerType === 'free' ? 0 : Math.round(num(get('pricePerDay'), 'السعر اليومي', 1, 100000) * 100) / 100,
            deposit: Math.round(optNum(get('deposit'), 'مبلغ التأمين', 0, MAX_DEPOSIT, 0) * 100) / 100,
            maxDays: Math.floor(optNum(get('maxDays'), 'أقصى مدة', 1, MAX_BOOKING_DAYS, 7)),
            lat: num(get('latitude'), 'خط العرض', -90, 90),
            lng: num(get('longitude'), 'خط الطول', -180, 180),
            phoneNumber: phone(get('phoneNumber')),
            owner: user.id,
            status: 'available',
            featuredUntil: null,
            createdAt: new Date().toISOString(),
        };
        const file = get('image');
        if (!file) throw new DemoError(400, 'صورة المنتج مطلوبة.');
        if (get('acceptTerms') !== 'true') throw new DemoError(400, 'يجب الإقرار بمسؤوليتك عن الغرض وبأن المنصة غير مسؤولة عن الضياع أو التلف.');
        if (!isPlusActive(user) && store.products.filter((p) => p.owner === user.id).length >= FREE_LISTING_LIMIT) {
            throw new DemoError(403, `وصلت للحد الأقصى في الباقة المجانية (${FREE_LISTING_LIMIT} إعلانات). اشترك في GeoSave Plus لإعلانات غير محدودة.`);
        }
        product.image = await processImage(file);
        store.products.push(product);
        return { status: 201, data: { product } };
    }],

    ['DELETE', /^\/products\/([a-f\d]{24})$/, (store, { params }) => {
        const user = requireUser(store);
        const product = store.products.find((p) => p._id === params[0]);
        if (!product) throw new DemoError(404, 'المنتج غير موجود.');
        const isAdmin = user.role === 'admin';
        if (product.owner !== user.id && !isAdmin) throw new DemoError(403, 'لا تملك صلاحية حذف هذا المنتج.');
        if (!isAdmin && store.bookings.some((b) => b.productId === product._id && b.status === 'active')) {
            throw new DemoError(409, 'لا يمكن حذف الإعلان أثناء وجود حجز نشط. أنهِ الحجز أولاً.');
        }
        store.products = store.products.filter((p) => p !== product);
        store.bookings = store.bookings.filter((b) => !(b.productId === product._id && b.status === 'active'));
        return { message: 'تم حذف المنتج.' };
    }],

    ['POST', /^\/bookings$/, (store, { body }) => {
        const user = requireUser(store);
        const startDate = isoDate(body.startDate, 'تاريخ الاستلام');
        const endDate = isoDate(body.endDate, 'تاريخ الإرجاع');
        if (body.acceptTerms !== true) throw new DemoError(400, 'يجب الإقرار بأن المنصة غير مسؤولة عن الضياع أو التلف قبل الحجز.');
        const today = todayIso();
        if (diffDays(today, startDate) < 0) throw new DemoError(400, 'تاريخ الاستلام لا يمكن أن يكون في الماضي.');
        if (diffDays(today, startDate) > MAX_BOOKING_LEAD_DAYS) throw new DemoError(400, `يمكن الحجز قبل ${MAX_BOOKING_LEAD_DAYS} يوماً كحد أقصى.`);
        const days = diffDays(startDate, endDate) + 1;
        if (days < 1) throw new DemoError(400, 'تاريخ الإرجاع يجب أن يكون بعد تاريخ الاستلام أو في نفس اليوم.');
        const product = store.products.find((p) => p._id === body.productId);
        if (!product) throw new DemoError(404, 'المنتج غير موجود.');
        if (product.owner === user.id) throw new DemoError(400, 'لا يمكنك حجز منتجك.');
        if (days > product.maxDays) throw new DemoError(400, `أقصى مدة لهذا الغرض ${product.maxDays} أيام.`);
        if (product.status !== 'available') throw new DemoError(409, 'هذا المنتج محجوز حالياً.');
        product.status = 'booked';
        const booking = {
            _id: newId(), productId: product._id, userId: user.id, ownerId: product.owner, startDate, endDate,
            status: 'active', returnedAt: null, termsVersion: TERMS_VERSION, createdAt: new Date().toISOString(),
        };
        store.bookings.push(booking);
        return { status: 201, data: { booking } };
    }],

    ['GET', /^\/bookings\/overview$/, (store) => {
        const user = requireUser(store);
        const reviewed = new Set(store.reviews.filter((r) => r.reviewer === user.id).map((r) => r.bookingId));
        const shape = (booking, role) => {
            const other = findUser(store, role === 'borrower' ? booking.ownerId : booking.userId);
            const p = store.products.find((x) => x._id === booking.productId);
            return {
                _id: booking._id, role, status: booking.status, startDate: booking.startDate, endDate: booking.endDate,
                returnedAt: booking.returnedAt, createdAt: booking.createdAt,
                canReview: booking.status === 'returned' && !reviewed.has(booking._id) && Boolean(other),
                counterpart: other ? { _id: other.id, name: other.name, rating: ratingOf(other), ratingCount: other.ratingCount } : null,
                product: p
                    ? {
                        _id: p._id, name: p.name, description: p.description, pricePerDay: p.pricePerDay, deposit: p.deposit, image: p.image,
                        phoneNumber: role === 'borrower' && booking.status === 'active' ? p.phoneNumber : undefined,
                    }
                    : null,
            };
        };
        const mine = [...store.bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return {
            today: todayIso(),
            asBorrower: mine.filter((b) => b.userId === user.id).map((b) => shape(b, 'borrower')),
            asOwner: mine.filter((b) => b.ownerId === user.id).map((b) => shape(b, 'owner')),
        };
    }],

    ['POST', /^\/bookings\/([a-f\d]{24})\/return$/, (store, { params }) => {
        const user = requireUser(store);
        const booking = store.bookings.find((b) => b._id === params[0]);
        if (!booking) throw new DemoError(404, 'الحجز غير موجود.');
        if (booking.ownerId !== user.id && user.role !== 'admin') throw new DemoError(403, 'المالك فقط يستطيع تأكيد استلام الغرض.');
        if (booking.status !== 'active') throw new DemoError(409, 'تم إنهاء هذا الحجز مسبقاً.');
        booking.status = 'returned';
        booking.returnedAt = new Date().toISOString();
        const product = store.products.find((p) => p._id === booking.productId);
        if (product) product.status = 'available';
        return { message: 'تم تأكيد الإرجاع.' };
    }],

    ['DELETE', /^\/bookings\/([a-f\d]{24})$/, (store, { params }) => {
        const user = requireUser(store);
        const booking = store.bookings.find((b) => b._id === params[0]);
        if (!booking) throw new DemoError(404, 'الحجز غير موجود.');
        if (booking.userId !== user.id && booking.ownerId !== user.id && user.role !== 'admin') throw new DemoError(403, 'لا تملك صلاحية إلغاء هذا الحجز.');
        if (booking.status !== 'active') throw new DemoError(409, 'لا يمكن إلغاء حجز منتهٍ.');
        store.bookings = store.bookings.filter((b) => b !== booking);
        const product = store.products.find((p) => p._id === booking.productId);
        if (product) product.status = 'available';
        return { message: 'تم إلغاء الحجز.' };
    }],

    ['POST', /^\/bookings\/([a-f\d]{24})\/review$/, (store, { params, body }) => {
        const user = requireUser(store);
        const rating = num(body.rating, 'التقييم', 1, 5);
        if (!Number.isInteger(rating)) throw new DemoError(400, 'التقييم يجب أن يكون من 1 إلى 5 نجوم.');
        const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
        if (comment.length > 300) throw new DemoError(400, 'التعليق يجب ألا يتجاوز 300 حرف.');
        const booking = store.bookings.find((b) => b._id === params[0]);
        if (!booking) throw new DemoError(404, 'الحجز غير موجود.');
        const isBorrower = booking.userId === user.id;
        if (!isBorrower && booking.ownerId !== user.id) throw new DemoError(403, 'فقط طرفا الحجز يستطيعان التقييم.');
        if (booking.status !== 'returned') throw new DemoError(409, 'يمكن التقييم بعد تأكيد إرجاع الغرض فقط.');
        if (store.reviews.some((r) => r.bookingId === booking._id && r.reviewer === user.id)) throw new DemoError(409, 'قيّمت هذا الحجز مسبقاً.');
        const revieweeId = isBorrower ? booking.ownerId : booking.userId;
        store.reviews.push({
            _id: newId(), bookingId: booking._id, reviewer: user.id, reviewee: revieweeId,
            revieweeRole: isBorrower ? 'owner' : 'borrower', rating, comment, createdAt: new Date().toISOString(),
        });
        const reviewee = findUser(store, revieweeId);
        if (reviewee) {
            reviewee.ratingSum += rating;
            reviewee.ratingCount += 1;
        }
        return { status: 201, data: { message: 'شكراً لتقييمك.' } };
    }],

    ['GET', /^\/users\/([a-f\d]{24})\/reviews$/, (store, { params }) => {
        const user = findUser(store, params[0]);
        if (!user) throw new DemoError(404, 'المستخدم غير موجود.');
        const reviews = store.reviews
            .filter((r) => r.reviewee === user.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 5)
            .map((r) => {
                const reviewer = findUser(store, r.reviewer);
                return {
                    _id: r._id, rating: r.rating, comment: r.comment, revieweeRole: r.revieweeRole, createdAt: r.createdAt,
                    reviewerName: reviewer ? reviewer.name.split(/\s+/)[0] : 'مستخدم',
                };
            });
        return {
            user: { _id: user.id, name: user.name, rating: ratingOf(user), ratingCount: user.ratingCount, plus: isPlusActive(user), memberSince: user.createdAt },
            reviews,
        };
    }],

    ['GET', /^\/services$/, () => ({
        services: publicCatalog(), freeListingLimit: FREE_LISTING_LIMIT, paymentsEnabled: true, provider: 'mock',
    })],

    ['GET', /^\/services\/orders$/, (store) => {
        const user = requireUser(store);
        return { items: store.orders.filter((o) => o.user === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(shapeOrder) };
    }],

    ['POST', /^\/services\/checkout$/, (store, { body }) => {
        const user = requireUser(store);
        const key = typeof body.service === 'string' ? body.service : '';
        const service = Object.prototype.hasOwnProperty.call(SERVICES, key) ? SERVICES[key] : null;
        if (!service) throw new DemoError(400, 'الخدمة المطلوبة غير موجودة.');
        let product = null;
        if (service.kind === 'featured') {
            product = store.products.find((p) => p._id === body.productId);
            if (!product) throw new DemoError(404, 'الإعلان غير موجود.');
            if (product.owner !== user.id) throw new DemoError(403, 'يمكنك تمييز إعلاناتك فقط.');
        }
        const price = priceBreakdown(service.price);
        const now = new Date().toISOString();
        const order = {
            _id: newId(), user: user.id, service: key, productId: product ? product._id : null,
            amount: price.total, netAmount: price.net, vatAmount: price.vat, currency: price.currency,
            status: 'paid', createdAt: now, paidAt: now,
        };
        store.orders.push(order);
        if (product) product.featuredUntil = extendFrom(product.featuredUntil, service.days);
        else {
            user.planUntil = extendFrom(isPlusActive(user) ? user.planUntil : null, service.days);
            user.plan = 'plus';
        }
        return { status: 201, data: { order: shapeOrder(order), status: 'paid' } };
    }],

    ['POST', /^\/services\/orders\/([a-f\d]{24})\/verify$/, (store, { params }) => {
        const user = requireUser(store);
        const order = store.orders.find((o) => o._id === params[0] && o.user === user.id);
        if (!order) throw new DemoError(404, 'الطلب غير موجود.');
        return { order: shapeOrder(order), status: order.status };
    }],

    ['POST', /^\/demo\/seed$/, async (_store, { body }) => {
        const created = await seedNear({ lat: num(body.lat, 'lat', -90, 90), lng: num(body.lng, 'lng', -180, 180) });
        return { status: created ? 201 : 200, data: { created } };
    }],
];

/** نقطة الدخول: نفس توقيع api() في الواجهة */
export async function demoApi(path, { method = 'GET', body, form, query } = {}) {
    // تأخير بسيط يحاكي الشبكة حتى تظهر حالات التحميل بشكل طبيعي
    await new Promise((resolve) => setTimeout(resolve, 120));
    for (const [routeMethod, pattern, handler] of routes) {
        const match = routeMethod === method && path.match(pattern);
        if (!match) continue;
        try {
            const store = load();
            const result = await handler(store, { body: body || {}, form, query: query || {}, params: match.slice(1) });
            // seedNear يدير الحفظ بنفسه
            if (!/^\/demo\//.test(path)) save(store);
            return result && typeof result.status === 'number' ? result : { status: 200, data: result };
        } catch (error) {
            if (error instanceof DemoError) return { status: error.status, data: { error: error.message } };
            console.error(error);
            return { status: 500, data: { error: 'حدث خطأ غير متوقع، حاول لاحقاً.' } };
        }
    }
    return { status: 404, data: { error: 'المسار غير موجود.' } };
}
