# GeoSave

**GeoSave** is a location-aware lending and rental platform. Neighbours list items they lend for free or rent out for a daily price. Others find them nearby, book them for a set period, contact the owner, and rate each other afterwards. Listings are filtered by distance from the visitor (default radius **5 km**) using MongoDB geospatial queries.

GeoSave is a **technical intermediary only**. It is not a party to any agreement between users, never receives or holds money between them, and is not liable for loss, damage or compensation. See the [terms of use](frontend/terms.html).

> The web interface is in Arabic (RTL), uses the **IBM Plex Sans Arabic** typeface (self-hosted), and supports light and dark mode automatically.

---

## Features

* **Free lending or rental:** the owner chooses "إعارة مجانية" (price 0) or a daily price. There is a "free only" search filter.
* **Borrowing periods:** each booking has a pickup date and a return date, capped by the owner's maximum period. Return reminders and overdue alerts appear on the account page.
* **Optional refundable deposit:** shown on the listing, and agreed and exchanged directly between the users (the platform never holds it).
* **Legal acknowledgements:** users must accept the terms at sign-up, and again at every listing and every booking. The date and terms version are stored as evidence.
* **Mutual ratings:** after the owner confirms the return, each party can rate the other once (1–5 stars with a comment). Ratings are shown on listings.
* **Paid digital services:** featured listings and a GeoSave Plus subscription. These are the platform's only revenue (see *Business model*).
* Nearby search using a MongoDB `2dsphere` index and `$geoNear` (radius 0.1–50 km, text search, "available only" and "free only" filters, featured listings first, pagination).
* Accounts with secure sessions (JWT in an `HttpOnly`, `SameSite=Strict` cookie).
* Listings with image upload. Every image is validated, resized, stripped of metadata (including GPS/EXIF) and re-encoded to WebP.
* Atomic booking that prevents double-booking. The owner's WhatsApp number is only shown to the person who booked.
* Account page: alerts, my borrowings (contact via WhatsApp, cancel, rate), my listings (confirm return, cancel, feature, delete), and my purchases (receipts with VAT).
* Admin role: admins can delete any listing or booking.
* Responsive, accessible UI (keyboard navigation, focus states, ARIA, reduced motion), with no third-party scripts.

---

## Business model

Everything users do with each other stays free: publishing, searching, booking and rating. GeoSave charges **no commission** and never touches money exchanged between users. Revenue comes only from optional **digital services** that the platform itself provides:

| Service | Price (incl. 15% VAT) | What the user gets |
| --- | --- | --- |
| Featured listing, 7 days | 9 SAR | The listing ranks first in nearby search results with a "مميز" badge |
| Featured listing, 30 days | 29 SAR | Same, for a month |
| GeoSave Plus, monthly | 19 SAR | Unlimited listings (the free plan allows 5) and a Plus badge |

Prices live in `shared/business.js`. They are always computed on the server, and the client never supplies an amount. Services do not auto-renew. Payments go through a licensed gateway (Moyasar), and the platform does not store card data.

### Before launching in Saudi Arabia (checklist)

This code implements the product side only. The legal and administrative steps below are yours, and the terms and privacy texts should be **reviewed by a Saudi lawyer** before launch:

* Commercial registration (السجل التجاري), plus e-commerce registration and authentication on the Saudi Business Center platform.
* Fill in the placeholders in `frontend/terms.html` and `frontend/privacy.html`: the entity's name, CR number, city and address.
* A merchant account with a SAMA-licensed payment gateway (for example Moyasar). Set `PAYMENT_PROVIDER=moyasar`, `MOYASAR_SECRET_KEY` and `PUBLIC_URL`.
* VAT registration with ZATCA once revenue reaches the mandatory threshold, and e-invoicing (Fatoora) requirements at that point. Receipts in "مشترياتي" show the VAT breakdown but are not ZATCA e-invoices.
* Compliance with the Personal Data Protection Law (PDPL). The privacy policy lists what is collected and users' rights.

---

## Tech stack

* **Frontend:** HTML, CSS, JavaScript (ES modules), served by the backend from the same origin
* **Backend:** Node.js (≥ 20.9), Express 4, Mongoose 8
* **Security:** helmet (CSP, HSTS, …), express-rate-limit, bcryptjs, jsonwebtoken, cookie-parser
* **Uploads:** multer (in-memory) + sharp

```
frontend/            static site (index, login, register, add-product, account)
  assets/css/        design system
  assets/fonts/      IBM Plex Sans Arabic (woff2, SIL Open Font License)
  assets/js/         api client, UI helpers, session, per-page scripts
  demo/              in-browser demo backend and single-page router (demo build only)
shared/              business rules (prices, VAT, limits), date helpers and demo data,
                     shared by the server and the browser demo
backend/
  server.js          entry point (DB connection + HTTP server)
  db.js              MongoDB connection (MONGODB_URI or embedded database)
  app.js             Express app and middleware stack
  config.js          environment-driven configuration
  middleware/        auth, security (CSP, CORS, CSRF, rate limits), error handler
  models/            User, Product, Booking
  routes/            /api/auth, /api/products, /api/bookings
  payments/          payment providers for digital services (mock, Moyasar)
  scripts/           make-admin, migrate, build-demo
  tests/             API and security tests (node:test + supertest)
```

---

## Getting started

### Quick start (no setup)

```bash
cd backend
npm install
npm start
```

Open <http://localhost:5000> and sign in with the demo account **demo@geosave.app / Demo1234**.

With no `MONGODB_URI`, development mode starts an **embedded MongoDB** automatically (downloaded on first run by `mongodb-memory-server`). It stores its data in `backend/.data/`, so the data survives restarts. On first start it creates demo users and 9 demo listings around Riyadh. If your browser location is elsewhere, the home page offers **"أضف منتجات تجريبية قرب موقعي"**, which adds the demo listings near you. Demo features are disabled whenever `MONGODB_URI` is set.

To start over, stop the server and delete `backend/.data/`.

### Using your own MongoDB (Atlas or local)

```bash
cp .env.example .env      # then fill in MONGODB_URI and JWT_SECRET
npm start
```

The API and the website are served by the same server.

Generate a strong `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | yes (production) | MongoDB connection string. Leave empty in development to use the embedded database |
| `JWT_SECRET` | yes (production) | Random secret, at least 32 characters |
| `NODE_ENV` | no | `production` enables secure cookies, HSTS and strict config checks |
| `PORT` | no | Default `5000` |
| `SESSION_DAYS` | no | Login lifetime in days (default `7`) |
| `CORS_ORIGINS` | no | Comma-separated extra origins, only if the frontend is hosted elsewhere |
| `TRUST_PROXY` | no | Number of reverse proxies in front of the app (for correct client IPs in rate limiting) |
| `MAX_UPLOAD_MB` | no | Maximum image size (default `5`) |
| `PAYMENT_PROVIDER` | no | `mock` (simulated, development only and the default there), `moyasar`, or `none` (paid services disabled, the default in production) |
| `MOYASAR_SECRET_KEY` | with moyasar | Moyasar secret API key |
| `PUBLIC_URL` | with moyasar | Public `https://` URL of the site, used for payment return links |

### Scripts

| Command | Description |
| --- | --- |
| `npm start` / `npm run dev` | Run the server (dev mode restarts on file changes) |
| `npm run build:demo` | Build a standalone single-file demo (`dist/geosave-demo.html`) that runs entirely in the browser |
| `npm test` | Run the API and security test suite |
| `npm run make-admin -- user@example.com` | Give an existing user the admin role |
| `npm run migrate` | Upgrade data created by older versions (safe to run more than once, see below) |

### Upgrading older data

v1 stored coordinates as `latitude`/`longitude`, product status as `pending`/`confirmed` and phone numbers as numbers. Run `npm run migrate` once against your database. It converts products to GeoJSON, maps statuses to `available`/`booked`, normalizes phones and emails, and creates the required indexes.

In v1, anyone named "admin" was treated as an admin. Admins are now set explicitly with `npm run make-admin`.

From v2, the same command adds the lending fields (`deposit`, `maxDays`) to listings and gives existing bookings a status, owner and a 7-day period. It also replaces the old one-booking-per-product index with a partial index on active bookings, so returned bookings stay in the history for ratings. Stop the server first when using the embedded database.

---

## API

Every request that changes data (`POST`, `DELETE`) must send the header `X-Requested-With: GeoSave`, which protects against CSRF. Authentication uses the `geosave_token` cookie set by login/register.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | – | `{ name, email, password }` → creates an account and signs in |
| `POST` | `/api/auth/login` | – | `{ email, password }` |
| `POST` | `/api/auth/logout` | – | Clears the session cookie |
| `GET` | `/api/auth/me` | optional | `{ user }` (`null` for guests) |
| `GET` | `/api/products?lat=&lng=&radius=&q=&available=true&free=true&page=` | – | Nearby listings with `distance` (meters), featured listings first. No exact coordinates or phone numbers are returned |
| `GET` | `/api/products/mine` | ✔ | The user's listings with booking info |
| `POST` | `/api/products` | ✔ | `multipart/form-data`: `name, description, offerType (free/rent), pricePerDay, deposit, maxDays, latitude, longitude, phoneNumber, image, acceptTerms=true`. The free plan allows 5 listings |
| `DELETE` | `/api/products/:id` | owner / admin | Deletes the listing and its image. Not allowed during an active booking, except for admins |
| `POST` | `/api/bookings` | ✔ | `{ productId, startDate, endDate, acceptTerms: true }` (dates as `YYYY-MM-DD`, Riyadh time) |
| `GET` | `/api/bookings/overview` | ✔ | Bookings as borrower and as owner, with review status. The owner's phone is shown only to the borrower of an active booking |
| `POST` | `/api/bookings/:id/return` | owner / admin | Confirms the item came back (the booking becomes `returned`) |
| `DELETE` | `/api/bookings/:id` | booker / owner / admin | Cancels an active booking |
| `POST` | `/api/bookings/:id/review` | booker / owner | `{ rating: 1-5, comment? }`, after the return, once per party |
| `GET` | `/api/users/:id/reviews` | – | Public rating summary and latest reviews (first names only) |
| `GET` | `/api/services` | – | Digital services catalog with VAT breakdown |
| `POST` | `/api/services/checkout` | ✔ | `{ service, productId? }` starts a payment. The price is set by the server |
| `POST` | `/api/services/orders/:id/verify` | order owner | Verifies the payment with the gateway and activates the service once |
| `GET` | `/api/services/orders` | ✔ | Purchase history (receipts) |
| `GET` | `/api/health` | – | Health check |

---

## Security

See [SECURITY.md](SECURITY.md) for the security model and audit notes.

---

## Contact

* **Author:** Mahmoud Khalid Abuzaid — [mhmoodw201@gmail.com](mailto:mhmoodw201@gmail.com)
