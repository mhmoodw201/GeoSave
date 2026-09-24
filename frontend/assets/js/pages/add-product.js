// pages/add-product.js — إضافة إعلان جديد

import { api } from '../api.js';
import { getPosition } from '../geo.js';
import { initPage, requireAuth } from '../session.js';
import { el, icon, setBusy, showFormError, flash } from '../ui.js';
import { navigate } from '../nav.js';

export function init() {
    const MAX_BYTES = 5 * 1024 * 1024;
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif'];

    const form = document.getElementById('add-product-form');
    const submit = form.querySelector('button[type="submit"]');
    const fileInput = document.getElementById('image');
    const dropzone = document.getElementById('dropzone');
    const preview = document.getElementById('image-preview');
    const locationBox = document.getElementById('location-box');
    const description = document.getElementById('description');
    const counter = document.getElementById('description-count');

    let position = null;
    let previewUrl = null;

    function renderLocation(kind, text) {
        locationBox.className = `location-status is-${kind}`;
        const retry = kind === 'error'
            ? el('button', { type: 'button', class: 'link-btn', onclick: locate, text: 'إعادة المحاولة' })
            : null;
        locationBox.replaceChildren(icon(kind === 'error' ? 'alert' : kind === 'ok' ? 'check' : 'locate'), el('span', { text }), ...(retry ? [retry] : []));
    }

    async function locate() {
        renderLocation('loading', 'جارٍ تحديد موقع الإعلان…');
        try {
            position = await getPosition();
            renderLocation('ok', 'تم تحديد الموقع. سيظهر إعلانك للمستخدمين القريبين دون كشف موقعك الدقيق.');
        } catch (error) {
            position = null;
            renderLocation('error', error.message);
        }
    }

    function setImage(file) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = null;
        preview.replaceChildren();
        dropzone.classList.remove('has-image');
        if (!file) return;

        if (!ALLOWED_TYPES.includes(file.type)) {
            showFormError(form, 'يُسمح فقط بالصور بصيغة JPG أو PNG أو WebP.');
            fileInput.value = '';
            return;
        }
        if (file.size > MAX_BYTES) {
            showFormError(form, 'حجم الصورة يجب ألا يتجاوز 5 ميجابايت.');
            fileInput.value = '';
            return;
        }
        showFormError(form, '');
        previewUrl = URL.createObjectURL(file);
        preview.append(el('img', { src: previewUrl, alt: 'معاينة الصورة' }));
        dropzone.classList.add('has-image');
    }

    fileInput.addEventListener('change', () => setImage(fileInput.files[0]));
    ['dragenter', 'dragover'].forEach((type) => dropzone.addEventListener(type, (event) => {
        event.preventDefault();
        dropzone.classList.add('is-dragging');
    }));
    ['dragleave', 'drop'].forEach((type) => dropzone.addEventListener(type, () => dropzone.classList.remove('is-dragging')));
    dropzone.addEventListener('drop', (event) => {
        event.preventDefault();
        const file = event.dataTransfer?.files?.[0];
        if (!file) return;
        const transfer = new DataTransfer();
        transfer.items.add(file);
        fileInput.files = transfer.files;
        setImage(file);
    });

    // نوع العرض: الإعارة المجانية تخفي حقل السعر
    const priceField = document.getElementById('price-field');
    const priceInput = document.getElementById('price');
    const syncOfferType = () => {
        const rent = form.elements.namedItem('offerType').value === 'rent';
        priceField.hidden = !rent;
        priceInput.required = rent;
        if (!rent) priceInput.value = '';
    };
    form.querySelectorAll('input[name="offerType"]').forEach((radio) => radio.addEventListener('change', syncOfferType));
    syncOfferType();

    description.addEventListener('input', () => {
        counter.textContent = `${description.value.length} / ${description.maxLength}`;
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        showFormError(form, '');
        if (!form.reportValidity()) return;
        if (!form.elements.namedItem('acceptTerms').checked) {
            showFormError(form, 'يجب الإقرار بالشروط قبل نشر الإعلان.');
            return;
        }
        if (!fileInput.files[0]) {
            showFormError(form, 'يرجى اختيار صورة للمنتج.');
            return;
        }
        if (!position) {
            showFormError(form, 'يجب تحديد موقع الإعلان أولاً.');
            locate();
            return;
        }

        const data = new FormData();
        data.append('name', form.elements.namedItem('name').value.trim());
        data.append('description', description.value.trim());
        const offerType = form.elements.namedItem('offerType').value;
        data.append('offerType', offerType);
        if (offerType === 'rent') data.append('pricePerDay', form.elements.namedItem('price').value);
        data.append('deposit', form.elements.namedItem('deposit').value || '0');
        data.append('maxDays', form.elements.namedItem('maxDays').value);
        data.append('acceptTerms', form.elements.namedItem('acceptTerms').checked ? 'true' : 'false');
        data.append('phoneNumber', form.elements.namedItem('phone').value.trim());
        data.append('latitude', String(position.lat));
        data.append('longitude', String(position.lng));
        data.append('image', fileInput.files[0]);

        setBusy(submit, true, 'جارٍ نشر الإعلان…');
        try {
            await api('/products', { method: 'POST', form: data });
            flash('تم نشر إعلانك بنجاح!');
            navigate('/account.html');
        } catch (error) {
            showFormError(form, error.message);
            setBusy(submit, false);
            form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    // عرض استهلاك الباقة المجانية
    async function showListingLimit(user) {
        const box = document.getElementById('listing-limit');
        if (!box || user.plan === 'plus') return;
        try {
            const { items, limit } = await api('/products/mine');
            if (!limit) return;
            box.hidden = false;
            box.replaceChildren(`استخدمت ${items.length} من ${limit} إعلانات في الباقة المجانية. `,
                el('a', { href: '/services.html', text: 'إعلانات غير محدودة مع GeoSave Plus' }));
        } catch { /* معلومة إضافية فقط */ }
    }

    (async () => {
        await initPage();
        const user = await requireAuth();
        if (user) {
            document.getElementById('page-content').hidden = false;
            locate();
            showListingLimit(user);
        }
    })();
}

// في الموقع العادي تعمل الصفحة مباشرة، وفي النسخة التجريبية يستدعيها الموجّه
if (!window.__GEOSAVE_SPA__) init();
