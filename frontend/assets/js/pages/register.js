// pages/register.js — إنشاء حساب جديد

import { api } from '../api.js';
import { initPage, redirectIfLoggedIn, safeNext, resetSession } from '../session.js';
import { setBusy, showFormError, flash, initPasswordToggles } from '../ui.js';
import { navigate, currentSearch } from '../nav.js';

export function init() {
    const form = document.getElementById('register-form');
    const submit = form.querySelector('button[type="submit"]');
    const strength = document.getElementById('password-strength');

    initPage();
    redirectIfLoggedIn();
    initPasswordToggles();

    const loginLink = document.getElementById('login-link');
    if (loginLink) loginLink.href = `/login.html${currentSearch()}`;

    function passwordScore(value) {
        let score = 0;
        if (value.length >= 8) score += 1;
        if (value.length >= 12) score += 1;
        if (/\d/.test(value) && /[A-Za-z؀-ۿ]/.test(value)) score += 1;
        if (/[^A-Za-z0-9؀-ۿ]/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value))) score += 1;
        return score;
    }

    form.elements.namedItem('password').addEventListener('input', () => {
        const value = form.elements.namedItem('password').value;
        const score = value ? passwordScore(value) : 0;
        const labels = ['', 'ضعيفة', 'متوسطة', 'جيدة', 'قوية'];
        strength.dataset.score = String(score);
        strength.querySelector('.strength-label').textContent = value ? `قوة كلمة المرور: ${labels[score]}` : '';
    });

    function validate() {
        const password = form.elements.namedItem('password').value;
        if (!/\d/.test(password) || !/[A-Za-z؀-ۿ]/.test(password)) {
            return 'كلمة المرور يجب أن تحتوي على حروف وأرقام.';
        }
        if (password !== form.elements.namedItem('confirm').value) {
            return 'كلمتا المرور غير متطابقتين.';
        }
        if (!form.elements.namedItem('acceptTerms').checked) {
            return 'يجب الموافقة على شروط الاستخدام وسياسة الخصوصية.';
        }
        return '';
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        showFormError(form, '');
        if (!form.reportValidity()) return;
        const problem = validate();
        if (problem) {
            showFormError(form, problem);
            return;
        }

        setBusy(submit, true, 'جارٍ إنشاء الحساب…');
        try {
            const { user } = await api('/auth/register', {
                method: 'POST',
                body: {
                    name: form.elements.namedItem('name').value.trim(),
                    email: form.elements.namedItem('email').value.trim(),
                    password: form.elements.namedItem('password').value,
                    acceptTerms: true,
                },
            });
            resetSession();
            flash(`مرحباً ${user.name}! تم إنشاء حسابك بنجاح.`);
            navigate(safeNext());
        } catch (error) {
            showFormError(form, error.message);
            setBusy(submit, false);
        }
    });
}

// في الموقع العادي تعمل الصفحة مباشرة، وفي النسخة التجريبية يستدعيها الموجّه
if (!window.__GEOSAVE_SPA__) init();
