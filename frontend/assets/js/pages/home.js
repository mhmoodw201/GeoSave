// pages/home.js — الصفحة الرئيسية: البحث عن الأغراض القريبة وعرض التفاصيل والحجز

import { api } from '../api.js';
import { getPosition } from '../geo.js';
import { initPage, getServerInfo } from '../session.js';
import {
    el, icon, toast, flash, openDialog, confirmDialog, setBusy, emptyState, skeletonCards, showFormError,
    productImage, formatPrice, formatDistance, formatDate, priceTag, ratingBadge,
    todayIso, addDaysIso, diffDaysIso, daysLabel,
} from '../ui.js';
import { navigate } from '../nav.js';

const MAX_LEAD_DAYS = 60;

export function init() {
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
            free: data.get('free') ? 'true' : '',
        };
    }

    function setLocationStatus(kind, text, action) {
        locationStatus.className = `location-status is-${kind}`;
        locationStatus.replaceChildren(icon(kind === 'error' ? 'alert' : 'locate'), el('span', { text }), ...(action ? [action] : []));
    }

    function statusBadge(product) {
        const booked = product.status === 'booked';
        return el('span', { class: `badge ${booked ? 'badge-muted' : 'badge-success'}`, text: booked ? 'محجوز' : 'متاح' });
    }

    function productCard(product) {
        const booked = product.status === 'booked';
        const free = !Number(product.pricePerDay);
        return el('article', { class: `card product-card ${booked ? 'is-booked' : ''} ${product.isFeatured ? 'is-featured' : ''}` },
            el('button', {
                type: 'button',
                class: 'card-hit',
                'aria-label': `عرض تفاصيل ${product.name}`,
                onclick: () => showDetails(product),
            }),
            el('div', { class: 'card-media' },
                productImage(product.image, product.name),
                el('div', { class: 'card-badges' },
                    statusBadge(product),
                    product.isFeatured ? el('span', { class: 'badge badge-featured' }, icon('sparkles'), 'مميز') : null,
                    free ? el('span', { class: 'badge badge-free' }, icon('gift'), 'مجاني') : null),
                el('span', { class: 'chip chip-distance' }, icon('pin'), formatDistance(product.distance))),
            el('div', { class: 'card-body' },
                el('h3', { class: 'card-title', text: product.name }),
                el('p', { class: 'card-meta' },
                    icon('user'),
                    el('span', { class: 'card-owner', text: product.owner?.name || 'مستخدم' }),
                    product.owner?.plus ? el('span', { class: 'plus-mark', title: 'مشترك Plus', text: 'Plus' }) : null,
                    ratingBadge(product.owner?.rating, product.owner?.ratingCount, { compact: true })),
                el('div', { class: 'card-footer' },
                    priceTag(product.pricePerDay),
                    Number(product.deposit) ? el('span', { class: 'card-deposit', text: `تأمين ${formatPrice(product.deposit)}` }) : null)));
    }

    // تقييمات المالك تُحمّل عند فتح التفاصيل
    async function loadOwnerReviews(ownerId, container) {
        try {
            const { reviews } = await api(`/users/${encodeURIComponent(ownerId)}/reviews`);
            if (!reviews.length) {
                container.replaceChildren(el('p', { class: 'muted small', text: 'لا توجد تقييمات بعد لهذا المستخدم.' }));
                return;
            }
            container.replaceChildren(...reviews.slice(0, 3).map((review) => el('figure', { class: 'review' },
                el('div', { class: 'review-head' },
                    el('span', { class: 'stars', 'aria-label': `${review.rating} من 5` }, '★'.repeat(review.rating), el('span', { class: 'stars-off', text: '★'.repeat(5 - review.rating) })),
                    el('span', { class: 'muted small', text: `${review.reviewerName} · ${formatDate(review.createdAt)}` })),
                review.comment ? el('blockquote', { text: review.comment }) : null)));
        } catch {
            container.replaceChildren();
        }
    }

    function bookingForm(product) {
        const today = todayIso();
        const maxDays = product.maxDays || 7;
        const start = el('input', { type: 'date', id: 'booking-start', name: 'startDate', required: true, min: today, max: addDaysIso(today, MAX_LEAD_DAYS), value: today });
        const end = el('input', { type: 'date', id: 'booking-end', name: 'endDate', required: true, min: today, value: addDaysIso(today, Math.min(2, maxDays) - 1) });
        const summary = el('p', { class: 'booking-summary', 'aria-live': 'polite' });
        const accept = el('input', { type: 'checkbox', id: 'booking-accept', name: 'acceptTerms', required: true });
        const submit = el('button', { type: 'submit', class: 'btn btn-primary btn-block' }, icon('calendar'), Number(product.pricePerDay) ? 'احجز الآن' : 'اطلب الاستعارة');

        const syncDates = () => {
            end.min = start.value || today;
            end.max = addDaysIso(start.value || today, maxDays - 1);
            if (end.value < end.min) end.value = end.min;
            if (end.value > end.max) end.value = end.max;
            const days = diffDaysIso(start.value, end.value) + 1;
            const total = Number(product.pricePerDay) * days;
            summary.textContent = Number.isFinite(days) && days > 0
                ? `المدة: ${daysLabel(days)}${Number(product.pricePerDay) ? ` · الإجمالي المتوقع ${formatPrice(total)} يُدفع للمالك مباشرة` : ' · مجاناً'}`
                : '';
        };
        start.addEventListener('change', syncDates);
        end.addEventListener('change', syncDates);
        syncDates();

        const formEl = el('form', { class: 'form booking-form', novalidate: true },
            el('h3', { class: 'booking-title', text: 'حدد فترة الاستعارة' }),
            el('div', { class: 'field-row' },
                el('div', { class: 'field' }, el('label', { for: 'booking-start', text: 'تاريخ الاستلام' }), start),
                el('div', { class: 'field' }, el('label', { for: 'booking-end', text: 'تاريخ الإرجاع' }), end)),
            summary,
            el('label', { class: 'check' }, accept,
                el('span', {},
                    'أقر بأن GeoSave منصة تقنية وسيطة فقط، وغير مسؤولة عن أي ضياع أو تلف أو تعويض، وأن الاتفاق والتسليم والتأمين بيني وبين المالك مباشرة، وأوافق على ',
                    el('a', { href: '/terms.html', target: '_blank', rel: 'noopener', text: 'شروط الاستخدام' }), '.')),
            submit);

        formEl.addEventListener('submit', async (event) => {
            event.preventDefault();
            showFormError(formEl, '');
            if (!start.value || !end.value) {
                showFormError(formEl, 'حدد تاريخ الاستلام والإرجاع.');
                return;
            }
            if (!accept.checked) {
                showFormError(formEl, 'يجب الإقرار بالشروط قبل الحجز.');
                return;
            }
            setBusy(submit, true, 'جارٍ الحجز…');
            try {
                await api('/bookings', {
                    method: 'POST',
                    body: { productId: product._id, startDate: start.value, endDate: end.value, acceptTerms: true },
                });
                flash('تم الحجز بنجاح! تواصل مع المالك عبر واتساب من صفحة حسابك.');
                navigate('/account.html');
            } catch (error) {
                showFormError(formEl, error.message);
                setBusy(submit, false);
                if (error.status === 409) search();
            }
        });
        return formEl;
    }

    function showDetails(product) {
        const isOwner = state.user && product.owner && String(product.owner._id) === state.user.id;
        const isAdmin = state.user?.role === 'admin';
        const booked = product.status === 'booked';
        const free = !Number(product.pricePerDay);

        const actions = el('div', { class: 'detail-actions' });
        if (!state.user) {
            actions.append(el('a', { class: 'btn btn-primary btn-block', href: '/login.html?next=%2F' }, icon('login'), 'سجّل الدخول للحجز'));
        } else if (!isOwner && !booked) {
            actions.append(bookingForm(product));
        } else if (booked && !isOwner) {
            actions.append(el('p', { class: 'notice', text: 'هذا الغرض محجوز حالياً. جرّب لاحقاً.' }));
        } else if (isOwner) {
            actions.append(el('p', { class: 'notice' }, 'هذا إعلانك. يمكنك إدارته وتمييزه من ', el('a', { href: '/account.html#products', text: 'صفحة حسابي' }), '.'));
        }
        if (isOwner || isAdmin) {
            const deleteBtn = el('button', { type: 'button', class: 'btn btn-danger-ghost btn-block' }, icon('trash'), 'حذف الإعلان');
            deleteBtn.addEventListener('click', () => removeProduct(product, deleteBtn));
            actions.append(deleteBtn);
        }

        const reviewsBox = el('div', { class: 'reviews' }, el('p', { class: 'muted small', text: 'جارٍ تحميل التقييمات…' }));
        const content = el('div', { class: 'detail' },
            el('div', { class: 'detail-media' }, productImage(product.image, product.name)),
            el('div', { class: 'detail-body' },
                el('div', { class: 'card-badges static' },
                    statusBadge(product),
                    product.isFeatured ? el('span', { class: 'badge badge-featured' }, icon('sparkles'), 'مميز') : null,
                    free ? el('span', { class: 'badge badge-free' }, icon('gift'), 'إعارة مجانية') : null),
                el('h2', { class: 'detail-title', text: product.name }),
                el('div', { class: 'detail-price' }, priceTag(product.pricePerDay)),
                el('p', { class: 'detail-description', text: product.description }),
                el('ul', { class: 'detail-facts' },
                    el('li', {}, icon('pin'), el('span', { text: `يبعد عنك ${formatDistance(product.distance)}` })),
                    el('li', {}, icon('clock'), el('span', { text: `أقصى مدة: ${daysLabel(product.maxDays || 7)}` })),
                    el('li', {}, icon('shield'), el('span', { text: Number(product.deposit) ? `تأمين مسترد ${formatPrice(product.deposit)} يُتفق عليه مع المالك مباشرة` : 'بدون مبلغ تأمين' }))),
                el('section', { class: 'owner-box', 'aria-label': 'صاحب الغرض' },
                    el('div', { class: 'owner-head' },
                        el('span', { class: 'owner-avatar', 'aria-hidden': 'true', text: (product.owner?.name || '?').trim().charAt(0) }),
                        el('div', {},
                            el('strong', { text: product.owner?.name || 'مستخدم' }),
                            product.owner?.plus ? el('span', { class: 'plus-mark', text: 'Plus' }) : null,
                            el('div', {}, ratingBadge(product.owner?.rating, product.owner?.ratingCount)))),
                    reviewsBox),
                actions));
        openDialog(content, { label: product.name, className: 'dialog-lg' });
        if (product.owner?._id) loadOwnerReviews(product.owner._id, reviewsBox);
        else reviewsBox.replaceChildren();
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
                query: {
                    lat: state.position.lat, lng: state.position.lng, radius: f.radius, q: f.q, available: f.available, free: f.free, page: state.page,
                },
            });
            if (requestId !== state.requestId) return; // تم إرسال بحث أحدث

            const cards = data.items.map(productCard);
            if (append) grid.append(...cards);
            else if (cards.length) grid.replaceChildren(...cards);
            else {
                const actions = el('div', { class: 'empty-actions' },
                    el('a', { class: 'btn btn-primary', href: '/add-product.html' }, icon('plus'), 'أضف إعلاناً'));
                grid.replaceChildren(emptyState('box', 'لا توجد إعلانات قريبة',
                    `لم نجد أغراضاً ضمن ${f.radius} كم من موقعك تطابق البحث. جرّب توسيع النطاق أو أضف إعلانك الأول.`, actions));
                if (!f.q && !f.available && !f.free && (await getServerInfo()).demo) {
                    const seedBtn = el('button', { type: 'button', class: 'btn btn-secondary' }, icon('box'), 'أضف منتجات تجريبية قرب موقعي');
                    seedBtn.addEventListener('click', () => seedNearby(seedBtn));
                    actions.append(seedBtn);
                }
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

    // وضع العرض التجريبي فقط: تعبئة المنطقة بمنتجات تجريبية
    async function seedNearby(button) {
        setBusy(button, true, 'جارٍ الإضافة…');
        try {
            await api('/demo/seed', { method: 'POST', body: state.position });
            toast('أضفنا منتجات تجريبية بالقرب منك.', 'success');
            search();
        } catch (error) {
            toast(error.message, 'error');
            setBusy(button, false);
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
            grid.replaceChildren(emptyState('pin', 'نحتاج إلى موقعك', 'يعتمد GeoSave على موقعك لعرض الأغراض المتاحة بالقرب منك. لا نشارك موقعك الدقيق مع أي أحد.'));
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
}

// في الموقع العادي تعمل الصفحة مباشرة، وفي النسخة التجريبية يستدعيها الموجّه
if (!window.__GEOSAVE_SPA__) init();
