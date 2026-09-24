// pages/login.js — تسجيل الدخول

import { api } from '../api.js';
import { initPage, redirectIfLoggedIn, safeNext, resetSession, getServerInfo } from '../session.js';
import { el, icon, setBusy, showFormError, flash, initPasswordToggles } from '../ui.js';
import { navigate, currentSearch, currentHash } from '../nav.js';

export function init() {
    const form = document.getElementById('login-form');
    const submit = form.querySelector('button[type="submit"]');

    initPage();
    redirectIfLoggedIn();
    initPasswordToggles();

    const registerLink = document.getElementById('register-link');
    if (registerLink) registerLink.href = `/register.html${currentSearch()}`;

    // وضع العرض التجريبي: بيانات دخول جاهزة
    getServerInfo().then((info) => {
        if (!info.demo) return;
        const fill = el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, icon('login'), 'استخدم الحساب التجريبي');
        fill.addEventListener('click', () => {
            form.elements.namedItem('email').value = 'demo@geosave.app';
            form.elements.namedItem('password').value = 'Demo1234';
            form.requestSubmit();
        });
        form.before(el('div', { class: 'demo-hint' },
            el('p', {}, el('strong', { text: 'حساب تجريبي: ' }), el('bdi', { dir: 'ltr', text: 'demo@geosave.app / Demo1234' })),
            fill));
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        showFormError(form, '');
        if (!form.reportValidity()) return;

        const email = form.elements.namedItem('email').value.trim();
        const password = form.elements.namedItem('password').value;

        setBusy(submit, true, 'جارٍ الدخول…');
        try {
            const { user } = await api('/auth/login', { method: 'POST', body: { email, password } });
            resetSession();
            flash(`أهلاً بعودتك، ${user.name}!`);
            navigate(safeNext());
        } catch (error) {
            showFormError(form, error.message);
            setBusy(submit, false);
            form.elements.namedItem('password').select();
        }
    });
}

// في الموقع العادي تعمل الصفحة مباشرة، وفي النسخة التجريبية يستدعيها الموجّه
if (!window.__GEOSAVE_SPA__) init();
