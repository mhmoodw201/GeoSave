// shared/dates.js
// تواريخ الاستعارة بصيغة يوم فقط (YYYY-MM-DD) بتوقيت الرياض (UTC+3)، لتجنب أخطاء فروق التوقيت.

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayIso(now = Date.now()) {
    return new Date(now + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

/** يحوّل "YYYY-MM-DD" إلى Date عند منتصف الليل UTC، أو null إن كانت غير صالحة */
function parseIsoDate(value) {
    if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function toIso(date) {
    return new Date(date).toISOString().slice(0, 10);
}

function addDays(iso, days) {
    return toIso(parseIsoDate(iso).getTime() + days * DAY_MS);
}

/** عدد الأيام بين تاريخين (end - start) */
function diffDays(startIso, endIso) {
    return Math.round((parseIsoDate(endIso).getTime() - parseIsoDate(startIso).getTime()) / DAY_MS);
}

module.exports = { todayIso, parseIsoDate, toIso, addDays, diffDays };
