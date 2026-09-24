// pages/services.js — الخدمات والباقات

import { initPage, resetSession, getCurrentUser } from '../session.js';
import {
    el, icon, emptyState, formatPrice, formatDate,
} from '../ui.js';
import { navigate } from '../nav.js';
import { getCatalog, openCheckout } from '../checkout.js';

export function init() {
    const plansBox = document.getElementById('plans');

    function feature(text, included = true) {
        return el('li', { class: included ? '' : 'is-off' }, icon(included ? 'check' : 'x'), el('span', { text }));
    }

    function plan({ name, price, period, features, action, highlight, badge }) {
        return el('article', { class: `card plan ${highlight ? 'is-highlight' : ''}` },
            badge ? el('span', { class: 'plan-badge', text: badge }) : null,
            el('h2', { class: 'plan-name', text: name }),
            el('p', { class: 'plan-price' }, el('strong', { text: price }), period ? el('span', { class: 'muted', text: period }) : null),
            el('ul', { class: 'plan-features' }, ...features),
            action);
    }

    async function render(user) {
        plansBox.replaceChildren(el('p', { class: 'muted center-text', text: 'جارٍ تحميل الباقات…' }));
        let catalog;
        try {
            catalog = await getCatalog();
        } catch (error) {
            plansBox.replaceChildren(emptyState('alert', 'تعذر تحميل الخدمات', error.message));
            return;
        }
        const byKey = Object.fromEntries(catalog.services.map((service) => [service.key, service]));
        const plus = byKey.plus_30;
        const featured7 = byKey.featured_7;
        const featured30 = byKey.featured_30;
        const isPlus = user?.plan === 'plus';

        let plusAction;
        if (!user) {
            plusAction = el('a', { class: 'btn btn-primary btn-block', href: '/login.html?next=%2Fservices.html' }, icon('login'), 'سجّل الدخول للاشتراك');
        } else if (!catalog.paymentsEnabled) {
            plusAction = el('button', { type: 'button', class: 'btn btn-secondary btn-block', disabled: true, text: 'غير متاح حالياً' });
        } else {
            plusAction = el('button', { type: 'button', class: 'btn btn-primary btn-block' }, icon('crown'), isPlus ? 'تمديد الاشتراك شهراً' : 'اشترك الآن');
            plusAction.addEventListener('click', async () => {
                if (await openCheckout(['plus_30'])) {
                    resetSession();
                    navigate('/services.html', { replace: true });
                }
            });
        }

        const featureAction = user
            ? el('a', { class: 'btn btn-secondary btn-block', href: '/account.html#products' }, icon('sparkles'), 'اختر إعلاناً لتمييزه')
            : el('a', { class: 'btn btn-secondary btn-block', href: '/login.html?next=%2Fservices.html' }, icon('login'), 'سجّل الدخول');

        plansBox.replaceChildren(
            plan({
                name: 'الأساسية',
                price: 'مجاناً',
                period: ' دائماً',
                features: [
                    feature(`حتى ${catalog.freeListingLimit} إعلانات`),
                    feature('البحث والاستعارة والحجز بلا حدود'),
                    feature('التقييمات والتنبيهات'),
                    feature('بدون عمولة على الاستعارة أو التأجير'),
                ],
                action: el('a', { class: 'btn btn-ghost btn-block', href: user ? '/add-product.html' : '/register.html', text: user ? 'أضف إعلاناً' : 'أنشئ حساباً مجاناً' }),
            }),
            plan({
                name: 'GeoSave Plus',
                price: formatPrice(plus.total),
                period: ' / شهر',
                highlight: true,
                badge: isPlus ? `مشترك حتى ${formatDate(user.planUntil)}` : 'الأكثر فائدة',
                features: [
                    feature('إعلانات غير محدودة'),
                    feature('شارة Plus بجانب اسمك في كل إعلان'),
                    feature('كل مزايا الباقة الأساسية'),
                    feature('بدون تجديد تلقائي'),
                ],
                action: plusAction,
            }),
            plan({
                name: 'تمييز إعلان',
                price: `${formatPrice(featured7.total)}`,
                period: ` / ${featured7.days} أيام`,
                features: [
                    feature('ظهور في أعلى نتائج البحث القريبة'),
                    feature('شارة "مميز" على الإعلان'),
                    feature(`أو ${formatPrice(featured30.total)} لمدة ${featured30.days} يوماً`),
                    feature('يمكن تمديده في أي وقت'),
                ],
                action: featureAction,
            }),
        );
        plansBox.append(el('p', { class: 'hint center-text plans-note', text: 'جميع الأسعار بالريال السعودي وشاملة ضريبة القيمة المضافة 15%.' }));
    }

    (async () => {
        const user = await initPage();
        // بيانات الباقة من الخادم مباشرة (قد تتغير بعد الشراء)
        render(user ? await getCurrentUser() : null);
    })();
}

// في الموقع العادي تعمل الصفحة مباشرة، وفي النسخة التجريبية يستدعيها الموجّه
if (!window.__GEOSAVE_SPA__) init();
