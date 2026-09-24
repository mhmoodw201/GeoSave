# GeoSave

**GeoSave** is a location-aware rental marketplace: people list items they rent out, and others find, book and contact owners nearby. Listings are filtered by distance from the visitor (default radius **5 km**) using MongoDB geospatial queries.

> The web interface is in Arabic (RTL), uses the **IBM Plex Sans Arabic** typeface (self-hosted), and supports light and dark mode automatically.

---

## Features

* Nearby search using a MongoDB `2dsphere` index and `$geoNear` (radius 0.1–50 km, text search, "available only" filter, pagination).
* Accounts with secure sessions (JWT in an `HttpOnly`, `SameSite=Strict` cookie).
* Listings with image upload. Every image is validated, resized, stripped of metadata (including GPS/EXIF) and re-encoded to WebP.
* Atomic booking that prevents double-booking. The owner's WhatsApp number is only shown to the person who booked.
* Account page: my bookings (contact via WhatsApp, cancel) and my listings (end a booking, delete).
* Admin role: admins can delete any listing or booking.
* Responsive, accessible UI (keyboard navigation, focus states, ARIA, reduced motion), with no third-party scripts.

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
shared/              demo data shared by the server and the browser demo
backend/
  server.js          entry point (DB connection + HTTP server)
  db.js              MongoDB connection (MONGODB_URI or embedded database)
  app.js             Express app and middleware stack
  config.js          environment-driven configuration
  middleware/        auth, security (CSP, CORS, CSRF, rate limits), error handler
  models/            User, Product, Booking
  routes/            /api/auth, /api/products, /api/bookings
  scripts/           make-admin, migrate-v2, build-demo
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

### Scripts

| Command | Description |
| --- | --- |
| `npm start` / `npm run dev` | Run the server (dev mode restarts on file changes) |
| `npm run build:demo` | Build a standalone single-file demo (`dist/geosave-demo.html`) that runs entirely in the browser |
| `npm test` | Run the API and security test suite |
| `npm run make-admin -- user@example.com` | Give an existing user the admin role |
| `npm run migrate` | One-time migration of data created by v1 (see below) |

### Upgrading from v1

v1 stored coordinates as `latitude`/`longitude`, product status as `pending`/`confirmed` and phone numbers as numbers. Run `npm run migrate` once against your database. It converts products to GeoJSON, maps statuses to `available`/`booked`, normalizes phones and emails, and creates the required indexes.

In v1, anyone named "admin" was treated as an admin. Admins are now set explicitly with `npm run make-admin`.

---

## API

Every request that changes data (`POST`, `DELETE`) must send the header `X-Requested-With: GeoSave`, which protects against CSRF. Authentication uses the `geosave_token` cookie set by login/register.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | – | `{ name, email, password }` → creates an account and signs in |
| `POST` | `/api/auth/login` | – | `{ email, password }` |
| `POST` | `/api/auth/logout` | – | Clears the session cookie |
| `GET` | `/api/auth/me` | optional | `{ user }` (`null` for guests) |
| `GET` | `/api/products?lat=&lng=&radius=&q=&available=true&page=` | – | Nearby listings with `distance` (meters). No exact coordinates or phone numbers are returned |
| `GET` | `/api/products/mine` | ✔ | The user's listings with booking info |
| `POST` | `/api/products` | ✔ | `multipart/form-data`: `name, description, pricePerDay, latitude, longitude, phoneNumber, image` |
| `DELETE` | `/api/products/:id` | owner / admin | Deletes the listing, its bookings and its image |
| `POST` | `/api/bookings` | ✔ | `{ productId }` |
| `GET` | `/api/bookings/mine` | ✔ | The user's bookings, including the owner's phone |
| `DELETE` | `/api/bookings/:id` | booker / owner / admin | Cancels a booking |
| `GET` | `/api/health` | – | Health check |

---

## Security

See [SECURITY.md](SECURITY.md) for the security model and audit notes.

---

## Contact

* **Author:** Mahmoud Khalid Abuzaid — [mhmoodw201@gmail.com](mailto:mhmoodw201@gmail.com)
