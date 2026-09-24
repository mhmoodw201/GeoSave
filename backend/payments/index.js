// payments/index.js
// طبقة مزودي الدفع للخدمات الرقمية فقط. المنصة لا تستلم ولا تحتفظ بأي مبالغ بين المستخدمين.

const config = require('../config');
const mock = require('./mockProvider');
const moyasar = require('./moyasarProvider');

const PROVIDERS = { mock, moyasar };

/** @returns {null | { name: string, createCheckout: Function, verify: Function }} */
function getPaymentProvider() {
    return PROVIDERS[config.payments.provider] || null;
}

module.exports = { getPaymentProvider };
