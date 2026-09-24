# Security

## ⚠️ Action required: rotate leaked credentials

Earlier versions of this repository had a **MongoDB Atlas username and password** hardcoded in `backend/server.js`, together with the JWT secret (`mhmoodw`) and session secret. They have been removed from the code, but **they remain in the git history and must be considered compromised**:

1. In MongoDB Atlas, change the password of the database user (or delete the user and create a new one), and review *Network Access* so it does not allow `0.0.0.0/0`.
2. Put the new connection string in `backend/.env` (never commit it).
3. Optionally purge the old secret from history (e.g. `git filter-repo`) and force-push. Rotating the password is still required, because clones and forks keep the old history.

## Audit summary (v1 → v2)

| # | Issue in v1 | Severity | Fix in v2 |
| - | --- | --- | --- |
| 1 | Database credentials, JWT secret and session secret hardcoded in source | Critical | All secrets come from environment variables. Production refuses to start without a strong `JWT_SECRET` |
| 2 | No authentication on any API route. `userId`/`owner` were taken from the request, so anyone could read, create, book or delete on behalf of any user (IDOR) | Critical | JWT cookie auth middleware. The user identity always comes from the verified token. Ownership checks on delete/cancel |
| 3 | `/info?userId=` returned the full user document, including the password hash | High | `/api/auth/me` returns only safe fields. `password` is `select: false` and removed from JSON |
| 4 | Stored XSS: product names, descriptions and names were injected with `innerHTML` | High | The UI builds DOM nodes with `textContent` only. A strict CSP (`script-src 'self'`, no inline scripts) is added as a second layer |
| 5 | Unrestricted file upload: any file type and size was stored under the client-supplied filename (path traversal, HTML/SVG upload) | High | Images only, size limit, validated and re-encoded by sharp to WebP with a random UUID name. Metadata/EXIF GPS is stripped. Uploads are served with a sandbox CSP |
| 6 | NoSQL injection in login (`{"email": {"$ne": null}}`) | High | Strict type validation. Requests with `$`/dotted keys are rejected. The query string parser is set to `simple` |
| 7 | Anyone registering with the name "admin" became an admin | High | Explicit `role` field that cannot be mass-assigned, set only via `npm run make-admin` |
| 8 | Login responses revealed whether an email exists. Wrong-password responses returned HTTP 200 | Medium | Generic 401 message and a constant-time dummy hash comparison |
| 9 | No brute-force protection | Medium | Rate limits: 10 failed auth attempts per 15 min, 30 writes per hour, 300 API requests per 15 min per IP |
| 10 | Token stored in `localStorage` (readable by any XSS) | Medium | `HttpOnly`, `SameSite=Strict` cookie (`Secure` in production). JWT is pinned to HS256 with expiry |
| 11 | CORS open to all origins | Medium | Same-origin by default. Extra origins only via `CORS_ORIGINS`. Custom-header CSRF check on all writes |
| 12 | Double booking race condition. Booking any product, including your own | Medium | Atomic `findOneAndUpdate` on `status: 'available'` plus a unique index on `Booking.productId`. Owners cannot book their own listings |
| 13 | Owner phone numbers and exact home coordinates exposed publicly | Medium (privacy) | Public search returns only distance. The phone is only shown to the user who booked |
| 14 | Error messages leaked internal details (`error.message`) | Low | Central error handler with safe messages. Details are logged server-side only |
| 15 | Missing security headers; `X-Powered-By` exposed | Low | helmet: CSP, `frame-ancestors 'none'`, `nosniff`, Referrer-Policy, Permissions-Policy, HSTS (production) |
| 16 | `node_modules` committed; outdated `multer 1.x` with known CVEs | Low | `node_modules` untracked. Dependencies upgraded (`npm audit`: 0 vulnerabilities) |

## Known limitations

* Logging out clears the cookie, but a stolen JWT stays valid until it expires (`SESSION_DAYS`). Keep the lifetime short, or add a token denylist/versioning if needed.
* Uploaded images are stored on local disk. For multi-instance deployments, use object storage (S3, etc.).
* Always run behind HTTPS in production (`NODE_ENV=production`) and set `TRUST_PROXY` correctly when behind a reverse proxy.

## Reporting a vulnerability

Please email mhmoodw201@gmail.com instead of opening a public issue.
