# KJT Foodie — Backend Architecture

Oct 28, 2026 · @Lorem Backend

## 1. Stack and principles

The KJT Foodie backend is a modular Express REST API on MySQL (via Sequelize), with Redis-backed BullMQ workers for anything slow or scheduled and Socket.IO for live tracking. It implements the API contract the frontend was built against.

| Concern | Choice |
| --- | --- |
| Runtime | Node.js 20 LTS |
| Web framework | Express 4 |
| Database | MySQL 8 (InnoDB, utf8mb4) |
| ORM / migrations | Sequelize 6 + `sequelize-cli` migrations and seeders |
| Cache, queues, rate limits | Redis 7 |
| Background jobs | BullMQ (queues, workers, repeatable jobs, flows) |
| Real time | Socket.IO 4 with the Redis adapter |
| Validation | Zod (shared style with the frontend) |
| Auth | JWT access token (15 min) + rotating refresh token (30 days, httpOnly cookie, stored hashed); OTP by SMS |
| Payments | Paystack (split payments to vendor subaccounts, recurring subscription plans, webhooks) |
| File storage | Cloudinary (or S3-compatible) for food photos and documents, signed uploads |
| Notifications | Termii (SMS), Resend/SES (email), FCM web push |
| Maps | Google Maps Platform: Geocoding, Distance Matrix |
| Logging | Pino + `pino-http`, request IDs |
| API docs | OpenAPI 3 (`swagger-jsdoc` + Swagger UI at `/docs`) |
| Tests | Jest + Supertest; Testcontainers for MySQL/Redis |
| Process / deploy | Docker; API and workers as separate processes; PM2 or a container platform |

### Principles

1. **Modular monolith:** one codebase and one database, split into modules (auth, vendors, orders...) with clear boundaries, so it can be split into services later if needed.
2. **Thin controllers, fat services:** controllers parse the request and shape the response; all business rules live in services.
3. **Do slow work in the background:** HTTP requests never wait for SMS, email, image processing, reports or Paystack retries. They add a BullMQ job.
4. **Money is integer kobo** everywhere; never floats.
5. **Every money event and admin action is audited** (BRD NFR-07).
6. **Webhooks are the source of truth for payments;** client callbacks are only hints.
7. **Same contract as the mock API:** response envelope, pagination and filter parameters exactly as in section 5.

## 2. System architecture

The browser talks only to the Express API; the API answers fast and hands slow work to BullMQ workers through Redis. Both read and write MySQL through the same Sequelize models and services.

&#91;embedded content: system architecture · API, workers, data stores, external services\]

Workers also read and write MySQL (not drawn, to keep the picture clear). Paystack calls back into the API through webhooks; workers do the follow-up.

## 3. Folder structure and layering

Each module owns its routes, controller, service, validation and jobs; shared plumbing lives in `src/core`.

```text
kjt-foodie-api/
├─ src/
│  ├─ app.js                      # Express app: middleware + routes, no listen()
│  ├─ server.js                   # HTTP + Socket.IO server start
│  ├─ worker.js                   # starts all BullMQ workers (separate process)
│  ├─ scheduler.js                # registers repeatable (cron) jobs
│  ├─ config/                     # env loading + validation (Zod), db, redis, paystack
│  ├─ core/
│  │  ├─ middlewares/              # authenticate, authorize, validate, rateLimit, errorHandler, requestId
│  │  ├─ errors/                   # AppError, NotFoundError, ForbiddenError...
│  │  ├─ query/                    # buildListQuery: pagination, filters, sort, search
│  │  ├─ http/                     # asyncHandler, respond.ok/created/paginated
│  │  ├─ queue/                    # queue factory, worker factory, job names
│  │  ├─ socket/                   # io setup, auth, rooms
│  │  ├─ audit/                    # audit.log(actor, action, entity, before, after)
│  │  └─ utils/                    # money, geo (haversine), codes, dates
│  ├─ db/
│  │  ├─ models/                   # Sequelize models + associations (index.js)
│  │  ├─ migrations/
│  │  └─ seeders/                  # roles, permissions, plans, settings, demo data
│  ├─ integrations/               # paystack, termii, email, cloudinary, google-maps, fcm
│  └─ modules/
│     ├─ auth/  users/  vendors/  subscriptions/  catalogue/  social/
│     ├─ orders/  payments/  refunds/  riders/  deliveries/  tracking/
│     └─ reviews/  support/  notifications/  reports/  settings/  admin/
├─ tests/                         # unit/ integration/ (mirrors modules)
├─ docs/openapi/                  # OpenAPI YAML per module
├─ docker-compose.yml             # mysql, redis, api, worker
├─ .sequelizerc
└─ .env.example
```

Inside a module:

```text
modules/orders/
├─ orders.routes.js       # paths + middleware chain
├─ orders.controller.js   # req → service → respond
├─ orders.service.js      # business rules, transactions, emits events, adds jobs
├─ orders.repository.js   # Sequelize queries (optional; use for complex queries)
├─ orders.schemas.js      # Zod schemas for body, params, query
├─ orders.filters.js      # allowed filters/sorts for list endpoints
├─ orders.events.js       # socket + domain events
├─ orders.jobs.js         # job producers and processors for this module
└─ orders.policy.js       # ownership checks: can this user see/act on this order?
```

### Layer rules

| Layer | May do | Must not do |
| --- | --- | --- |
| Routes | Declare path, middleware chain, controller | Contain logic |
| Controller | Read validated input, call one service method, send response | Touch models, call Paystack |
| Service | Business rules, DB transactions, call other services, add jobs, emit events | Read `req`/`res` |
| Repository / models | Queries, scopes, associations | Business rules |
| Jobs (processors) | Call services | Be called from HTTP directly |

Modules talk to each other through services (`ordersService` calls `paymentsService`), never by reaching into another module's models directly for writes.

## 4. Middleware pipeline, authentication and role-based access

Every request passes the same global chain, then each route adds `authenticate`, `authorize` and `validate` as needed; errors from anywhere end in one error handler.

### Global chain (in `app.js`, in this order)

1. `requestId` — adds `X-Request-Id` for logs and support.
2. `helmet`, `cors` (allow-list of frontend origins, credentials on), `compression`.
3. `express.json({ limit: '1mb' })` — except `/webhooks/paystack`, which gets the **raw** body for signature checks.
4. `cookieParser` (refresh token cookie).
5. `pino-http` request logging (tokens and passwords redacted).
6. `rateLimit` (Redis store): general 300 req/min per IP; auth and OTP routes 5 req/min.
7. Module routers under `/api/v1`.
8. `notFound` → `errorHandler`.

### Per-route chain

```js
// modules/refunds/refunds.routes.js
router.patch(
  '/:id/respond',
  authenticate,                               // who are you?
  authorize({ roles: ['vendor'] }),           // what kind of user?
  validate({ params: idParam, body: respondSchema }),
  loadResource(Refund, 'refund'),             // 404 if missing
  checkPolicy(refundPolicy.canRespond),       // is it YOUR vendor's refund?
  asyncHandler(refundsController.respond),
);

router.post(
  '/:id/escalate',
  authenticate,
  authorize({ permissions: ['refunds.escalate'] }), // admin sub-roles
  asyncHandler(refundsController.escalate),
);
```

### Authentication

- **Login:** phone + OTP, or email + password (bcrypt, cost 12). Returns an access token (JWT, 15 min) in the body and sets a refresh token in an httpOnly, Secure, SameSite=Strict cookie.
- **Refresh:** `/auth/refresh` rotates the refresh token; reuse of an old token revokes the whole token family (stolen-token protection).
- **JWT payload:** `{ sub: userId, role, vendorId?, riderId?, permVersion }`. Permissions are loaded from Redis cache by role, so changing a role takes effect without new tokens (`permVersion` bump).
- **Logout:** revokes the refresh token; "log out everywhere" revokes all of a user's tokens.
- Suspended or banned users are rejected in `authenticate` (status checked from cache).

### Authorisation: roles, permissions and ownership

Three checks, from coarse to fine:

| Check | Middleware | Example |
| --- | --- | --- |
| Role | `authorize({ roles })` | Only `rider` can call `/rider/jobs/:id/accept` |
| Permission (admin sub-roles) | `authorize({ permissions })` | `subscriptions.manage` for editing plans |
| Ownership | `checkPolicy(fn)` | A vendor can only see their own orders; a customer only their own |

Roles: `customer`, `vendor`, `vendor_staff`, `rider`, `admin`. Admin sub-roles are rows in `roles` with permissions such as:

| Admin sub-role | Permissions (examples) |
| --- | --- |
| Super admin | `*` |
| Support | `orders.view`, `customers.view`, `support.manage`, `refunds.view`, `moderation.manage` |
| Finance | `payments.view`, `subscriptions.manage`, `rider_payouts.manage`, `refunds.view`, `reports.view` |
| Dispatch | `riders.view`, `deliveries.assign`, `tracking.view`, `orders.view` |
| Onboarding | `vendors.approve`, `riders.approve` |

### Validation and errors

- `validate({ body, query, params })` parses with Zod and replaces `req.body` etc. with the clean, typed result; unknown fields are stripped.
- Services throw `AppError` subclasses; `errorHandler` turns them into the standard error envelope (section 5). Unknown errors return 500 with the request ID and are logged with the stack trace; the client never sees internals.
- Sequelize unique-constraint errors become `409 CONFLICT` with a field name.

## 5. API conventions: responses, pagination, filters

This section is the contract shared with the frontend's mock API; any change here is a change to both.

### URLs

- Base: `/api/v1`. Plural nouns, kebab-case: `/food-items`, `/orders/:id`, `/vendors/:id/followers`.
- Actions that are not plain CRUD are sub-resources with POST: `/orders/:id/accept`, `/orders/:id/ready`, `/deliveries/:id/confirm`.
- Role-scoped shortcuts: `/me/orders`, `/vendor/orders`, `/rider/jobs`, `/admin/orders`. They share one service and differ only in the scope applied.

### Response envelope

```json
// single item
{ "success": true, "data": { "id": "...", "status": "accepted" } }

// list (offset pagination)
{
  "success": true,
  "data": [ ... ],
  "meta": { "page": 2, "limit": 20, "total": 135, "totalPages": 7, "hasNext": true, "hasPrev": true }
}

// feed (cursor pagination)
{ "success": true, "data": [ ... ], "meta": { "nextCursor": "eyJpZCI6...", "limit": 20 } }

// error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields are invalid",
    "fieldErrors": { "price": "Price must be more than ₦0" },
    "requestId": "b1f6..."
  }
}
```

Error codes: `VALIDATION_ERROR` 422, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `RATE_LIMITED` 429, `SUBSCRIPTION_INACTIVE` 402, `PAYMENT_FAILED` 402, `INTERNAL` 500.

### List query parameters

| Parameter | Example | Meaning |
| --- | --- | --- |
| `page`, `limit` | `page=2&limit=20` | Offset pagination; `limit` max 100, default 20 |
| `cursor` | `cursor=eyJpZCI6...` | Cursor pagination for feeds/comments |
| `sort` | `sort=-createdAt,total` | Comma list; `-` = descending; only allowed fields |
| `search` | `search=jollof` | Full-text / LIKE over the module's search fields |
| exact filter | `status=pending,accepted` | Comma = IN list |
| range filter | `totalMin=500000&totalMax=2000000` | Kobo, inclusive |
| date range | `from=2026-10-01&to=2026-10-31` | On `createdAt` unless the module says otherwise; Africa/Lagos time |
| boolean | `isAvailable=true` |  |
| relation | `vendorId=...&categoryId=...` | Foreign-key filters |
| geo | `lat=6.52&lng=3.37&radiusKm=5` | Vendors/food near a point |
| `include` | `include=vendor,items` | Optional, whitelisted associations |

### Reusable filter builder (`core/query/buildListQuery.js`)

Each module declares what is allowed; one shared function turns `req.query` into Sequelize `where`, `order`, `limit`, `offset`. Unknown or disallowed parameters are ignored, so clients cannot sort or filter on private columns.

```js
// modules/orders/orders.filters.js
export const orderListConfig = {
  searchable: ['code', '$customer.fullName$'],
  filters: {
    status: { op: 'in' },
    vendorId: { op: 'eq' },
    riderId: { op: 'eq' },
    total: { op: 'range', column: 'totalKobo' },     // totalMin / totalMax
    createdAt: { op: 'dateRange' },                  // from / to
    paymentStatus: { op: 'in' },
  },
  sortable: ['createdAt', 'totalKobo', 'status'],
  defaultSort: '-createdAt',
  includes: { vendor: () => ({ model: Vendor, attributes: ['id', 'name', 'logoUrl'] }) },
};

// modules/orders/orders.service.js
async listForVendor(vendorId, query) {
  const q = buildListQuery(query, orderListConfig, { scope: { vendorId } }); // scope can't be overridden
  const { rows, count } = await Order.findAndCountAll({ ...q, distinct: true });
  return paginate(rows, count, q.page, q.limit);
}
```

- **Scope always wins:** the role scope (`vendorId` for vendors, `customerId` for customers) is merged last, so a vendor passing `vendorId=someone-else` still only sees their own data.
- `paginate()` builds the `meta` object; controllers call `respond.paginated(res, result)`.
- Operators supported: `eq`, `ne`, `in`, `like`, `range`, `dateRange`, `bool`, `isNull`, `geoRadius`.
- Counting large tables: admin lists use `count` with the same `where`; feeds use cursor pagination to avoid `COUNT(*)`.
- Every filterable or sortable column has an index (see Database Schema, section 9).

## 6. Background jobs with BullMQ

Slow, retryable or timed work runs in a separate worker process fed by named BullMQ queues; scheduled work uses BullMQ repeatable jobs, so there is no separate cron server.

### Queues and workers

| Queue | Jobs (examples) | Concurrency | Retries |
| --- | --- | --- | --- |
| `notifications` | `sms.send`, `email.send`, `push.send`, `inapp.create` | 20 | 5, exponential backoff from 10 s |
| `payments` | `webhook.process`, `transaction.verify`, `refund.record` | 5 | 8, exponential from 30 s |
| `subscriptions` | `renewal.remind`, `trial.end`, `grace.start`, `grace.expire`, `invoice.generate` | 5 | 3 |
| `dispatch` | `order.offerToRider`, `offer.timeout`, `order.autoReject` | 10 | 3 |
| `media` | `image.optimize`, `image.delete` | 4 | 3 |
| `payouts` | `rider.monthlyStatement`, `statement.notify` | 2 | 3 |
| `reports` | `stats.daily`, `export.csv` | 2 | 2 |
| `maintenance` | `tokens.purgeExpired`, `gps.archive`, `audit.archive` | 1 | 1 |

### Delayed jobs that drive the order flow

- When an order is paid: `order.autoReject` is added with a delay equal to the admin-set acceptance limit (e.g. 5 min) and job ID `autoReject:<orderId>`. If the vendor accepts first, the job is removed.
- When an order is ready: `order.offerToRider` picks the nearest online rider (Redis GEO search) and adds `offer.timeout` (30 s). On timeout or decline, the next rider is offered. After N failures, Dispatch admins are alerted.
- When a refund request is opened: a delayed `refund.deadline` job applies the admin-configured action if the vendor has not responded.

### Scheduled (repeatable) jobs

| Job | Schedule (Africa/Lagos) | What it does |
| --- | --- | --- |
| `subscriptions.scanRenewals` | Daily 08:00 | Sends 7-day and 1-day reminders; starts grace periods |
| `subscriptions.expireGrace` | Hourly | Hides storefronts whose grace period ended (BR-SUB-06) |
| `payouts.monthlyRiderStatements` | 1st of month 01:00 | Builds each rider's statement: sum of delivery fees on completed deliveries × payout % |
| `payments.reconcile` | Daily 02:00 | Compares yesterday's transactions with Paystack; flags mismatches |
| `reports.dailyStats` | Daily 00:30 | Pre-computes dashboard numbers (GMV, orders, MRR) |
| `tracking.archiveGps` | Daily 03:00 | Moves GPS points older than 30 days to archive table |
| `auth.purgeTokens` | Daily 04:00 | Deletes expired refresh tokens and OTPs |

### Code pattern

```js
// core/queue/index.js
export const queues = {
  notifications: new Queue('notifications', { connection, defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 } }),
  // ...
};

// modules/orders/orders.jobs.js — producer
export const scheduleAutoReject = (order, minutes) =>
  queues.dispatch.add('order.autoReject', { orderId: order.id }, { delay: minutes * 60_000, jobId: `autoReject:${order.id}` });

// worker.js — one Worker per queue, processors looked up by job name
new Worker('dispatch', (job) => processors.dispatch[job.name](job.data), { connection, concurrency: 10 });

// scheduler.js
await queues.payouts.upsertJobScheduler('monthly-rider-statements', { pattern: '0 1 1 * *', tz: 'Africa/Lagos' }, { name: 'rider.monthlyStatement' });
```

### Rules

- Jobs carry IDs only (`orderId`), never full objects; processors reload fresh data.
- Every processor is **idempotent** (safe to run twice), using unique job IDs and database checks.
- Jobs that touch money run inside a DB transaction and write an audit entry.
- Failed jobs after the last retry go to the failed set and raise an alert; Bull Board (`/admin/queues`, super admin only) shows queues, retries and failures.
- Workers shut down gracefully on SIGTERM (finish current jobs).

## 7. Real-time GPS tracking

Riders send their position over Socket.IO every 5–10 seconds while online; the server keeps the latest position in Redis, broadcasts it to the rooms that may see it, and writes a sampled trail to MySQL.

### Connection and rooms

- The client connects with the same JWT access token (`auth: { token }`); the socket middleware verifies it and joins rooms by role.

| Room | Members | Receives |
| --- | --- | --- |
| `user:<userId>` | Each user | Their notifications, order status changes |
| `order:<orderId>` | Customer, vendor, assigned rider (joined when allowed) | `order:status`, `rider:location` for that order |
| `vendor:<vendorId>` | Vendor and staff | `order:new`, `order:status` |
| `rider:<riderId>` | The rider | `job:offer`, `job:cancelled` |
| `admin:live-map` | Admins with `tracking.view` | All online riders' positions (throttled to every 10 s) |

### Events

| Event | Direction | Payload |
| --- | --- | --- |
| `rider:location` | rider → server | `{ lat, lng, heading, speed, accuracy, at }` |
| `rider:location` | server → `order:<id>`, `admin:live-map` | `{ riderId, lat, lng, heading, etaMinutes }` |
| `order:status` | server → rooms | `{ orderId, status, at }` |
| `job:offer` | server → `rider:<id>` | `{ orderId, pickup, dropoff, distanceKm, feeKobo, expiresAt }` |
| `rider:status` | rider → server | `{ online: true/false }` |

### Processing a location update

1. Reject if the rider is offline, the accuracy is worse than 100 m, or updates arrive faster than every 3 s.
2. `GEOADD riders:online <lng> <lat> <riderId>` in Redis (used for nearest-rider search) and store the latest point with a 2-minute expiry (stale riders drop out).
3. If the rider has an active delivery, emit to `order:<orderId>` with a recalculated ETA (straight-line estimate every update; Google Distance Matrix at most once a minute).
4. Every 30 s, append a row to `delivery_locations` for that delivery (dispute evidence, BRD FR-GPS-05).

### Scaling

The Socket.IO Redis adapter lets several API instances share rooms. Sticky sessions are enabled on the load balancer. The REST endpoint `GET /orders/:id/tracking` returns the latest position for clients that reconnect or cannot hold a socket.

## 8. Paystack integration

Paystack handles three money flows: order payments split to vendor subaccounts, vendor subscription billing, and recording of refunds. Webhooks confirm every one of them.

### Vendor subaccounts (onboarding)

1. Vendor enters bank and account number; the API resolves the account name via Paystack (`/bank/resolve`) and shows it for confirmation.
2. After admin approval, the API creates a Paystack subaccount (`/subaccount`) with `percentage_charge: 0` and stores `subaccountCode` on the vendor.
3. Changing bank details creates a new subaccount only after OTP + admin approval (BR-PAY-02); the old code is kept for history.

### Order payment (split)

1. Checkout: the API recalculates the price server-side (never trusts the client), creates the order as `pending_payment`, and calls `/transaction/initialize` with:
   - `amount` = food subtotal + delivery fee + processing fee (kobo)
   - `subaccount` = the vendor's `subaccountCode`
   - `transaction_charge` = delivery fee + processing fee (this part stays with KJT Foodie; the rest goes to the vendor)
   - `bearer` = `account` (KJT Foodie's share pays Paystack's fee, which the customer has already covered through the processing fee)
   - `reference` = our order payment reference; `channels` = card, bank, bank\_transfer, ussd
2. The frontend opens Paystack's popup with the access code.
3. Paystack sends `charge.success` to `POST /webhooks/paystack`.
4. The webhook handler checks the `x-paystack-signature` HMAC-SHA512 of the raw body, stores the event (unique on event ID to ignore duplicates), responds 200 immediately and adds `payments:webhook.process`.
5. The job verifies the transaction (`/transaction/verify/:reference`), checks amount and currency, marks the order `paid`, notifies the vendor, and schedules auto-reject.
6. Paystack settles the vendor's share to their bank on T+1. The vendor dashboard shows it as "settling" until then.

### Subscriptions

- Each plan × interval (Basic monthly, Basic yearly...) is a Paystack Plan; `paystackPlanCode` is stored on `plan_prices`. Admin price changes create a new Paystack plan and keep old ones for existing subscribers until renewal.
- Trial: the vendor subscription starts as `trialing` with no charge; at trial end the vendor is asked to pay and authorise their card, which creates the Paystack subscription.
- Webhooks handled: `subscription.create`, `charge.success` (renewal), `invoice.payment_failed` (start grace), `subscription.not_renew`, `subscription.disable`.

### Refunds

- Food refunds are between vendor and customer (BR-REF-01). The vendor records how they paid it (Paystack refund reference or bank transfer reference); the customer confirms.
- Delivery-fee refunds (vendor rejection, BR-REF-06) are issued by the platform via `/refund` for that portion; the `refund.processed` webhook updates the record.

### Safety rules

- The secret key lives only in the server environment; the public key only in the frontend.
- Amounts are always recomputed on the server and compared after verification.
- Webhook IPs are allow-listed in addition to the signature check.
- Every Paystack call and webhook is logged to `payment_events` with the raw payload for audit.

## 9. Security, configuration, logging, testing and deployment

### Security checklist

- HTTPS only; HSTS; `helmet` headers; CORS allow-list.
- Passwords bcrypt (cost 12); OTPs 6 digits, 5-minute expiry, max 5 tries, stored hashed.
- Refresh tokens stored hashed with rotation and reuse detection.
- Rate limits on login, OTP, checkout, comments.
- All input validated by Zod; Sequelize parameterised queries only (no raw string SQL).
- File uploads go straight to Cloudinary with signed, short-lived upload parameters; type and size checked.
- Ownership policies on every resource route (no guessing other users' IDs; IDs are UUIDs).
- PII (phone, address, documents) visible only to roles that need it; rider sees only the customer's first name, drop-off and a masked phone number.
- Secrets in environment variables / secret manager, never in Git.
- NDPA 2023: account deletion endpoint anonymises personal data but keeps financial records.

### Configuration

`config/env.js` validates all variables with Zod at startup and refuses to boot if any are missing:

```bash
NODE_ENV=production
PORT=4000
APP_URL=https://kjtfoodie.com
DB_HOST= DB_PORT=3306 DB_NAME=kjt_foodie DB_USER= DB_PASS=
REDIS_URL=redis://...
JWT_ACCESS_SECRET= JWT_REFRESH_SECRET=
PAYSTACK_SECRET_KEY= PAYSTACK_PUBLIC_KEY=
TERMII_API_KEY= EMAIL_API_KEY= CLOUDINARY_URL=
GOOGLE_MAPS_API_KEY=
TZ=Africa/Lagos
```

### Logging and monitoring

- Pino JSON logs with request ID, user ID and role; shipped to a log service (e.g. Better Stack / Grafana Loki).
- Sentry for errors in API and workers.
- Health checks: `GET /health` (process up) and `GET /health/ready` (MySQL + Redis reachable).
- Alerts: error rate, failed jobs, webhook failures, queue backlog, payment reconciliation mismatches.

### Testing

| Level | Tool | Scope |
| --- | --- | --- |
| Unit | Jest | Services, `buildListQuery`, money and geo utils, policies |
| Integration | Jest + Supertest + Testcontainers (MySQL, Redis) | Each endpoint: auth, roles, validation, pagination, filters |
| Contract | OpenAPI schema checks | Responses match the documented shapes the frontend mocks use |
| Jobs | Jest with a test Redis | Processors are idempotent; delayed jobs fire correctly |
| Payments | Paystack test mode + recorded webhooks | Split checkout, renewals, failures |

Target: 80% line coverage on services; CI (GitHub Actions) runs lint, tests and migrations on a fresh database for every PR.

### Environments and deployment

| Environment | Purpose | Paystack keys |
| --- | --- | --- |
| Local | Docker Compose: MySQL, Redis, API, worker, Bull Board | Test |
| Staging | Same as production, seeded demo data, used for UAT | Test |
| Production | Live | Live |

- One Docker image, started as `api` (2+ instances behind a load balancer) or `worker` (1+ instances) by command.
- Migrations run as a release step before new containers start; every migration has a `down`.
- Managed MySQL with daily backups and point-in-time recovery; managed Redis with persistence (AOF) so queued jobs survive restarts.
- Zero-downtime rolling deploys; workers finish current jobs before stopping.
