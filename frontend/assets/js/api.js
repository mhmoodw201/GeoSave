// api.js — عميل موحد للتعامل مع واجهة GeoSave البرمجية

export class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

/**
 * @param {string} path مسار نسبي يبدأ بـ "/" (مثال: "/products")
 * @param {{ method?: string, body?: unknown, form?: FormData, query?: Record<string, unknown> }} [options]
 */
export async function api(path, { method = 'GET', body, form, query } = {}) {
    const headers = { 'X-Requested-With': 'GeoSave', Accept: 'application/json' };
    let payload;
    if (form) {
        payload = form;
    } else if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }

    let url = `/api${path}`;
    if (query) {
        const params = new URLSearchParams();
        Object.entries(query).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
        });
        const qs = params.toString();
        if (qs) url += `?${qs}`;
    }

    let response;
    try {
        response = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' });
    } catch {
        throw new ApiError('تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.', 0);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new ApiError(data.error || 'حدث خطأ غير متوقع.', response.status);
    }
    return data;
}
