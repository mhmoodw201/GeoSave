# GeoSave

**GeoSave** — Location-aware rental marketplace that helps users find nearby rental items using geofencing (default radius: **5 km**).
Built as a full-stack proof-of-concept to demonstrate responsive UI, geolocation search, bookings, admin moderation, and efficient backend design for location-based services.

---

## Key features

* Search and browse rental listings filtered by proximity (geofencing).
* Responsive web UI (works on desktop and mobile browsers).
* Secure image upload with server-side compression.
* Backend APIs for listings, search, bookings and admin moderation.
* Admin panel for reviewing and approving listings.
* Direct booking/contact via WhatsApp integration.
* Performance: MongoDB indexing and query optimization for geospatial queries.
* Basic input validation, logging and error handling.

---

## Tech stack

* **Frontend:** HTML, CSS, JavaScript, Axios (vanilla / lightweight stack for the POC)
* **Backend:** Node.js, Express
* **File handling:** Multer (uploads), Sharp (image resizing/compression)
* **Database:** MongoDB (with `2dsphere` geospatial index)
* **APIs / libraries:** Geolocation API (browser), dotenv, Joi (optional validation), bcrypt (if auth added)
* **Dev tools:** nodemon (dev), PM2 or Docker for production

---

## Architecture overview

```
[Browser] <--> [Frontend (HTML/JS)] <--> [Express API] <--> [MongoDB]
                                   \
                                    -> [Image storage (local / cloud)]
                                    -> [WhatsApp link / notification]
```

Search uses MongoDB geospatial queries (e.g., `$geoNear` / `$nearSphere`) on a `location` field indexed with `2dsphere` for efficient location filtering.

---

## Getting started (local)

### Prerequisites

* Node.js (v16+) and npm
* MongoDB (local or cloud Atlas)
* Optional: yarn, Docker

### Clone & install

```bash
git clone https://github.com/<your-org>/geosave.git
cd geosave
npm install
```

### Environment variables

Create a `.env` file in the project root. Example variables:

```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/geosave
JWT_SECRET=your_jwt_secret_here
UPLOAD_DIR=./uploads
WHATSAPP_TEMPLATE=https://wa.me/{{phone}}?text={{message}}
NODE_ENV=development
```

### Run (development)

```bash
npm run dev
# or
NODE_ENV=development nodemon server.js
```

The API will be available at `http://localhost:3000/` (adjust port as needed).

---

## Important API endpoints (example)

> Note: adapt routes and auth as you implement them.

### Listings

* `GET /api/listings`
  Query params: `?lat=xx.x&lng=yy.y&radius=5000` (radius in meters)
  Returns: paginated listings within the given radius.

* `GET /api/listings/:id`
  Returns listing details.

* `POST /api/listings`
  Create new listing (owner). Body: `{ title, description, price, location: { type: "Point", coordinates: [lng, lat] }, owner }`
  Supports `multipart/form-data` for image uploads (Multer).

* `PUT /api/listings/:id`
  Update listing (owner/admin).

* `DELETE /api/listings/:id`
  Remove listing (owner/admin).

### Bookings

* `POST /api/bookings`
  Body: `{ listingId, renterName, renterPhone, startDate, endDate }`
  Triggers WhatsApp booking link generation.

* `GET /api/bookings/:id`
  Booking details (admin/owner).

### Admin

* `GET /api/admin/listings?status=pending`
  Get pending listings for approval.

* `POST /api/admin/listings/:id/approve`
  Approve listing.

* `POST /api/admin/listings/:id/reject`
  Reject listing with reason.

---

## MongoDB schema (summary)

### Listing (example)

```js
{
  _id: ObjectId,
  title: String,
  description: String,
  price: Number,
  images: [String], // file paths or cloud URLs
  ownerId: ObjectId,
  location: {
    type: "Point",
    coordinates: [lng, lat]
  },
  status: "pending" | "approved" | "rejected",
  createdAt: Date,
  updatedAt: Date
}
```

**Index note:** create a `2dsphere` index on `location`:

```js
db.listings.createIndex({ location: "2dsphere" });
```

---

## Geolocation search (implementation tips)

* Convert radius (km) → meters for Mongo queries. Default = 5000m (5 km).
* Use `$geoNear` for aggregation pipelines or `$nearSphere` with `maxDistance` for simple queries.
* Use pagination and limit returned fields to reduce payload (e.g., exclude large images in list endpoints).

Example Node/Mongo query using Mongoose:

```js
Listing.find({
  location: {
    $nearSphere: {
      $geometry: { type: "Point", coordinates: [lng, lat] },
      $maxDistance: radiusInMeters
    }
  },
  status: "approved"
})
.limit(30)
.exec()
```

---

## Image upload & optimization

* Use **Multer** to accept uploads (multipart/form-data).
* Pipe uploaded images to **Sharp** to resize (e.g., 1024px max width) and compress for performance.
* Store files locally during development (`./uploads`) and consider cloud storage (S3, Azure Blob, etc.) for production.
* When returning listing results, provide thumbnail URLs and lazy-load full images at the client.

---

## Security & best practices

* **Validation:** validate all inputs server-side (use Joi or express-validator).
* **Auth & Authorization:** protect admin endpoints and owner-only actions with JWT/session auth.
* **Rate limiting:** implement request throttling to protect public endpoints.
* **Sanitize:** avoid storing raw HTML; sanitize inputs to prevent XSS.
* **Backups:** schedule DB backups and test restore procedures.
* **CORS:** restrict origins as appropriate for production.

---

## Logging & monitoring

* Log application errors and important events (listing approvals, booking creation).
* Integrate centralized logs/monitoring (e.g., ELK / Cloudwatch / Papertrail) for production systems.
* Track performance: DB slow queries, endpoint latency, image processing duration.

---

## Tests

* Unit test critical functions (distance calculation, data validation).
* Integration tests for core API flows (create listing, search, booking).
* Manual usability testing for the front-end flows (search → view → contact/book).

---

## Deployment notes

* Containerize with Docker for consistent environments.
* Use env vars for credentials, storage and third-party keys.
* For production, use cloud object storage for images and a managed MongoDB instance (Atlas).
* Configure HTTPS and secure cookies; set proper HTTP security headers (CSP, HSTS).

---

## Roadmap / Future ideas

* Native mobile apps (Flutter) with offline support & push notifications.
* Personalized recommendation engine (AI) based on user behaviour.
* Multi-language support and accessibility improvements.
* In-app payments and secure escrow for bookings.
* Blockchain-based audit trail for listing provenance (optional).
* Publishers dashboard and monetization tools.

---

## contact

* **Author / Contact:** Mahmoud Khalid Abuzaid — [mhmoodw201@gmail.com](mailto:mhmoodw201@gmail.com)

---

Thanks for checking out **GeoSave** — a compact, practical proof-of-concept for location-centric rental services. If you’d like, I can provide a Postman collection or sample data seed to help spin up a quick demo.
