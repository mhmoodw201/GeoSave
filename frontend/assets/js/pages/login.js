// pages/login.js — تسجيل الدخول

import { api } from '../api.js';
import { initPage, redirectIfLoggedIn, safeNext } from '../session.js';
import { setBusy, showFormError, flash, initPasswordToggles } from '../ui.js';

const form = document.getElementById('login-form');
const submit = form.querySelector('button[type="submit"]');

initPage();
redirectIfLoggedIn();
initPasswordToggles();

const registerLink = document.getElementById('register-link');
if (registerLink) registerLink.href = `/register.html${window.location.search}`;

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFormError(form, '');
    if (!form.reportValidity()) return;

    const email = form.elements.namedItem('email').value.trim();
    const password = form.elements.namedItem('password').value;

    setBusy(submit, true, 'جارٍ الدخول…');
    try {
        const { user } = await api('/auth/login', { method: 'POST', body: { email, password } });
        flash(`أهلاً بعودتك، ${user.name}!`);
        window.location.href = safeNext();
    } catch (error) {
        showFormError(form, error.message);
        setBusy(submit, false);
        form.elements.namedItem('password').select();
    }
});
