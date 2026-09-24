// checkout.js — شراء الخدمات الرقمية (تمييز الإعلان، اشتراك Plus)
// المبلغ يُحسب في الخادم؛ الواجهة تعرض السعر الشامل للضريبة وتطلب تأكيد المستخدم فقط.

import { api } from './api.js';
import {
    el, icon, openDialog, setBusy, showFormError, formatPrice, toast,
} from './ui.js';

let catalogPromise;

export function getCatalog() {
    if (!catalogPromise) {
        catalogPromise = api('/services').catch((error) => {
            catalogPromise = undefined;
            throw error;
        });
    }
    return catalogPromise;
}

export function priceLines(service) {
    return el('dl', { class: 'price-lines' },
        el('div', {}, el('dt', { text: 'السعر قبل الضريبة' }), el('dd', { text: formatPrice(service.net) })),
        el('div', {}, el('dt', { text: `ضريبة القيمة المضافة (${Math.round(service.vatRate * 100)}%)` }), el('dd', { text: formatPrice(service.vat) })),
        el('div', { class: 'price-total' }, el('dt', { text: 'الإجمالي' }), el('dd', { text: formatPrice(service.total) })));
}

/**
 * يفتح نافذة تأكيد الشراء. يعيد true إذا اكتمل الدفع وفُعّلت الخدمة.
 * @param {string[]} serviceKeys الخدمات المعروضة للاختيار
 * @param {{ productId?: string, subject?: string }} [options]
 */
export async function openCheckout(serviceKeys, { productId, subject } = {}) {
    const catalog = await getCatalog();
    const services = catalog.services.filter((service) => serviceKeys.includes(service.key));
    if (!catalog.paymentsEnabled) {
        toast('الخدمات المدفوعة غير متاحة حالياً.', 'error');
        return false;
    }

    return new Promise((resolve) => {
        let done = false;
        const lines = el('div', { class: 'checkout-lines' });
        const options = el('div', { class: 'choice-grid' }, ...services.map((service, index) => el('label', { class: 'choice' },
            el('input', { type: 'radio', name: 'service', value: service.key, checked: index === 0 }),
            el('span', { class: 'choice-body' },
                icon(service.kind === 'plus' ? 'crown' : 'sparkles'),
                el('strong', { text: service.title }),
                el('span', { class: 'choice-price', text: formatPrice(service.total) }),
                el('span', { class: 'hint', text: service.description })))));
        const accept = el('input', { type: 'checkbox', id: 'checkout-accept', required: true });
        const submit = el('button', { type: 'submit', class: 'btn btn-primary btn-block' }, icon('lock'), 'متابعة للدفع');
        const form = el('form', { class: 'form checkout', novalidate: true },
            el('div', { class: 'checkout-head' },
                el('span', { class: 'auth-icon' }, icon('sparkles')),
                el('h2', { text: 'تأكيد شراء خدمة رقمية' }),
                subject ? el('p', { class: 'muted', text: subject }) : null),
            options,
            lines,
            el('label', { class: 'check' }, accept,
                el('span', {}, 'أوافق على أن هذه خدمة رقمية تُفعَّل فوراً ولا تُسترد بعد التفعيل إلا في حال تعذر تقديمها لخلل تقني، وفق ',
                    el('a', { href: '/terms.html#services', target: '_blank', rel: 'noopener', text: 'شروط الاستخدام' }), '.')),
            submit,
            el('p', { class: 'hint center-text', text: catalog.provider === 'mock'
                ? 'بيئة تجريبية: الدفع محاكاة ولن تُخصم أي مبالغ.'
                : 'الدفع عبر بوابة دفع مرخّصة من البنك المركزي السعودي. لا نخزن بيانات بطاقتك.' }));

        const selected = () => services.find((service) => service.key === form.elements.namedItem('service').value) || services[0];
        const renderLines = () => lines.replaceChildren(priceLines(selected()));
        form.addEventListener('change', renderLines);
        renderLines();

        const dialog = openDialog(form, { label: 'تأكيد الشراء', className: 'dialog-md' });
        dialog.addEventListener('close', () => resolve(done));

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            showFormError(form, '');
            if (!accept.checked) {
                showFormError(form, 'يجب الموافقة على شروط الخدمة قبل المتابعة.');
                return;
            }
            setBusy(submit, true, 'جارٍ إنشاء الطلب…');
            try {
                const result = await api('/services/checkout', { method: 'POST', body: { service: selected().key, productId } });
                if (result.status === 'paid') {
                    done = true;
                    toast('تم الدفع وتفعيل الخدمة بنجاح.', 'success');
                    dialog.close();
                } else if (result.redirectUrl && /^https:\/\//.test(result.redirectUrl)) {
                    window.location.href = result.redirectUrl; // صفحة الدفع الآمنة لدى بوابة الدفع
                } else {
                    throw new Error('تعذر بدء عملية الدفع.');
                }
            } catch (error) {
                showFormError(form, error.message);
                setBusy(submit, false);
            }
        });
    });
}
