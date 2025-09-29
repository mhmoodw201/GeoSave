// // middleware/authMiddleware.js

// function authenticate(req, res, next) {
//     if (req.session && req.session.userId) {
//         next(); // المستخدم مصادق عليه
//     } else {
//         res.status(401).json({ error: 'Unauthorized access. Please log in.' });
//     }
// }

// module.exports = authenticate;
