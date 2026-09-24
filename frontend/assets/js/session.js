// session.js — حالة تسجيل الدخول، شريط التنقل، وحماية الصفحات

import { api, ApiError } from './api.js';
import { el, icon, toast, flash, showFlash } from './ui.js';
import { currentPath, currentSearch, navigate } from './nav.js';

let currentUserPromise;
let serverInfoPromise;

/** معلومات الخادم (مثل: هل يعمل بوضع العرض التجريبي) */
export function getServerInfo() {
    if (!serverInfoPromise) {
        serverInfoPromise = api('/health').catch(() => ({ demo: false }));
    }
    return serverInfoPromise;
}

/** يُستدعى بعد تسجيل الدخول/الخروج في النسخة أحادية الصفحة */
export function resetSession() {
    currentUserPromise = undefined;
}

export function getCurrentUser() {
    if (!currentUserPromise) {
        currentUserPromise = api('/auth/me')
            .then((data) => data.user || null)
            .catch((error) => {
                if (error instanceof ApiError && error.status === 401) return null;
                throw error;
            });
    }
    return currentUserPromise;
}

// يسمح فقط بإعادة التوجيه إلى صفحات داخلية معروفة (يمنع Open Redirect)
const SAFE_PAGES = new Set(['/', '/index.html', '/account.html', '/add-product.html', '/services.html']);
export function safeNext(fallback = '/') {
    const next = new URLSearchParams(currentSearch()).get('next');
    return next && SAFE_PAGES.has(next) ? next : fallback;
}

export async function requireAuth() {
    let user = null;
    try {
        user = await getCurrentUser();
    } catch (error) {
        toast(error.message, 'error');
        return null;
    }
    if (!user) {
        flash('يجب تسجيل الدخول للمتابعة.', 'info');
        navigate(`/login.html?next=${encodeURIComponent(currentPath())}`, { replace: true });
        return null;
    }
    return user;
}

export async function redirectIfLoggedIn() {
    try {
        if (await getCurrentUser()) navigate(safeNext(), { replace: true });
    } catch { /* الخادم غير متاح — تبقى الصفحة كما هي */ }
}

async function logout() {
    try {
        await api('/auth/logout', { method: 'POST' });
    } catch { /* نكمل الخروج من جهة العميل على أي حال */ }
    resetSession();
    flash('تم تسجيل الخروج بنجاح.');
    navigate('/');
}

function navLink(href, label, iconName, current) {
    const link = el('a', { href, class: 'nav-link' }, icon(iconName), el('span', { text: label }));
    if (current) link.setAttribute('aria-current', 'page');
    return link;
}

function renderNav(user) {
    const nav = document.getElementById('site-nav');
    if (!nav) return;
    const path = currentPath().replace(/\/$/, '/index.html');
    const is = (page) => path.endsWith(page);

    const links = [navLink('/', 'الرئيسية', 'home', is('/index.html')), navLink('/services.html', 'الخدمات', 'sparkles', is('/services.html'))];
    if (user) {
        links.push(navLink('/add-product.html', 'أضف إعلاناً', 'plus', is('/add-product.html')));
        links.push(navLink('/account.html', 'حسابي', 'user', is('/account.html')));
        links.push(el('button', { type: 'button', class: 'nav-link nav-button', onclick: logout }, icon('logout'), el('span', { text: 'خروج' })));
    } else {
        links.push(navLink('/login.html', 'تسجيل الدخول', 'login', is('/login.html')));
        const register = navLink('/register.html', 'إنشاء حساب', 'user', is('/register.html'));
        register.classList.add('nav-cta');
        links.push(register);
    }
    nav.replaceChildren(...links);
}

let navToggleReady = false;
function initNavToggle() {
    const toggle = document.querySelector('.nav-toggle');
    const nav = document.getElementById('site-nav');
    if (!toggle || !nav) return;
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    if (navToggleReady) return; // الترويسة ثابتة في النسخة أحادية الصفحة
    navToggleReady = true;
    toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(open));
        nav.classList.toggle('is-open', open);
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && nav.classList.contains('is-open')) {
            nav.classList.remove('is-open');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.focus();
        }
    });
}

/** تهيئة مشتركة لكل الصفحات */
export async function initPage() {
    document.querySelectorAll('[data-year]').forEach((node) => { node.textContent = String(new Date().getFullYear()); });
    initNavToggle();
    showFlash();
    let user = null;
    try {
        user = await getCurrentUser();
    } catch { /* نعرض القائمة كزائر إن تعذر الوصول للخادم */ }
    renderNav(user);
    return user;
}
