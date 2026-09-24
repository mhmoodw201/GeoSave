// shared/demo-data.js
// بيانات العرض التجريبي — تُستخدم في الخادم (قاعدة البيانات المدمجة) وفي النسخة التجريبية على المتصفح.

// مركز افتراضي: حي العليا، الرياض
const DEMO_CENTER = { lat: 24.7116, lng: 46.6746, label: 'الرياض' };

const DEMO_PASSWORD = 'Demo1234';

const DEMO_USERS = [
    { key: 'demo', name: 'محمود', email: 'demo@geosave.app' },
    { key: 'khalid', name: 'خالد العتيبي', email: 'khalid@demo.geosave.app' },
    { key: 'noura', name: 'نورة القحطاني', email: 'noura@demo.geosave.app' },
    { key: 'fahad', name: 'فهد الشمري', email: 'fahad@demo.geosave.app' },
];

// أيقونات (مقتبسة من Lucide — رخصة ISC) لرسم صور توضيحية للمنتجات
const ICONS = {
    tent: '<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>',
    drill: '<path d="M10 18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a3 3 0 0 1-3-3 1 1 0 0 1 1-1z"/><path d="M13 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1l-.81 3.242a1 1 0 0 1-.97.758H8"/><path d="M14 4h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-3"/><path d="M18 6h4"/><path d="m5 10-2 8"/><path d="m12 10-2 8"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    bike: '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
    projector: '<path d="M5 7 3 5"/><path d="M9 6V3"/><path d="m13 7 2-2"/><circle cx="9" cy="13" r="3"/><path d="M11.83 12H20a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h2.17"/><path d="M16 16h2"/>',
    speaker: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M12 6h.01"/><circle cx="12" cy="14" r="4"/><path d="M12 14h.01"/>',
    gamepad: '<path d="M6 12h4"/><path d="M8 10v4"/><path d="M15 13h.01"/><path d="M18 11h.01"/><rect width="20" height="12" x="2" y="6" rx="2"/>',
    cooler: '<path d="M5 6a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6Z"/><path d="M5 10h14"/><path d="M15 7v6"/>',
    hammer: '<path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"/><path d="m18 15 4-4"/><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"/>',
};

// dx/dy: الإزاحة بالأمتار عن موقع الزائر (شرق/شمال)
const DEMO_PRODUCTS = [
    { key: 'tent', icon: 'tent', colors: ['#0f766e', '#134e4a'], owner: 'khalid', name: 'خيمة رحلات عائلية لـ 6 أشخاص', description: 'خيمة مقاومة للماء والرياح مع أوتاد وحبال وحقيبة حمل. مناسبة للكشتات والرحلات البرية، تُركّب خلال 10 دقائق.', pricePerDay: 60, dx: 320, dy: 210 },
    { key: 'drill', icon: 'drill', colors: ['#c2410c', '#7c2d12'], owner: 'fahad', name: 'دريل كهربائي بوش مع طقم ريش', description: 'دريل احترافي 18 فولت مع بطاريتين وشاحن وطقم ريش للخشب والحديد والخرسانة.', pricePerDay: 20, dx: -540, dy: 380 },
    { key: 'camera', icon: 'camera', colors: ['#1d4ed8', '#1e3a8a'], owner: 'noura', name: 'كاميرا كانون EOS 250D مع عدسة 18-55', description: 'كاميرا بحالة ممتازة مع بطارية إضافية وبطاقة ذاكرة 64GB وحقيبة. مثالية للمناسبات والسفر.', pricePerDay: 120, dx: 900, dy: -650 },
    { key: 'bike', icon: 'bike', colors: ['#15803d', '#14532d'], owner: 'fahad', name: 'دراجة هوائية جبلية مقاس 27.5', description: 'دراجة جبلية 21 سرعة مع خوذة وقفل. مناسبة لممشى الحي والمسارات الخفيفة.', pricePerDay: 35, dx: -1200, dy: -300 },
    { key: 'projector', icon: 'projector', colors: ['#7c3aed', '#4c1d95'], owner: 'khalid', name: 'بروجكتر إبسون للعروض والسهرات', description: 'بروجكتر Full HD بسطوع 3400 لومن مع شاشة عرض 100 بوصة ووصلة HDMI.', pricePerDay: 75, dx: 1500, dy: 900, bookedBy: 'noura' },
    { key: 'speaker', icon: 'speaker', colors: ['#be123c', '#881337'], owner: 'noura', name: 'سماعة JBL PartyBox مع ميكروفون', description: 'سماعة بلوتوث قوية بإضاءة LED وبطارية تدوم 12 ساعة، مع ميكروفون لاسلكي.', pricePerDay: 50, dx: -2100, dy: 1400 },
    { key: 'gamepad', icon: 'gamepad', colors: ['#0369a1', '#0c4a6e'], owner: 'demo', name: 'بلايستيشن 5 مع يدّين وثلاث ألعاب', description: 'جهاز PS5 نسخة القرص مع يدّين DualSense وثلاث ألعاب (FIFA، Gran Turismo، Spider-Man).', pricePerDay: 45, dx: 2600, dy: -1800 },
    { key: 'cooler', icon: 'cooler', colors: ['#0891b2', '#164e63'], owner: 'khalid', name: 'ثلاجة رحلات كهربائية 40 لتر', description: 'ثلاجة تعمل على ولاعة السيارة والكهرباء المنزلية، تبريد حتى -18 درجة.', pricePerDay: 30, dx: -3100, dy: -2200 },
    { key: 'hammer', icon: 'hammer', colors: ['#a16207', '#713f12'], owner: 'demo', name: 'طقم عدة نجارة متكامل', description: 'شنطة عدة فيها مطرقة ومفكات ومنشار يدوي ومتر وميزان ماء. مناسبة لأعمال الصيانة المنزلية.', pricePerDay: 25, dx: 3800, dy: 1200 },
];

// الحجوزات الجاهزة: المستخدم التجريبي حجز الخيمة، ونورة حجزت البروجكتر
const DEMO_BOOKINGS = [
    { product: 'tent', user: 'demo' },
    { product: 'projector', user: 'noura' },
];

const DEMO_PHONE = '966500000000';

function offsetPoint({ lat, lng }, dx, dy) {
    const dLat = dy / 111320;
    const dLng = dx / (111320 * Math.cos((lat * Math.PI) / 180));
    return { lat: lat + dLat, lng: lng + dLng };
}

function illustrationSvg(item) {
    const [from, to] = item.colors;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">`
        + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`
        + `<pattern id="d" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="#fff" fill-opacity=".12"/></pattern></defs>`
        + `<rect width="800" height="600" fill="url(#g)"/><rect width="800" height="600" fill="url(#d)"/>`
        + `<circle cx="400" cy="300" r="170" fill="#fff" fill-opacity=".1"/>`
        + `<g transform="translate(280 180) scale(10)" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[item.icon]}</g>`
        + `</svg>`;
}

module.exports = {
    DEMO_CENTER,
    DEMO_PASSWORD,
    DEMO_USERS,
    DEMO_PRODUCTS,
    DEMO_BOOKINGS,
    DEMO_PHONE,
    offsetPoint,
    illustrationSvg,
};
