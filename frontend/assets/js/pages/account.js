// pages/account.js — صفحة الحساب: الملف الشخصي، التنبيهات، استعاراتي، إعلاناتي، مشترياتي

import { api } from '../api.js';
import { initPage, requireAuth } from '../session.js';
import {
    el, icon, toast, confirmDialog, openDialog, setBusy, showFormError, emptyState, skeletonCards,
    productImage, formatPrice, formatDate, formatIsoDate, whatsappUrl, priceTag, ratingBadge,
    diffDaysIso, daysLabel,
} from '../ui.js';
import { currentHash } from '../nav.js';
import { openCheckout } from '../checkout.js';

export function init() {
    const borrowedList = document.getElementById('borrowed-list');
    const productList = document.getElementById('product-list');
    const orderList = document.getElementById('order-list');
    const alertsBox = document.getElementById('alerts');
    let user;

    function setCount(id, value) {
        const node = document.getElementById(id);
        if (node) node.textContent = String(value);
    }

    function renderProfile() {
        document.getElementById('profile-avatar').textContent = (user.name || '?').trim().charAt(0).toUpperCase();
        document.getElementById('profile-name').textContent = user.name;
        document.getElementById('profile-email').textContent = user.email;
        const badges = [ratingBadge(user.rating, user.ratingCount)];
        if (user.plan === 'plus') {
            badges.push(el('span', { class: 'badge badge-plus' }, icon('crown'), `Plus حتى ${formatDate(user.planUntil)}`));
        } else {
            badges.push(el('span', { class: 'badge badge-muted-soft', text: 'الباقة المجانية' }),
                el('a', { class: 'link-small', href: '/services.html', text: 'ترقية إلى Plus' }));
        }
        if (user.role === 'admin') badges.push(el('span', { class: 'badge badge-accent', text: 'مشرف' }));
        document.getElementById('profile-badges').replaceChildren(...badges);
    }

    // حالة الحجز بالنسبة لتاريخ اليوم
    function bookingState(booking, today) {
        if (booking.status === 'returned') return { key: 'returned', label: 'منتهٍ', badge: 'badge-muted-soft' };
        const untilEnd = diffDaysIso(today, booking.endDate);
        const untilStart = diffDaysIso(today, booking.startDate);
        if (untilEnd < 0) return { key: 'overdue', label: `متأخر ${daysLabel(-untilEnd)}`, badge: 'badge-danger', days: -untilEnd };
        if (untilStart > 0) return { key: 'upcoming', label: `يبدأ بعد ${daysLabel(untilStart)}`, badge: 'badge-accent', days: untilStart };
        if (untilEnd === 0) return { key: 'due', label: 'الإرجاع اليوم', badge: 'badge-warning', days: 0 };
        return { key: 'active', label: `متبقٍ ${daysLabel(untilEnd)}`, badge: 'badge-success', days: untilEnd };
    }

    function periodText(booking) {
        const days = diffDaysIso(booking.startDate, booking.endDate) + 1;
        return `${formatIsoDate(booking.startDate)} ← ${formatIsoDate(booking.endDate)} (${daysLabel(days)})`;
    }

    // ---------- التنبيهات ----------
    function renderAlerts(overview) {
        const items = [];
        const today = overview.today;
        overview.asBorrower.filter((b) => b.status === 'active').forEach((booking) => {
            const state = bookingState(booking, today);
            const name = booking.product?.name || 'الغرض';
            if (state.key === 'overdue') items.push({ level: 'danger', text: `تجاوزت موعد إرجاع "${name}" بـ ${daysLabel(state.days)}. أرجعه لصاحبه في أقرب وقت.` });
            else if (state.key === 'due') items.push({ level: 'warning', text: `موعد إرجاع "${name}" اليوم.` });
            else if (state.key === 'active' && state.days === 1) items.push({ level: 'info', text: `موعد إرجاع "${name}" غداً.` });
            else if (state.key === 'upcoming' && state.days <= 1) items.push({ level: 'info', text: `موعد استلام "${name}" ${state.days === 0 ? 'اليوم' : 'غداً'}.` });
        });
        overview.asOwner.filter((b) => b.status === 'active').forEach((booking) => {
            const state = bookingState(booking, today);
            if (state.key === 'overdue' || state.key === 'due') {
                items.push({
                    level: state.key === 'overdue' ? 'danger' : 'warning',
                    text: state.key === 'overdue'
                        ? `لم يُرجِع ${booking.counterpart?.name || 'المستعير'} "${booking.product?.name || 'غرضك'}" وتجاوز الموعد بـ ${daysLabel(state.days)}.`
                        : `موعد إرجاع "${booking.product?.name || 'غرضك'}" من ${booking.counterpart?.name || 'المستعير'} اليوم.`,
                    action: () => markReturned(booking),
                    actionLabel: 'تأكيد الاستلام',
                });
            }
        });
        [...overview.asBorrower, ...overview.asOwner].filter((b) => b.canReview).forEach((booking) => {
            items.push({
                level: 'review',
                text: `كيف كانت تجربتك مع ${booking.counterpart.name} في "${booking.product?.name || 'غرض محذوف'}"؟`,
                action: () => openReview(booking),
                actionLabel: 'قيّم الآن',
            });
        });

        alertsBox.hidden = !items.length;
        alertsBox.replaceChildren(...items.map((item) => {
            const button = item.action ? el('button', { type: 'button', class: 'btn btn-sm btn-secondary', text: item.actionLabel }) : null;
            if (button) button.addEventListener('click', () => item.action(button));
            return el('div', { class: `alert alert-${item.level}` },
                icon(item.level === 'review' ? 'star' : item.level === 'info' ? 'clock' : 'alert'),
                el('p', { text: item.text }),
                button);
        }));
    }

    // ---------- استعاراتي ----------
    function borrowedCard(booking, today) {
        const { product } = booking;
        const state = bookingState(booking, today);
        const actions = [];
        if (booking.status === 'active' && product) {
            const waUrl = whatsappUrl(product.phoneNumber, `مرحباً، حجزت "${product.name}" عبر GeoSave للفترة ${booking.startDate} إلى ${booking.endDate}.`);
            if (waUrl) actions.push(el('a', { class: 'btn btn-whatsapp btn-sm', href: waUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('chat'), 'تواصل عبر واتساب'));
            const cancelBtn = el('button', { type: 'button', class: 'btn btn-danger-ghost btn-sm' }, icon('x'), 'إلغاء الحجز');
            cancelBtn.addEventListener('click', () => cancelBooking(booking, cancelBtn));
            actions.push(cancelBtn);
        }
        if (booking.canReview) {
            const reviewBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, icon('star'), 'قيّم المالك');
            reviewBtn.addEventListener('click', () => openReview(booking));
            actions.push(reviewBtn);
        }

        return el('article', { class: `card list-card ${state.key === 'overdue' ? 'is-overdue' : ''}` },
            el('div', { class: 'list-media' }, productImage(product?.image, product?.name)),
            el('div', { class: 'list-body' },
                el('div', { class: 'list-head' },
                    el('h3', { class: 'card-title', text: product?.name || 'إعلان محذوف' }),
                    el('span', { class: `badge ${state.badge}`, text: state.label })),
                el('ul', { class: 'list-facts' },
                    el('li', {}, icon('calendar'), el('span', { text: periodText(booking) })),
                    el('li', {}, icon('user'), el('span', { text: booking.counterpart?.name || 'المالك' }), booking.counterpart ? ratingBadge(booking.counterpart.rating, booking.counterpart.ratingCount, { compact: true }) : null),
                    product ? el('li', {}, priceTag(product.pricePerDay)) : null,
                    product && Number(product.deposit) ? el('li', {}, icon('shield'), el('span', { text: `تأمين ${formatPrice(product.deposit)} (بينك وبين المالك)` })) : null),
                actions.length ? el('div', { class: 'list-actions' }, ...actions) : null));
    }

    // ---------- إعلاناتي ----------
    function productCard(product, today) {
        const booked = product.status === 'booked';
        const booking = product.booking;
        const actions = [];
        if (booking) {
            const returnBtn = el('button', { type: 'button', class: 'btn btn-primary btn-sm' }, icon('check'), 'تأكيد استلام الغرض');
            returnBtn.addEventListener('click', () => markReturned({ _id: booking._id, product, counterpart: { name: booking.bookedBy } }, returnBtn));
            const cancelBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, icon('x'), 'إلغاء الحجز');
            cancelBtn.addEventListener('click', () => cancelBooking({ _id: booking._id, product }, cancelBtn, true));
            actions.push(returnBtn, cancelBtn);
        }
        const featureBtn = el('button', { type: 'button', class: 'btn btn-accent-soft btn-sm' }, icon('sparkles'), product.isFeatured ? 'تمديد التمييز' : 'ميّز الإعلان');
        featureBtn.addEventListener('click', async () => {
            if (await openCheckout(['featured_7', 'featured_30'], { productId: product._id, subject: product.name })) {
                await Promise.all([loadProducts(), loadOrders()]);
            }
        });
        const deleteBtn = el('button', { type: 'button', class: 'btn btn-danger-ghost btn-sm' }, icon('trash'), 'حذف');
        deleteBtn.addEventListener('click', () => deleteProduct(product, deleteBtn));
        actions.push(featureBtn, deleteBtn);

        const state = booking ? bookingState({ ...booking, status: 'active' }, today) : null;
        return el('article', { class: `card list-card ${booked ? 'is-booked' : ''} ${state?.key === 'overdue' ? 'is-overdue' : ''}` },
            el('div', { class: 'list-media' }, productImage(product.image, product.name)),
            el('div', { class: 'list-body' },
                el('div', { class: 'list-head' },
                    el('h3', { class: 'card-title', text: product.name }),
                    el('div', { class: 'card-badges static' },
                        product.isFeatured ? el('span', { class: 'badge badge-featured' }, icon('sparkles'), `مميز حتى ${formatDate(product.featuredUntil)}`) : null,
                        el('span', { class: `badge ${booked ? 'badge-warning' : 'badge-success'}`, text: booked ? 'محجوز' : 'متاح' }))),
                el('ul', { class: 'list-facts' },
                    el('li', {}, priceTag(product.pricePerDay)),
                    el('li', {}, icon('clock'), el('span', { text: `حتى ${daysLabel(product.maxDays || 7)}` })),
                    Number(product.deposit) ? el('li', {}, icon('shield'), el('span', { text: `تأمين ${formatPrice(product.deposit)}` })) : null,
                    el('li', {}, icon('calendar'), el('span', { text: `نُشر في ${formatDate(product.createdAt)}` }))),
                booking ? el('div', { class: `booking-strip ${state.key === 'overdue' ? 'is-overdue' : ''}` },
                    icon('bookmark'),
                    el('span', { text: `محجوز لـ ${booking.bookedBy || 'مستخدم'} · ${periodText(booking)}` }),
                    ratingBadge(booking.bookedByRating, booking.bookedByRating ? 1 : 0, { compact: true }),
                    el('span', { class: `badge ${state.badge}`, text: state.label })) : null,
                el('div', { class: 'list-actions' }, ...actions)));
    }

    // ---------- مشترياتي ----------
    function orderCard(order) {
        const labels = { paid: ['مدفوع', 'badge-success'], pending: ['بانتظار الدفع', 'badge-warning'], failed: ['لم يكتمل', 'badge-danger'] };
        const [label, badge] = labels[order.status] || labels.pending;
        return el('article', { class: 'card order-card' },
            el('div', { class: 'order-icon' }, icon('receipt')),
            el('div', { class: 'order-body' },
                el('div', { class: 'list-head' },
                    el('h3', { class: 'card-title', text: order.title }),
                    el('span', { class: `badge ${badge}`, text: label })),
                el('p', { class: 'muted small', text: `رقم الطلب ${String(order._id).slice(-8).toUpperCase()} · ${formatDate(order.paidAt || order.createdAt)}` }),
                el('p', { class: 'order-amount' },
                    el('strong', { text: formatPrice(order.amount) }),
                    el('span', { class: 'muted small', text: ` شامل ضريبة القيمة المضافة ${formatPrice(order.vatAmount)}` }))));
    }

    // ---------- التحميل ----------
    let overview = null;

    async function loadOverview() {
        borrowedList.replaceChildren(...skeletonCards(2));
        try {
            overview = await api('/bookings/overview');
            const active = overview.asBorrower.filter((b) => b.status === 'active').length;
            setCount('active-count', active);
            const sorted = [...overview.asBorrower].sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1));
            borrowedList.replaceChildren(...(sorted.length
                ? sorted.map((booking) => borrowedCard(booking, overview.today))
                : [emptyState('bookmark', 'لم تستعر أي غرض بعد', 'تصفح الأغراض القريبة منك واستعر ما تحتاجه بدل شرائه.',
                    el('a', { class: 'btn btn-primary', href: '/' }, icon('search'), 'تصفح الأغراض'))]));
            renderAlerts(overview);
        } catch (error) {
            borrowedList.replaceChildren(emptyState('alert', 'تعذر تحميل الاستعارات', error.message));
        }
    }

    async function loadProducts() {
        productList.replaceChildren(...skeletonCards(2));
        try {
            const { items, limit } = await api('/products/mine');
            setCount('product-count', limit ? `${items.length}/${limit}` : items.length);
            const today = overview?.today || new Date().toISOString().slice(0, 10);
            productList.replaceChildren(...(items.length
                ? items.map((product) => productCard(product, today))
                : [emptyState('box', 'لم تنشر أي إعلان بعد', 'اعرض أغراضك للإعارة أو التأجير وساعد جيرانك.',
                    el('a', { class: 'btn btn-primary', href: '/add-product.html' }, icon('plus'), 'أضف إعلاناً'))]));
        } catch (error) {
            productList.replaceChildren(emptyState('alert', 'تعذر تحميل الإعلانات', error.message));
        }
    }

    async function loadOrders() {
        orderList.replaceChildren(...skeletonCards(1));
        try {
            const { items } = await api('/services/orders');
            orderList.replaceChildren(...(items.length
                ? items.map(orderCard)
                : [emptyState('receipt', 'لا توجد مشتريات', 'ميّز إعلاناتك أو اشترك في Plus لتحصل على ظهور أكبر.',
                    el('a', { class: 'btn btn-primary', href: '/services.html' }, icon('sparkles'), 'استعرض الخدمات'))]));
        } catch (error) {
            orderList.replaceChildren(emptyState('alert', 'تعذر تحميل المشتريات', error.message));
        }
    }

    async function refreshAll() {
        await loadOverview();
        await Promise.all([loadProducts(), loadOrders()]);
    }

    // ---------- الإجراءات ----------
    async function cancelBooking(booking, button, asOwner = false) {
        const name = booking.product?.name || 'الغرض';
        const message = asOwner ? `هل تريد إلغاء الحجز على "${name}" وإتاحته للآخرين؟` : `هل تريد إلغاء حجزك لـ "${name}"؟`;
        if (!(await confirmDialog(message, { confirmText: 'نعم، إلغاء', danger: true }))) return;
        setBusy(button, true, 'جارٍ الإلغاء…');
        try {
            await api(`/bookings/${encodeURIComponent(booking._id)}`, { method: 'DELETE' });
            toast('تم إلغاء الحجز.', 'success');
            await refreshAll();
        } catch (error) {
            toast(error.message, 'error');
            setBusy(button, false);
        }
    }

    async function markReturned(booking, button) {
        const who = booking.counterpart?.name || 'المستعير';
        if (!(await confirmDialog(`هل استلمت "${booking.product?.name || 'الغرض'}" من ${who}؟ سيصبح متاحاً للحجز مجدداً.`, { confirmText: 'نعم، استلمته' }))) return;
        if (button) setBusy(button, true, 'جارٍ التأكيد…');
        try {
            await api(`/bookings/${encodeURIComponent(booking._id)}/return`, { method: 'POST' });
            toast('تم تأكيد الإرجاع. يمكنك الآن تقييم المستعير.', 'success');
            await refreshAll();
        } catch (error) {
            toast(error.message, 'error');
            if (button) setBusy(button, false);
        }
    }

    function openReview(booking) {
        const target = booking.role === 'borrower' ? 'المالك' : 'المستعير';
        const stars = el('div', { class: 'star-input', role: 'radiogroup', 'aria-label': 'التقييم' },
            ...[5, 4, 3, 2, 1].map((value) => el('label', { title: `${value} من 5` },
                el('input', { type: 'radio', name: 'rating', value: String(value), required: true }),
                el('span', { 'aria-hidden': 'true', text: '★' }),
                el('span', { class: 'sr-only', text: `${value} نجوم` }))));
        const comment = el('textarea', { name: 'comment', id: 'review-comment', maxlength: '300', rows: '3', placeholder: 'اكتب ملاحظة مختصرة (اختياري)' });
        const submit = el('button', { type: 'submit', class: 'btn btn-primary btn-block' }, icon('star'), 'إرسال التقييم');
        const form = el('form', { class: 'form review-form', novalidate: true },
            el('div', { class: 'checkout-head' },
                el('span', { class: 'auth-icon' }, icon('star')),
                el('h2', { text: `قيّم ${target}: ${booking.counterpart?.name || ''}` }),
                el('p', { class: 'muted', text: booking.product?.name || '' })),
            stars,
            el('div', { class: 'field' }, el('label', { for: 'review-comment', text: 'تعليقك' }), comment),
            submit);
        const dialog = openDialog(form, { label: 'تقييم', className: 'dialog-sm' });
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            showFormError(form, '');
            const rating = Number(form.elements.namedItem('rating').value);
            if (!rating) {
                showFormError(form, 'اختر عدد النجوم.');
                return;
            }
            setBusy(submit, true, 'جارٍ الإرسال…');
            try {
                await api(`/bookings/${encodeURIComponent(booking._id)}/review`, { method: 'POST', body: { rating, comment: comment.value.trim() } });
                dialog.close();
                toast('شكراً لتقييمك.', 'success');
                await loadOverview();
            } catch (error) {
                showFormError(form, error.message);
                setBusy(submit, false);
            }
        });
    }

    async function deleteProduct(product, button) {
        if (!(await confirmDialog(`هل تريد حذف "${product.name}" نهائياً؟`, { confirmText: 'حذف', danger: true }))) return;
        setBusy(button, true, 'جارٍ الحذف…');
        try {
            await api(`/products/${encodeURIComponent(product._id)}`, { method: 'DELETE' });
            toast('تم حذف الإعلان.', 'success');
            await loadProducts();
        } catch (error) {
            toast(error.message, 'error');
            setBusy(button, false);
        }
    }

    // التبويبات
    function initTabs() {
        const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
        const select = (tab) => {
            tabs.forEach((t) => {
                const active = t === tab;
                t.setAttribute('aria-selected', String(active));
                t.tabIndex = active ? 0 : -1;
                document.getElementById(t.getAttribute('aria-controls')).hidden = !active;
            });
        };
        tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => select(tab));
            tab.addEventListener('keydown', (event) => {
                // في الاتجاه RTL: السهم الأيسر يعني التالي
                const delta = { ArrowLeft: 1, ArrowRight: -1 }[event.key];
                if (!delta) return;
                event.preventDefault();
                const next = tabs[(index + delta + tabs.length) % tabs.length];
                select(next);
                next.focus();
            });
        });
        const syncWithHash = () => {
            const hash = currentHash();
            select(hash === '#products' ? tabs[1] : hash === '#orders' ? tabs[2] : tabs[0]);
        };
        if (!window.__GEOSAVE_SPA__) window.addEventListener('hashchange', syncWithHash);
        syncWithHash();
    }

    (async () => {
        await initPage();
        user = await requireAuth();
        if (!user) return;
        document.getElementById('page-content').hidden = false;
        renderProfile();
        initTabs();
        await refreshAll();
    })();
}

// في الموقع العادي تعمل الصفحة مباشرة، وفي النسخة التجريبية يستدعيها الموجّه
if (!window.__GEOSAVE_SPA__) init();
