// ui.js — أدوات بناء الواجهة بأمان (لا innerHTML لبيانات المستخدم) والإشعارات والحوارات

const SVG_NS = 'http://www.w3.org/2000/svg';
const numberFormat = new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', { dateStyle: 'medium' });

/** ينشئ أيقونة من ملف الأيقونات */
export function icon(name, className = '') {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', `icon ${className}`.trim());
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `/assets/icons.svg#${name}`);
    svg.appendChild(use);
    return svg;
}

/**
 * ينشئ عنصراً بأمان. النصوص تُضاف عبر textContent دائماً.
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {...(Node|string|null|undefined|false)} children
 */
export function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else if (value === true) node.setAttribute(key, '');
        else node.setAttribute(key, String(value));
    });
    children.flat().forEach((child) => {
        if (child === undefined || child === null || child === false) return;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    });
    return node;
}

export function formatPrice(value) {
    return `${numberFormat.format(Number(value) || 0)} ر.س`;
}

export function formatDistance(meters) {
    const m = Number(meters) || 0;
    if (m < 1000) return `${Math.max(1, Math.round(m))} م`;
    return `${numberFormat.format(Math.round(m / 100) / 10)} كم`;
}

export function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
}

/** يعيد رابط صورة آمن من مسار مخزن في الخادم */
export function imageUrl(path) {
    if (typeof path !== 'string' || !/^uploads\/[\w.\- ]+$/.test(path)) return '';
    return `/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export function productImage(path, alt) {
    const src = imageUrl(path);
    if (!src) {
        return el('div', { class: 'media-fallback', 'aria-hidden': 'true' }, icon('image'));
    }
    const img = el('img', { src, alt: alt || '', loading: 'lazy', decoding: 'async' });
    img.addEventListener('error', () => img.replaceWith(el('div', { class: 'media-fallback', 'aria-hidden': 'true' }, icon('image'))), { once: true });
    return img;
}

/** رابط واتساب آمن (أرقام فقط) */
export function whatsappUrl(phone, message = '') {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!/^[1-9]\d{7,14}$/.test(digits)) return '';
    const text = message ? `?text=${encodeURIComponent(message)}` : '';
    return `https://wa.me/${digits}${text}`;
}

// ---------- الإشعارات ----------
function toastRegion() {
    let region = document.getElementById('toast-region');
    if (!region) {
        region = el('div', { id: 'toast-region', class: 'toast-region', role: 'status', 'aria-live': 'polite' });
        document.body.appendChild(region);
    }
    return region;
}

export function toast(message, type = 'info', timeout = 4500) {
    const iconName = type === 'success' ? 'check' : type === 'error' ? 'alert' : 'alert';
    const item = el('div', { class: `toast toast-${type}` }, icon(iconName), el('span', { text: message }));
    toastRegion().appendChild(item);
    requestAnimationFrame(() => item.classList.add('is-visible'));
    setTimeout(() => {
        item.classList.remove('is-visible');
        item.addEventListener('transitionend', () => item.remove(), { once: true });
        setTimeout(() => item.remove(), 500);
    }, timeout);
}

// ينقل رسالة إلى الصفحة التالية بعد إعادة التوجيه
export function flash(message, type = 'success') {
    try {
        sessionStorage.setItem('geosave:flash', JSON.stringify({ message, type }));
    } catch { /* التخزين غير متاح */ }
}

export function showFlash() {
    try {
        const raw = sessionStorage.getItem('geosave:flash');
        if (!raw) return;
        sessionStorage.removeItem('geosave:flash');
        const { message, type } = JSON.parse(raw);
        if (typeof message === 'string') toast(message, type);
    } catch { /* تجاهل */ }
}

// ---------- الحوارات ----------
export function openDialog(content, { label = '', className = '' } = {}) {
    const closeBtn = el('button', { type: 'button', class: 'icon-btn dialog-close', 'aria-label': 'إغلاق' }, icon('x'));
    const dialog = el('dialog', { class: `dialog ${className}`.trim(), 'aria-label': label || null }, closeBtn, content);
    closeBtn.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => dialog.remove());
    document.body.appendChild(dialog);
    dialog.showModal();
    return dialog;
}

export function confirmDialog(message, { confirmText = 'تأكيد', danger = false } = {}) {
    return new Promise((resolve) => {
        let result = false;
        const confirmBtn = el('button', { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, text: confirmText });
        const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء' });
        const body = el('div', { class: 'confirm' },
            el('div', { class: `confirm-icon ${danger ? 'is-danger' : ''}` }, icon('alert')),
            el('p', { class: 'confirm-text', text: message }),
            el('div', { class: 'confirm-actions' }, cancelBtn, confirmBtn));
        const dialog = openDialog(body, { label: 'تأكيد', className: 'dialog-sm' });
        confirmBtn.addEventListener('click', () => { result = true; dialog.close(); });
        cancelBtn.addEventListener('click', () => dialog.close());
        dialog.addEventListener('close', () => resolve(result));
        cancelBtn.focus();
    });
}

// ---------- الأزرار والنماذج ----------
export function setBusy(button, busy, busyText) {
    if (!button) return;
    if (busy) {
        button.dataset.label = button.textContent;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.replaceChildren(el('span', { class: 'spinner', 'aria-hidden': 'true' }), busyText || 'جارٍ التنفيذ…');
    } else {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        if (button.dataset.label !== undefined) button.textContent = button.dataset.label;
    }
}

export function showFormError(form, message) {
    let box = form.querySelector('.form-error');
    if (!box) {
        box = el('div', { class: 'form-error', role: 'alert' });
        form.prepend(box);
    }
    if (!message) {
        box.hidden = true;
        return;
    }
    box.hidden = false;
    box.replaceChildren(icon('alert'), el('span', { text: message }));
}

export function emptyState(iconName, title, text, action) {
    return el('div', { class: 'empty-state' },
        el('div', { class: 'empty-icon' }, icon(iconName)),
        el('h3', { text: title }),
        text ? el('p', { text }) : null,
        action || null);
}

export function skeletonCards(count = 6) {
    return Array.from({ length: count }, () => el('div', { class: 'card skeleton', 'aria-hidden': 'true' },
        el('div', { class: 'skeleton-media' }),
        el('div', { class: 'card-body' },
            el('div', { class: 'skeleton-line w-70' }),
            el('div', { class: 'skeleton-line w-40' }),
            el('div', { class: 'skeleton-line w-55' }))));
}

// تفعيل إظهار/إخفاء كلمة المرور
export function initPasswordToggles(root = document) {
    root.querySelectorAll('[data-toggle-password]').forEach((button) => {
        const input = document.getElementById(button.dataset.togglePassword);
        if (!input) return;
        button.addEventListener('click', () => {
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            button.setAttribute('aria-pressed', String(show));
            button.setAttribute('aria-label', show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
        });
    });
}
