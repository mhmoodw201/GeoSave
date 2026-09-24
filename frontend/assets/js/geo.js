// geo.js — الحصول على موقع المستخدم برسائل خطأ واضحة

export function getPosition({ timeout = 15000 } = {}) {
    // النسخة التجريبية لا تستطيع الوصول إلى الموقع، فتستخدم موقعاً افتراضياً
    const demo = window.__GEOSAVE_SPA__;
    if (demo) return Promise.resolve(demo.position);

    return new Promise((resolve, reject) => {
        if (!('geolocation' in navigator)) {
            reject(new Error('متصفحك لا يدعم تحديد الموقع.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
            (error) => {
                const messages = {
                    1: 'تم رفض الوصول إلى الموقع. فعّل إذن الموقع من إعدادات المتصفح.',
                    2: 'تعذر تحديد موقعك حالياً.',
                    3: 'انتهت مهلة تحديد الموقع، حاول مرة أخرى.',
                };
                reject(new Error(messages[error.code] || 'تعذر تحديد موقعك.'));
            },
            { enableHighAccuracy: true, timeout, maximumAge: 5 * 60 * 1000 }
        );
    });
}
