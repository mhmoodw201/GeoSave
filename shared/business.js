// shared/business.js
// قواعد العمل المشتركة بين الخادم والنسخة التجريبية: الخدمات الرقمية المدفوعة، حدود الباقة المجانية،
// وإصدار شروط الاستخدام. الأسعار شاملة ضريبة القيمة المضافة (15%) كما يلزم عرضها للمستهلك.

const VAT_RATE = 0.15;
const CURRENCY = 'SAR';

// عند تعديل نص الشروط جوهرياً: غيّر الإصدار حتى يُطلب من المستخدمين الموافقة من جديد عند الحجز
const TERMS_VERSION = '2026-09-24';

const FREE_LISTING_LIMIT = 5;
const MAX_BOOKING_DAYS = 30;
const MAX_BOOKING_LEAD_DAYS = 60;
const MAX_DEPOSIT = 100000;

const SERVICES = {
    featured_7: {
        kind: 'featured',
        days: 7,
        price: 9,
        title: 'تمييز إعلان لمدة 7 أيام',
        description: 'يظهر إعلانك في أعلى نتائج البحث في منطقتك مع شارة "مميز".',
    },
    featured_30: {
        kind: 'featured',
        days: 30,
        price: 29,
        title: 'تمييز إعلان لمدة 30 يوماً',
        description: 'أفضل قيمة لمن يعرض غرضاً باستمرار: ظهور مميز لشهر كامل.',
    },
    plus_30: {
        kind: 'plus',
        days: 30,
        price: 19,
        title: 'اشتراك GeoSave Plus (شهري)',
        description: `إعلانات غير محدودة بدل ${FREE_LISTING_LIMIT} إعلانات، وشارة Plus بجانب اسمك.`,
    },
};

/** يفصل السعر الشامل إلى صافي وضريبة (بالهللة لتجنب أخطاء الكسور) */
function priceBreakdown(total) {
    const totalHalalas = Math.round(total * 100);
    const netHalalas = Math.round(totalHalalas / (1 + VAT_RATE));
    return {
        total: totalHalalas / 100,
        net: netHalalas / 100,
        vat: (totalHalalas - netHalalas) / 100,
        vatRate: VAT_RATE,
        currency: CURRENCY,
    };
}

function publicCatalog() {
    return Object.entries(SERVICES).map(([key, service]) => ({ key, ...service, ...priceBreakdown(service.price) }));
}

function isPlusActive(user, now = Date.now()) {
    return Boolean(user && user.plan === 'plus' && user.planUntil && new Date(user.planUntil).getTime() > now);
}

module.exports = {
    VAT_RATE,
    CURRENCY,
    TERMS_VERSION,
    FREE_LISTING_LIMIT,
    MAX_BOOKING_DAYS,
    MAX_BOOKING_LEAD_DAYS,
    MAX_DEPOSIT,
    SERVICES,
    priceBreakdown,
    publicCatalog,
    isPlusActive,
};
