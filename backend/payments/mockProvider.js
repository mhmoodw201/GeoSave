// payments/mockProvider.js
// محاكاة دفع فوري — لبيئة التطوير والعرض التجريبي فقط (ممنوع في الإنتاج من config.js)

module.exports = {
    name: 'mock',
    async createCheckout(order) {
        return { providerRef: `mock_${order._id}`, paidImmediately: true };
    },
    async verify() {
        return { paid: true };
    },
};
