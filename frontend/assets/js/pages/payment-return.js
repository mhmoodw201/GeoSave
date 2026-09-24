// pages/payment-return.js — العودة من بوابة الدفع: الخادم يتحقق من الدفع مباشرة لدى البوابة

import { api } from '../api.js';
import { initPage, requireAuth } from '../session.js';
import { el, icon } from '../ui.js';
import { currentSearch } from '../nav.js';

export function init() {
    const box = document.getElementById('payment-result');

    function show(kind, title, text, links) {
        const iconName = { paid: 'check', pending: 'clock', failed: 'alert' }[kind];
        box.replaceChildren(
            el('span', { class: `auth-icon is-${kind}` }, icon(iconName)),
            el('h1', { text: title }),
            el('p', { class: 'muted', text }),
            el('div', { class: 'empty-actions' }, ...links));
    }

    async function verify(orderId, attempt = 0) {
        try {
            const { status } = await api(`/services/orders/${orderId}/verify`, { method: 'POST' });
            if (status === 'paid') {
                show('paid', 'تم الدفع بنجاح', 'فُعّلت الخدمة على حسابك، وتجد الإيصال في صفحة مشترياتي.', [
                    el('a', { class: 'btn btn-primary', href: '/account.html#orders' }, icon('receipt'), 'مشترياتي'),
                    el('a', { class: 'btn btn-secondary', href: '/account.html#products' }, icon('box'), 'إعلاناتي'),
                ]);
            } else if (status === 'failed') {
                show('failed', 'لم تكتمل عملية الدفع', 'لم يتم خصم أي مبلغ مقابل هذه الخدمة. يمكنك المحاولة مرة أخرى.', [
                    el('a', { class: 'btn btn-primary', href: '/services.html' }, 'العودة للخدمات'),
                ]);
            } else if (attempt < 4) {
                setTimeout(() => verify(orderId, attempt + 1), 2500);
            } else {
                show('pending', 'الدفع قيد المعالجة', 'لم يصلنا تأكيد الدفع بعد. ستتحدث حالة الطلب في صفحة مشترياتي خلال دقائق.', [
                    el('a', { class: 'btn btn-primary', href: '/account.html#orders' }, 'مشترياتي'),
                ]);
            }
        } catch (error) {
            show('failed', 'تعذر التحقق من الدفع', error.message, [
                el('a', { class: 'btn btn-primary', href: '/account.html#orders' }, 'مشترياتي'),
            ]);
        }
    }

    (async () => {
        await initPage();
        if (!(await requireAuth())) return;
        const orderId = new URLSearchParams(currentSearch()).get('order') || '';
        if (!/^[a-f\d]{24}$/i.test(orderId)) {
            show('failed', 'رابط غير صالح', 'لم نتمكن من التعرف على عملية الدفع.', [el('a', { class: 'btn btn-primary', href: '/' }, 'الرئيسية')]);
            return;
        }
        verify(orderId);
    })();
}

// في الموقع العادي تعمل الصفحة مباشرة، وفي النسخة التجريبية يستدعيها الموجّه
if (!window.__GEOSAVE_SPA__) init();
