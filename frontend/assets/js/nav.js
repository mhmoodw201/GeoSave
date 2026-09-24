// nav.js — التنقل بين الصفحات
// في الموقع العادي: تنقل طبيعي بين ملفات HTML.
// في النسخة التجريبية (صفحة واحدة) يتولى الموجّه window.__GEOSAVE_SPA__ التنقل داخل الصفحة.

const spa = () => window.__GEOSAVE_SPA__;

export const isSpa = () => Boolean(spa());

export function currentPath() {
    return spa() ? spa().path : window.location.pathname;
}

export function currentSearch() {
    return spa() ? spa().search : window.location.search;
}

export function currentHash() {
    return spa() ? spa().hash : window.location.hash;
}

export function navigate(url, { replace = false } = {}) {
    if (spa()) {
        spa().go(url, { replace });
    } else if (replace) {
        window.location.replace(url);
    } else {
        window.location.href = url;
    }
}

export function iconHref(name) {
    return spa() ? `#i-${name}` : `/assets/icons.svg#${name}`;
}
