// pages/static.js — الصفحات الثابتة (الشروط والخصوصية): تهيئة الترويسة فقط

import { initPage } from '../session.js';

export function init() {
    initPage();
}

// في الموقع العادي تعمل الصفحة مباشرة، وفي النسخة التجريبية يستدعيها الموجّه
if (!window.__GEOSAVE_SPA__) init();
