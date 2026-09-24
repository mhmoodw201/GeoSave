// demo/demo-app.js
// موجّه النسخة التجريبية أحادية الصفحة: نفس صفحات GeoSave ونفس الكود، مع خادم يعمل في المتصفح.
// window.__GEOSAVE_SPA__ يُنشأ قبل تحميل الصفحات (عبر banner في build-demo.js) حتى لا تعمل تلقائياً.

import demoData from '../../shared/demo-data.js';
import { demoApi, seedNear, resetDemoData } from './demo-backend.js';
import { init as initHome } from '../assets/js/pages/home.js';
import { init as initLogin } from '../assets/js/pages/login.js';
import { init as initRegister } from '../assets/js/pages/register.js';
import { init as initAddProduct } from '../assets/js/pages/add-product.js';
import { init as initAccount } from '../assets/js/pages/account.js';
import { init as initServices } from '../assets/js/pages/services.js';
import { init as initStatic } from '../assets/js/pages/static.js';
import { init as initPaymentReturn } from '../assets/js/pages/payment-return.js';
import { resetSession } from '../assets/js/session.js';
import { openDialog } from '../assets/js/ui.js';

const { DEMO_CENTER } = demoData;
const TEMPLATES = window.__GEOSAVE_TEMPLATES__;
const PAGES = {
    '/index.html': initHome,
    '/login.html': initLogin,
    '/register.html': initRegister,
    '/add-product.html': initAddProduct,
    '/account.html': initAccount,
    '/services.html': initServices,
    '/terms.html': initStatic,
    '/privacy.html': initStatic,
    '/payment-return.html': initPaymentReturn,
};

const spa = window.__GEOSAVE_SPA__;
Object.assign(spa, {
    path: '/index.html',
    search: '',
    hash: '',
    position: { lat: DEMO_CENTER.lat, lng: DEMO_CENTER.lng },
    api: demoApi,
    go,
});

function render() {
    const template = TEMPLATES[spa.path] || TEMPLATES['/index.html'];
    document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
    document.body.className = template.bodyClass;
    const main = document.getElementById('main');
    main.outerHTML = template.main; // قوالب ثابتة من ملفات المشروع وليست بيانات مستخدم
    document.title = template.title;
    PAGES[spa.path]?.();
    const anchor = spa.hash && /^#[\w-]+$/.test(spa.hash) ? document.getElementById(spa.hash.slice(1)) : null;
    if (anchor && anchor.tagName !== 'BUTTON') anchor.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
}

// الروابط التي تفتح في تبويب جديد (مثل الشروط داخل نموذج الحجز) تُعرض في نافذة
// حتى لا يفقد الزائر ما كان يكتبه
function openInDialog(url) {
    const target = new URL(url, 'https://geosave.demo/');
    const template = TEMPLATES[target.pathname];
    if (!template) return false;
    const holder = document.createElement('div');
    holder.className = 'dialog-page';
    holder.innerHTML = template.main.replace('id="main"', ''); // قالب ثابت من ملفات المشروع
    openDialog(holder, { label: template.title, className: 'dialog-lg' });
    if (target.hash) holder.querySelector(target.hash)?.scrollIntoView({ block: 'start' });
    return true;
}

function go(url, { replace = false } = {}) {
    const target = new URL(url, 'https://geosave.demo/');
    let path = target.pathname === '/' ? '/index.html' : target.pathname;
    if (!PAGES[path]) path = '/index.html';
    Object.assign(spa, { path, search: target.search, hash: target.hash });
    // رمز بسيط في العنوان يسمح بفتح الصفحة نفسها بعد إعادة التحميل
    const token = path.slice(1, -5);
    try {
        const next = token === 'index' ? ' ' : `#${token}`;
        if (replace) history.replaceState(null, '', next); else history.pushState(null, '', next);
    } catch { /* قد لا يسمح الإطار بتغيير العنوان */ }
    render();
}

// اعتراض الروابط الداخلية
document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
    const href = link.getAttribute('href');
    if (href.startsWith('#')) {
        event.preventDefault();
        document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (href.startsWith('/')) {
        event.preventDefault();
        if (link.target === '_blank' && openInDialog(href)) return;
        go(href);
    }
});

window.addEventListener('popstate', () => {
    const token = (location.hash || '').slice(1);
    const path = PAGES[`/${token}.html`] ? `/${token}.html` : '/index.html';
    Object.assign(spa, { path, search: '', hash: '' });
    render();
});

// شريط التنبيه بأنها نسخة تجريبية
function banner() {
    const bar = document.createElement('div');
    bar.className = 'demo-banner';
    const text = document.createElement('span');
    text.textContent = `نسخة تجريبية تعمل داخل متصفحك، والموقع الافتراضي: ${DEMO_CENTER.label}. للدخول: demo@geosave.app / Demo1234`;
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'link-btn';
    reset.textContent = 'إعادة ضبط البيانات';
    reset.addEventListener('click', async () => {
        resetDemoData();
        resetSession();
        await seedNear(DEMO_CENTER);
        go('/');
    });
    bar.append(text, reset);
    document.body.prepend(bar);
}

(async () => {
    banner();
    await seedNear(DEMO_CENTER);
    const token = (location.hash || '').slice(1);
    go(PAGES[`/${token}.html`] ? `/${token}.html` : '/', { replace: true });
})();
