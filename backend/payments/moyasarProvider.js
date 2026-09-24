// payments/moyasarProvider.js
// الدفع عبر فواتير Moyasar (بوابة دفع سعودية مرخّصة من البنك المركزي السعودي).
// يُعاد توجيه المستخدم لصفحة الدفع الآمنة لدى Moyasar، ثم يتحقق الخادم من حالة الفاتورة مباشرة
// من Moyasar (لا نثق بأي معامل في رابط العودة) ويطابق المبلغ والعملة قبل تفعيل الخدمة.
// المرجع: https://docs.moyasar.com/api/invoices

const config = require('../config');
const HttpError = require('../utils/httpError');

const API = 'https://api.moyasar.com/v1';

function authHeader() {
    return `Basic ${Buffer.from(`${config.payments.moyasarSecretKey}:`).toString('base64')}`;
}

async function request(path, options = {}) {
    let response;
    try {
        response = await fetch(`${API}${path}`, {
            ...options,
            headers: { Authorization: authHeader(), 'Content-Type': 'application/json', ...(options.headers || {}) },
            signal: AbortSignal.timeout(15000),
        });
    } catch {
        throw new HttpError(502, 'تعذر الاتصال ببوابة الدفع، حاول لاحقاً.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        console.error('[moyasar] request failed:', response.status, data && data.message);
        throw new HttpError(502, 'تعذر إكمال العملية مع بوابة الدفع، حاول لاحقاً.');
    }
    return data;
}

module.exports = {
    name: 'moyasar',

    async createCheckout(order, { description }) {
        const returnUrl = `${config.payments.publicUrl}/payment-return.html?order=${order._id}`;
        const invoice = await request('/invoices', {
            method: 'POST',
            body: JSON.stringify({
                amount: Math.round(order.amount * 100), // بالهللة
                currency: order.currency,
                description,
                success_url: returnUrl,
                back_url: `${config.payments.publicUrl}/services.html`,
                metadata: { order_id: String(order._id) },
            }),
        });
        if (!invoice.id || typeof invoice.url !== 'string' || !invoice.url.startsWith('https://')) {
            throw new HttpError(502, 'استجابة غير متوقعة من بوابة الدفع.');
        }
        return { providerRef: invoice.id, redirectUrl: invoice.url, paidImmediately: false };
    },

    async verify(order) {
        if (!order.providerRef) return { paid: false };
        const invoice = await request(`/invoices/${encodeURIComponent(order.providerRef)}`);
        const paid = invoice.status === 'paid'
            && invoice.amount === Math.round(order.amount * 100)
            && String(invoice.currency).toUpperCase() === order.currency
            && (!invoice.metadata || !invoice.metadata.order_id || invoice.metadata.order_id === String(order._id));
        return { paid, failed: ['failed', 'expired', 'canceled', 'voided'].includes(invoice.status) };
    },
};
