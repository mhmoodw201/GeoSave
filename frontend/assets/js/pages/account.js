// pages/account.js — صفحة الحساب: الملف الشخصي، حجوزاتي، إعلاناتي

import { api } from '../api.js';
import { initPage, requireAuth } from '../session.js';
import {
    el, icon, toast, confirmDialog, setBusy, emptyState, skeletonCards,
    productImage, formatPrice, formatDate, whatsappUrl,
} from '../ui.js';

const bookingList = document.getElementById('booking-list');
const productList = document.getElementById('product-list');

function renderProfile(user) {
    document.getElementById('profile-avatar').textContent = (user.name || '?').trim().charAt(0).toUpperCase();
    document.getElementById('profile-name').textContent = user.name;
    document.getElementById('profile-email').textContent = user.email;
    if (user.role === 'admin') document.getElementById('profile-role').hidden = false;
}

function setCount(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = String(value);
}

function bookingCard(booking) {
    const { product } = booking;
    const waUrl = whatsappUrl(product.phoneNumber, `مرحباً، قمت بحجز "${product.name}" عبر GeoSave.`);
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-danger-ghost btn-sm' }, icon('x'), 'إلغاء الحجز');
    cancelBtn.addEventListener('click', () => cancelBooking(booking._id, product.name, cancelBtn));

    return el('article', { class: 'card list-card' },
        el('div', { class: 'list-media' }, productImage(product.image, product.name)),
        el('div', { class: 'list-body' },
            el('div', { class: 'list-head' },
                el('h3', { class: 'card-title', text: product.name }),
                el('span', { class: 'price' }, el('strong', { text: formatPrice(product.pricePerDay) }), el('small', { text: ' / يوم' }))),
            el('p', { class: 'list-description', text: product.description }),
            el('ul', { class: 'list-facts' },
                el('li', {}, icon('user'), el('span', { text: product.ownerName || 'المالك' })),
                el('li', {}, icon('calendar'), el('span', { text: `حُجز في ${formatDate(booking.createdAt)}` }))),
            el('div', { class: 'list-actions' },
                waUrl
                    ? el('a', { class: 'btn btn-whatsapp btn-sm', href: waUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('chat'), 'تواصل عبر واتساب')
                    : null,
                cancelBtn)));
}

function productCard(product) {
    const booked = product.status === 'booked';
    const deleteBtn = el('button', { type: 'button', class: 'btn btn-danger-ghost btn-sm' }, icon('trash'), 'حذف');
    deleteBtn.addEventListener('click', () => deleteProduct(product._id, product.name, deleteBtn));

    let releaseBtn = null;
    if (booked && product.booking) {
        releaseBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, icon('refresh'), 'إنهاء الحجز');
        releaseBtn.addEventListener('click', () => cancelBooking(product.booking._id, product.name, releaseBtn, true));
    }

    return el('article', { class: `card list-card ${booked ? 'is-booked' : ''}` },
        el('div', { class: 'list-media' }, productImage(product.image, product.name)),
        el('div', { class: 'list-body' },
            el('div', { class: 'list-head' },
                el('h3', { class: 'card-title', text: product.name }),
                el('span', { class: `badge ${booked ? 'badge-warning' : 'badge-success'}`, text: booked ? 'محجوز' : 'متاح' })),
            el('p', { class: 'list-description', text: product.description }),
            el('ul', { class: 'list-facts' },
                el('li', {}, icon('cash'), el('span', { text: `${formatPrice(product.pricePerDay)} / يوم` })),
                el('li', {}, icon('calendar'), el('span', { text: `نُشر في ${formatDate(product.createdAt)}` })),
                booked && product.booking?.bookedBy
                    ? el('li', {}, icon('bookmark'), el('span', { text: `محجوز بواسطة ${product.booking.bookedBy}` }))
                    : null),
            el('div', { class: 'list-actions' }, releaseBtn, deleteBtn)));
}

async function loadBookings() {
    bookingList.replaceChildren(...skeletonCards(2));
    try {
        const { items } = await api('/bookings/mine');
        setCount('booking-count', items.length);
        bookingList.replaceChildren(...(items.length
            ? items.map(bookingCard)
            : [emptyState('bookmark', 'لا توجد حجوزات بعد', 'تصفح المنتجات القريبة منك واحجز ما تحتاجه.',
                el('a', { class: 'btn btn-primary', href: '/' }, icon('search'), 'تصفح المنتجات'))]));
    } catch (error) {
        bookingList.replaceChildren(emptyState('alert', 'تعذر تحميل الحجوزات', error.message));
    }
}

async function loadProducts() {
    productList.replaceChildren(...skeletonCards(2));
    try {
        const { items } = await api('/products/mine');
        setCount('product-count', items.length);
        productList.replaceChildren(...(items.length
            ? items.map(productCard)
            : [emptyState('box', 'لم تنشر أي إعلان بعد', 'اعرض أغراضك للإيجار واربح منها.',
                el('a', { class: 'btn btn-primary', href: '/add-product.html' }, icon('plus'), 'أضف إعلاناً'))]));
    } catch (error) {
        productList.replaceChildren(emptyState('alert', 'تعذر تحميل الإعلانات', error.message));
    }
}

async function cancelBooking(id, name, button, asOwner = false) {
    const message = asOwner
        ? `هل تريد إنهاء الحجز على "${name}" وإتاحته للآخرين؟`
        : `هل تريد إلغاء حجزك لـ "${name}"؟`;
    if (!(await confirmDialog(message, { confirmText: 'نعم، إلغاء', danger: true }))) return;
    setBusy(button, true, 'جارٍ الإلغاء…');
    try {
        await api(`/bookings/${encodeURIComponent(id)}`, { method: 'DELETE' });
        toast('تم إلغاء الحجز.', 'success');
        await Promise.all([loadBookings(), loadProducts()]);
    } catch (error) {
        toast(error.message, 'error');
        setBusy(button, false);
    }
}

async function deleteProduct(id, name, button) {
    if (!(await confirmDialog(`هل تريد حذف "${name}" نهائياً؟ سيتم إلغاء أي حجز مرتبط به.`, { confirmText: 'حذف', danger: true }))) return;
    setBusy(button, true, 'جارٍ الحذف…');
    try {
        await api(`/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
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
    if (window.location.hash === '#products') select(tabs[1]);
}

(async () => {
    await initPage();
    const user = await requireAuth();
    if (!user) return;
    document.getElementById('page-content').hidden = false;
    renderProfile(user);
    initTabs();
    loadBookings();
    loadProducts();
})();
