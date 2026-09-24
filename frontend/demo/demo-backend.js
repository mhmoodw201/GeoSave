// demo/demo-backend.js
// خادم تجريبي يعمل داخل المتصفح بنفس واجهة GeoSave البرمجية وقواعدها.
// يُستخدم فقط في النسخة التجريبية أحادية الصفحة؛ البيانات تبقى في متصفح الزائر.

import demoData from '../../shared/demo-data.js';

const {
    DEMO_PASSWORD, DEMO_USERS, DEMO_PRODUCTS, DEMO_BOOKINGS, DEMO_PHONE, offsetPoint, illustrationSvg,
} = demoData;

const STORAGE_KEY = 'geosave-demo-v2';
const PAGE_SIZE = 24;
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
    return { users: [], products: [], bookings: [], session: null };
}

function load() {
    if (memoryStore) return memoryStore;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        memoryStore = raw ? JSON.parse(raw) : emptyStore();
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

// ---------- تعبئة البيانات ----------
async function ensureDemoUsers(store) {
    const ids = {};
    for (const demo of DEMO_USERS) {
        let user = store.users.find((u) => u.email === demo.email);
        if (!user) {
            const salt = newId();
            user = { id: newId(), name: demo.name, email: demo.email, role: 'user', salt, hash: await hashPassword(DEMO_PASSWORD, salt) };
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
            owner: users[item.owner],
            lat: point.lat,
            lng: point.lng,
            image: svgDataUrl(item),
            phoneNumber: DEMO_PHONE,
            status: 'available',
            createdAt: new Date(now - (index + 1) * 86400000).toISOString(),
        };
        store.products.push(product);
        created[item.key] = product;
    });
    DEMO_BOOKINGS.forEach((booking) => {
        const product = created[booking.product];
        product.status = 'booked';
        store.bookings.push({ _id: newId(), productId: product._id, userId: users[booking.user], createdAt: new Date(now - 3600000).toISOString() });
    });
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

function phone(value) {
    let digits = String(value || '').replace(/[\s\-()]/g, '');
    if (digits.startsWith('+')) digits = digits.slice(1);
    else if (digits.startsWith('00')) digits = digits.slice(2);
    else if (/^05\d{8}$/.test(digits)) digits = `966${digits.slice(1)}`;
    else if (/^5\d{8}$/.test(digits)) digits = `966${digits}`;
    if (!/^[1-9]\d{7,14}$/.test(digits)) throw new DemoError(400, 'رقم الجوال غير صحيح. مثال: 05XXXXXXXX أو 9665XXXXXXXX');
    return digits;
}

function publicUser(user) {
    return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function currentUser(store) {
    return store.users.find((u) => u.id === store.session) || null;
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

// ---------- المسارات ----------
const routes = [
    ['GET', /^\/health$/, () => ({ status: 'ok', db: 'up', demo: true })],

    ['GET', /^\/auth\/me$/, (store) => {
        const user = currentUser(store);
        return { user: user ? publicUser(user) : null };
    }],

    ['POST', /^\/auth\/register$/, async (store, { body }) => {
        const name = str(body.name, 'الاسم', 2, 60);
        const email = String(body.email || '').trim().toLowerCase();
        if (!EMAIL_RE.test(email)) throw new DemoError(400, 'صيغة البريد الإلكتروني غير صحيحة.');
        const password = typeof body.password === 'string' ? body.password : '';
        if (password.length < 8) throw new DemoError(400, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
        if (!/[A-Za-z؀-ۿ]/.test(password) || !/\d/.test(password)) throw new DemoError(400, 'كلمة المرور يجب أن تحتوي على حروف وأرقام.');
        if (store.users.some((u) => u.email === email)) throw new DemoError(409, 'هذا البريد الإلكتروني مسجل مسبقاً.');
        const salt = newId();
        const user = { id: newId(), name, email, role: 'user', salt, hash: await hashPassword(password, salt) };
        store.users.push(user);
        store.session = user.id;
        return { status: 201, data: { user: publicUser(user) } };
    }],

    ['POST', /^\/auth\/login$/, async (store, { body }) => {
        const email = String(body.email || '').trim().toLowerCase();
        const user = store.users.find((u) => u.email === email);
        const password = typeof body.password === 'string' ? body.password : '';
        if (!user || (await hashPassword(password, user.salt)) !== user.hash) {
            throw new DemoError(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
        }
        store.session = user.id;
        return { user: publicUser(user) };
    }],

    ['POST', /^\/auth\/logout$/, (store) => {
        store.session = null;
        return { message: 'تم تسجيل الخروج.' };
    }],

    ['GET', /^\/products$/, (store, { query }) => {
        const center = { lat: num(query.lat, 'lat', -90, 90), lng: num(query.lng, 'lng', -180, 180) };
        const radiusKm = query.radius ? num(query.radius, 'radius', 0.1, 50) : 5;
        const page = Math.floor(query.page ? num(query.page, 'page', 1, 1000) : 1);
        const q = typeof query.q === 'string' ? query.q.trim().toLowerCase() : '';
        const items = store.products
            .map((p) => ({ p, distance: distanceMeters(center, p) }))
            .filter(({ p, distance }) => distance <= radiusKm * 1000
                && (!q || p.name.toLowerCase().includes(q))
                && (query.available !== 'true' || p.status === 'available'))
            .sort((a, b) => a.distance - b.distance)
            .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE + 1)
            .map(({ p, distance }) => {
                const owner = store.users.find((u) => u.id === p.owner);
                return {
                    _id: p._id, name: p.name, description: p.description, pricePerDay: p.pricePerDay,
                    image: p.image, status: p.status, createdAt: p.createdAt, distance: Math.round(distance),
                    owner: { _id: p.owner, name: owner ? owner.name : 'مستخدم' },
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
                const booking = store.bookings.find((b) => b.productId === p._id);
                const booker = booking && store.users.find((u) => u.id === booking.userId);
                return {
                    _id: p._id, name: p.name, description: p.description, pricePerDay: p.pricePerDay, image: p.image,
                    status: p.status, phoneNumber: p.phoneNumber, createdAt: p.createdAt,
                    booking: booking ? { _id: booking._id, bookedBy: booker ? booker.name : null, createdAt: booking.createdAt } : null,
                };
            });
        return { items };
    }],

    ['POST', /^\/products$/, async (store, { form }) => {
        const user = requireUser(store);
        const get = (key) => (form ? form.get(key) : null);
        const product = {
            _id: newId(),
            name: str(get('name'), 'اسم المنتج', 2, 80),
            description: str(get('description'), 'الوصف', 5, 1000),
            pricePerDay: Math.round(num(get('pricePerDay'), 'السعر اليومي', 1, 100000) * 100) / 100,
            lat: num(get('latitude'), 'خط العرض', -90, 90),
            lng: num(get('longitude'), 'خط الطول', -180, 180),
            phoneNumber: phone(get('phoneNumber')),
            owner: user.id,
            status: 'available',
            createdAt: new Date().toISOString(),
        };
        const file = get('image');
        if (!file) throw new DemoError(400, 'صورة المنتج مطلوبة.');
        product.image = await processImage(file);
        store.products.push(product);
        return { status: 201, data: { product } };
    }],

    ['DELETE', /^\/products\/([a-f\d]{24})$/, (store, { params }) => {
        const user = requireUser(store);
        const product = store.products.find((p) => p._id === params[0]);
        if (!product) throw new DemoError(404, 'المنتج غير موجود.');
        if (product.owner !== user.id && user.role !== 'admin') throw new DemoError(403, 'لا تملك صلاحية حذف هذا المنتج.');
        store.products = store.products.filter((p) => p !== product);
        store.bookings = store.bookings.filter((b) => b.productId !== product._id);
        return { message: 'تم حذف المنتج.' };
    }],

    ['POST', /^\/bookings$/, (store, { body }) => {
        const user = requireUser(store);
        const product = store.products.find((p) => p._id === body.productId);
        if (!product) throw new DemoError(404, 'المنتج غير موجود.');
        if (product.owner === user.id) throw new DemoError(400, 'لا يمكنك حجز منتجك.');
        if (product.status !== 'available') throw new DemoError(409, 'هذا المنتج محجوز حالياً.');
        product.status = 'booked';
        const booking = { _id: newId(), productId: product._id, userId: user.id, createdAt: new Date().toISOString() };
        store.bookings.push(booking);
        return { status: 201, data: { booking } };
    }],

    ['GET', /^\/bookings\/mine$/, (store) => {
        const user = requireUser(store);
        const items = store.bookings
            .filter((b) => b.userId === user.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((b) => {
                const p = store.products.find((x) => x._id === b.productId);
                if (!p) return null;
                const owner = store.users.find((u) => u.id === p.owner);
                return {
                    _id: b._id,
                    createdAt: b.createdAt,
                    product: {
                        _id: p._id, name: p.name, description: p.description, pricePerDay: p.pricePerDay,
                        image: p.image, phoneNumber: p.phoneNumber, ownerName: owner ? owner.name : null,
                    },
                };
            })
            .filter(Boolean);
        return { items };
    }],

    ['DELETE', /^\/bookings\/([a-f\d]{24})$/, (store, { params }) => {
        const user = requireUser(store);
        const booking = store.bookings.find((b) => b._id === params[0]);
        if (!booking) throw new DemoError(404, 'الحجز غير موجود.');
        const product = store.products.find((p) => p._id === booking.productId);
        const allowed = booking.userId === user.id || (product && product.owner === user.id) || user.role === 'admin';
        if (!allowed) throw new DemoError(403, 'لا تملك صلاحية إلغاء هذا الحجز.');
        store.bookings = store.bookings.filter((b) => b !== booking);
        if (product) product.status = 'available';
        return { message: 'تم إلغاء الحجز.' };
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
        // seedNear يدير الحفظ بنفسه، لذا نقرأ المخزن بعد انتهائه
        try {
            const store = load();
            const result = await handler(store, { body: body || {}, form, query: query || {}, params: match.slice(1) });
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
