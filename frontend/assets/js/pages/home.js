// pages/home.js — الصفحة الرئيسية: البحث عن المنتجات القريبة وعرض التفاصيل والحجز

import { api } from '../api.js';
import { getPosition } from '../geo.js';
import { initPage } from '../session.js';
import {
    el, icon, toast, flash, openDialog, confirmDialog, setBusy, emptyState, skeletonCards,
    productImage, formatPrice, formatDistance,
} from '../ui.js';

const state = {
    user: null,
    position: null,
    page: 1,
    hasMore: false,
    loading: false,
    requestId: 0,
};

const grid = document.getElementById('product-grid');
const form = document.getElementById('search-form');
const loadMoreBtn = document.getElementById('load-more');
const resultsMeta = document.getElementById('results-meta');
const locationStatus = document.getElementById('location-status');

function filters() {
    const data = new FormData(form);
    return {
        q: String(data.get('q') || '').trim(),
        radius: String(data.get('radius') || '5'),
        available: data.get('available') ? 'true' : '',
    };
}

function setLocationStatus(kind, text, action) {
    locationStatus.className = `location-status is-${kind}`;
    locationStatus.replaceChildren(icon(kind === 'error' ? 'alert' : 'locate'), el('span', { text }), ...(action ? [action] : []));
}

function productCard(product) {
    const booked = product.status === 'booked';
    const card = el('article', { class: `card product-card ${booked ? 'is-booked' : ''}` },
        el('button', {
            type: 'button',
            class: 'card-hit',
            'aria-label': `عرض تفاصيل ${product.name}`,
            onclick: () => showDetails(product),
        }),
        el('div', { class: 'card-media' },
            productImage(product.image, product.name),
            el('span', { class: `badge ${booked ? 'badge-muted' : 'badge-success'}`, text: booked ? 'محجوز' : 'متاح' }),
            el('span', { class: 'chip chip-distance' }, icon('pin'), formatDistance(product.distance))),
        el('div', { class: 'card-body' },
            el('h3', { class: 'card-title', text: product.name }),
            el('p', { class: 'card-meta' }, icon('user'), el('span', { text: product.owner?.name || 'مستخدم' })),
            el('div', { class: 'card-footer' },
                el('span', { class: 'price' }, el('strong', { text: formatPrice(product.pricePerDay) }), el('small', { text: ' / يوم' })))));
    return card;
}

function showDetails(product) {
    const isOwner = state.user && product.owner && String(product.owner._id) === state.user.id;
    const isAdmin = state.user?.role === 'admin';
    const booked = product.status === 'booked';

    const actions = el('div', { class: 'detail-actions' });
    if (!state.user) {
        actions.append(el('a', { class: 'btn btn-primary btn-block', href: '/login.html?next=%2F' }, icon('login'), 'سجّل الدخول للحجز'));
    } else if (!isOwner && !booked) {
        const bookBtn = el('button', { type: 'button', class: 'btn btn-primary btn-block' }, icon('calendar'), 'احجز الآن');
        bookBtn.addEventListener('click', () => book(product, bookBtn));
        actions.append(bookBtn);
    } else if (booked && !isOwner) {
        actions.append(el('p', { class: 'notice', text: 'هذا المنتج محجوز حالياً.' }));
    } else if (isOwner) {
        actions.append(el('p', { class: 'notice', text: 'هذا إعلانك. يمكنك إدارته من صفحة حسابي.' }));
    }
    if (isOwner || isAdmin) {
        const deleteBtn = el('button', { type: 'button', class: 'btn btn-danger-ghost btn-block' }, icon('trash'), 'حذف الإعلان');
        deleteBtn.addEventListener('click', () => removeProduct(product, deleteBtn));
        actions.append(deleteBtn);
    }

    const content = el('div', { class: 'detail' },
        el('div', { class: 'detail-media' }, productImage(product.image, product.name)),
        el('div', { class: 'detail-body' },
            el('span', { class: `badge ${booked ? 'badge-muted' : 'badge-success'}`, text: booked ? 'محجوز' : 'متاح' }),
            el('h2', { class: 'detail-title', text: product.name }),
            el('p', { class: 'detail-price' }, el('strong', { text: formatPrice(product.pricePerDay) }), ' / يوم'),
            el('p', { class: 'detail-description', text: product.description }),
            el('ul', { class: 'detail-facts' },
                el('li', {}, icon('user'), el('span', { text: product.owner?.name || 'مستخدم' })),
                el('li', {}, icon('pin'), el('span', { text: `يبعد عنك ${formatDistance(product.distance)}` }))),
            actions));
    openDialog(content, { label: product.name, className: 'dialog-lg' });
}

async function book(product, button) {
    setBusy(button, true, 'جارٍ الحجز…');
    try {
        await api('/bookings', { method: 'POST', body: { productId: product._id } });
        flash('تم الحجز بنجاح! تواصل مع المالك من صفحة حسابك.');
        window.location.href = '/account.html';
    } catch (error) {
        toast(error.message, 'error');
        setBusy(button, false);
        if (error.status === 409) search();
    }
}

async function removeProduct(product, button) {
    const ok = await confirmDialog(`هل تريد حذف "${product.name}" نهائياً؟`, { confirmText: 'حذف', danger: true });
    if (!ok) return;
    setBusy(button, true, 'جارٍ الحذف…');
    try {
        await api(`/products/${encodeURIComponent(product._id)}`, { method: 'DELETE' });
        toast('تم حذف الإعلان.', 'success');
        button.closest('dialog')?.close();
        search();
    } catch (error) {
        toast(error.message, 'error');
        setBusy(button, false);
    }
}

async function load({ append = false } = {}) {
    if (!state.position) return;
    const requestId = ++state.requestId;
    state.loading = true;
    loadMoreBtn.hidden = true;
    if (!append) {
        grid.setAttribute('aria-busy', 'true');
        grid.replaceChildren(...skeletonCards());
    } else {
        setBusy(loadMoreBtn, true, 'جارٍ التحميل…');
        loadMoreBtn.hidden = false;
    }

    const f = filters();
    try {
        const data = await api('/products', {
            query: { lat: state.position.lat, lng: state.position.lng, radius: f.radius, q: f.q, available: f.available, page: state.page },
        });
        if (requestId !== state.requestId) return; // تم إرسال بحث أحدث

        const cards = data.items.map(productCard);
        if (append) grid.append(...cards);
        else if (cards.length) grid.replaceChildren(...cards);
        else {
            grid.replaceChildren(emptyState('box', 'لا توجد إعلانات قريبة',
                `لم نجد منتجات ضمن ${f.radius} كم من موقعك. جرّب توسيع نطاق البحث أو أضف إعلانك الأول.`,
                el('a', { class: 'btn btn-primary', href: '/add-product.html' }, icon('plus'), 'أضف إعلاناً')));
        }
        state.hasMore = data.hasMore;
        const count = grid.querySelectorAll('.product-card').length;
        resultsMeta.textContent = count ? `${count} نتيجة ضمن ${f.radius} كم` : '';
    } catch (error) {
        if (requestId !== state.requestId) return;
        if (!append) {
            grid.replaceChildren(emptyState('alert', 'تعذر تحميل الإعلانات', error.message,
                el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => search() }, icon('refresh'), 'إعادة المحاولة')));
        } else {
            toast(error.message, 'error');
        }
    } finally {
        if (requestId === state.requestId) {
            state.loading = false;
            grid.removeAttribute('aria-busy');
            setBusy(loadMoreBtn, false);
            loadMoreBtn.hidden = !state.hasMore;
        }
    }
}

function search() {
    state.page = 1;
    return load();
}

async function locate() {
    setLocationStatus('loading', 'جارٍ تحديد موقعك…');
    grid.replaceChildren(...skeletonCards());
    try {
        state.position = await getPosition();
        setLocationStatus('ok', 'نعرض الإعلانات القريبة من موقعك الحالي',
            el('button', { type: 'button', class: 'link-btn', onclick: locate, text: 'تحديث' }));
        await search();
    } catch (error) {
        setLocationStatus('error', error.message,
            el('button', { type: 'button', class: 'link-btn', onclick: locate, text: 'إعادة المحاولة' }));
        grid.replaceChildren(emptyState('pin', 'نحتاج إلى موقعك', 'يعتمد GeoSave على موقعك لعرض المنتجات المتاحة بالقرب منك. لا نشارك موقعك الدقيق مع أي أحد.'));
    }
}

let debounceTimer;
form.addEventListener('submit', (event) => {
    event.preventDefault();
    search();
});
form.addEventListener('input', (event) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(search, event.target.name === 'q' ? 400 : 0);
});
loadMoreBtn.addEventListener('click', () => {
    if (state.loading || !state.hasMore) return;
    state.page += 1;
    load({ append: true });
});

(async () => {
    state.user = await initPage();
    const heroCta = document.getElementById('hero-cta');
    if (heroCta && !state.user) heroCta.href = '/register.html';
    locate();
})();
