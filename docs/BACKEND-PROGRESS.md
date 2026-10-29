# KJT Foodie — Backend Progress

Last updated: 2026-10-29 · Current phase: **7** · Next up: **Phase 7 — Admin roles, permissions, admin users** (move `DEFAULT_ROLE_PERMISSIONS` into the roles table; confirm CI is green on the first push)

## How to use this file (read first in every new chat)

1. Read this file, then the phase you are working on in
   [`KJT Foodie — Backend Build Plan.md`](KJT%20Foodie%20—%20Backend%20Build%20Plan.md).
2. For exact request / response shapes use `docs/api/openapi.yaml`; for conventions, filters, events,
   rules and seed data use `docs/05-backend-handoff.md`. The contract wins over everything else.
3. Work on the **Next up** item. Do not start a later phase while an earlier one has unchecked items,
   unless this file says they are deliberately deferred.
4. At the end of every session update this file:
   - tick finished items `[x]`, update the phase status in the summary table
   - add a line to the **Session log**
   - record anything that differs from the plan under **Deviations and decisions**
   - record contract problems under **Contract questions for the frontend**
   - set **Current phase** and **Next up** at the top

Status keys: ✅ done · 🟡 in progress · ⬜ not started · ⏸ deferred

## Summary

| # | Phase | Endpoints | Done | Status |
| --- | --- | --- | --- | --- |
| 1 | Project setup and tooling | — | — | ✅ |
| 2 | Core plumbing aligned to the handoff | 1 | 1/1 | ✅ |
| 3 | Database foundation and shared helpers | — | — | ✅ |
| 4 | List query layer | — | — | ✅ |
| 5 | Redis, queues, notifications | 4 | 4/4 | ✅ |
| 6 | Authentication, profile, addresses | 17 | 17/17 | ✅ |
| 7 | Admin roles, permissions, admin users | 6 | 0/6 | ⬜ |
| 8 | Uploads and audit log | 2 | 0/2 | ⬜ |
| 9 | Settings, banks, reference data, seeder core | 4 | 0/4 | ⬜ |
| 10 | Vendor onboarding and admin vendor review | 12 | 0/12 | ⬜ |
| 11 | Rider onboarding and admin rider review | 12 | 0/12 | ⬜ |
| 12 | Plans, subscriptions, Paystack webhook | 14 | 0/14 | ⬜ |
| 13 | Catalogue, vendor menu, store, staff | 16 | 0/16 | ⬜ |
| 14 | Social, feed and moderation | 16 | 0/16 | ⬜ |
| 15 | Checkout, payments, orders, vendor sales | 18 | 0/18 | ⬜ |
| 16 | Real time (Socket.IO) | — | — | ⬜ |
| 17 | Dispatch, deliveries, GPS, live map, chat | 11 | 0/11 | ⬜ |
| 18 | Reviews, rider trips, earnings, payouts | 9 | 0/9 | ⬜ |
| 19 | Refunds | 9 | 0/9 | ⬜ |
| 20 | Support tickets and admin inbox | 10 | 0/10 | ⬜ |
| 21 | Admin overview and the full demo world | 1 | 0/1 | ⬜ |
| 22 | Hardening and deployment | — | — | ⬜ |
| | **Total** | **162** | **22/162** | |

An endpoint counts as done only when it matches the contract, has integration tests, and is in Postman.

## What exists in the code today

| Area | File(s) | State |
| --- | --- | --- |
| Express app, middleware chain | `src/app.js` | Built: requestId, helmet, cors, compression, raw body for webhook, json, cookieParser, pino-http, rate limit |
| Server + graceful shutdown | `src/server.js` | Built (HTTP only; no Socket.IO yet); closes queues, Redis, DB |
| Redis | `src/config/redis.js` | ioredis via `REDIS_URL` (lazy connect); every key under `REDIS_KEY_PREFIX` (default `kjt:<NODE_ENV>`); `closeRedis()` |
| Queues | `src/core/queue/*`, `src/worker.js`, `src/scheduler.js` | `QUEUES` definitions (only `notifications` so far: concurrency 20, 5 attempts, exponential 10 s); `getQueue` / `addJob` / `jobId()`; `createWorker` routes by job name (unknown name → `UnrecoverableError`); worker process with graceful shutdown; scheduler registers `SCHEDULES` (empty) |
| Notifications | `src/modules/notifications/*`, `src/db/models/notification.model.js`, migration `20261029100000-create-notifications.cjs` | Table + model; service: list (`type`, `unread=true`, scoped), unread count, mark read (404 if not yours), read all; `notify(userId, payload, { transaction, sms, email })`; `notifyLater()`; jobs `sms.send`, `email.send`, `inapp.create`. Mounted at `/notifications` behind `authenticate` |
| Auth | `src/core/auth/*`, `src/core/middlewares/auth.js`, `src/modules/auth/*` | JWT access token (HS256, 15 min, `sub` + `role`); `authenticate` reloads the user every request (banned / suspended → 403 at once), `requireRole(...)`; refresh token = random 48 bytes in `kjt_refresh` cookie (httpOnly, `Path=/api/v1/auth`, SameSite=Lax, 30 days), stored as keyed SHA-256, rotated every refresh, family revoked on reuse (15 s grace for parallel tabs); OTPs hashed, 5 tries, single use, `123456` outside production; bcrypt (12; 4 in tests); Google ID token verify (`google.verifyIdToken`, replaceable in tests); per-route 5/min limits + OTP 5 per 10 min per phone; `DEFAULT_ROLE_PERMISSIONS` (until phase 7) |
| Users / account | `src/modules/users/*`, `src/modules/addresses/*` | `toUserDto` (contract `User` with `permissions`, `vendor {…}`, `rider {…}`); `/me` get / patch / delete (anonymise + soft delete + revoke sessions); addresses CRUD + default, default first |
| Tables | migrations `20261029110000`–`110500` | `users` (paranoid), minimal `vendors` and `riders` (phases 10–12 add columns), `refresh_tokens`, `otp_codes`, `addresses`; FK `notifications.user_id → users` |
| Seed | `src/db/seed/steps/users.js`, `src/db/seed/data/cities.js` | 11 demo accounts (handoff 8.2, password `password123`), `ven_mama_put` / `ven_expired` / `ven_new`, `rid_tunde` / `rid_new`, Ada's 2 addresses, 70 customers `usr_customer_001…070` (3 suspended, 2 banned) with one address each. Dev DB migrated and seeded |
| SMS / email | `src/integrations/termii/termii.client.js`, `src/integrations/email/email.client.js` | Termii in production, log mode elsewhere; email log mode only (production provider not chosen) |
| Env validation | `src/config/env.js` | Built (Zod). `.env.example` lists every later var; Redis, Termii and email are validated now, the rest join the schema in their phases |
| Logger | `src/config/logger.js` | Built (pino) |
| Swagger | `src/config/openapi.js` | Serves `docs/api/openapi.yaml` at `/docs` (+ `/docs/openapi.json`); `docs/openapi/` removed |
| Errors | `src/core/errors/*` | Aligned with handoff: every code has a status + friendly default message; classes take a specific code (`new ConflictError('TRIAL_USED')`, `new QuoteError('OUT_OF_RANGE')`) and reject codes of the wrong status |
| Responses | `src/core/http/respond.js`, `asyncHandler.js` | `ok`, `created`, `noContent` (204), `paginated` |
| Middlewares | `src/core/middlewares/*` | errorHandler (body-parser → 400/413, Sequelize → 409/422), notFound, rateLimit (Redis store; general 300/min, `authRateLimit` / `otpRateLimit` 5/min ready for phase 6; health exempt; requests pass if Redis is down), requestId, validate (Zod → `fieldErrors`). CORS: 5173/5174/4173, `GET POST PATCH DELETE`, `Authorization, Content-Type` |
| Health | `src/modules/health/health.routes.js`, `src/routes.js` | `GET /api/v1/health` (contract) + `/health`, `/health/ready` (MySQL + Redis) at the root |
| Database | `src/db/{sequelize,index,id,transaction,wipe}.js`, `src/db/models/index.js`, `src/db/migrationHelpers.cjs`, `src/config/database.cjs` | Sequelize (`underscored`, timestamps, UTC); loader for `src/db/models/*.model.js` + `associate()`; `idColumn()` / `newId()` (VARCHAR(64), UUID v7); `withTransaction` + `lockForUpdate`; migration column helpers (`id`, `foreignId`, `timestamps`, `softDelete`, `kobo`); `truncateAllTables()`. No real models or migrations yet |
| List queries | `src/core/query/*` | `buildListQuery(req.query, config, { scope })` → `{ where, order, include, page, limit }`; `paginate(Model, listQuery)` (count, clamp page, fetch); `parseCursor` / `cursorMeta` / `cursorPaginate` (offset cursors like the mock) |
| Utils | `src/core/utils/*` | `money`, `phone` (`normalisePhone`), `slug` (`slugify`, `uniqueSlug`), `dates` (Lagos days), `geo` (`haversineM`), `codes` (`orderCode`, `deliveryCode`, `uniqueCode`), `random` (seeded Faker `en_NG`, `weighted`) |
| Cloudinary | `src/integrations/cloudinary/cloudinary.client.js` | Client configured, no upload endpoint |
| API router | `src/routes.js` | Empty; modules mount here |
| Seeder | `src/db/seed/index.js` | `npm run seed`: refuses production, wipes all tables, runs `SEED_STEPS` (empty) |
| Postman | `docs/postman/kjt-foodie-api.postman_collection.json` | Health folder (`/api/v1/health`, `/health`, `/health/ready`); error-code table updated |
| Tests, lint, CI | `tests/`, `jest.config.js`, `eslint.config.js`, `.prettierrc.json`, `.github/workflows/ci.yml` | Jest + Supertest (249 tests), ESLint 10 flat config + Prettier, CI workflow (not run yet) |
| README | `README.md` | Local MySQL/Redis install, scripts, doc links |

## Phase checklists

### Phase 1 — Project setup and tooling ✅

- [x] Node 20 ESM project, Express, core dependencies (`package.json`)
- [x] Folder structure `src/{config,core,db,integrations,modules}`
- [x] `.env.example`, Zod env validation
- [x] Sequelize CLI config (`.sequelizerc`, `database.cjs`), `db:migrate` scripts
- [x] ESLint + Prettier (`lint`, `format` scripts)
- [x] Local MySQL 8 + Redis 7 install steps in README (no Docker)
- [x] Jest + Supertest + test DB reset helper; `test` script
- [x] `seed` script placeholder (wipe + seed)
- [x] GitHub Actions: lint, format check, migrate / undo-all / migrate on a fresh DB, test (MySQL + Redis `services`) — **not run yet: check it is green after the first push**
- [x] `README.md` (run, seed, links to docs)
- [x] `.env.example` completed for Redis, JWT, cookie, Paystack, Termii, email, Google

### Phase 2 — Core plumbing aligned to the handoff ✅

- [x] Global middleware chain in order
- [x] `AppError` family, `errorHandler`, `notFound`, `validate` (Zod → `fieldErrors` with dotted paths)
- [x] `respond.ok / created / paginated`, `asyncHandler`
- [x] Graceful shutdown
- [x] Error codes match handoff: `INTERNAL` → `INTERNAL_ERROR`; add `BAD_REQUEST`, `PAYLOAD_TOO_LARGE`, `ACCOUNT_BANNED`, `ACCOUNT_SUSPENDED`, all 409 codes, 422 quote codes; remove / map `SUBSCRIPTION_INACTIVE`, `CONFLICT`, `PAYMENT_FAILED`
- [x] Error classes accept a specific `code`
- [x] Body-parser errors → 400 `BAD_REQUEST` / 413 `PAYLOAD_TOO_LARGE`
- [x] Friendly default messages (handoff "message is shown as-is")
- [x] `respond.noContent` (204 for DELETE)
- [x] CORS: origins 5173, 5174, 4173; methods `GET, POST, PATCH, DELETE`; headers `Authorization, Content-Type`
- [x] Swagger serves `docs/api/openapi.yaml`; retire `docs/openapi/`
- [x] Tests for every error envelope
- Endpoints:
  - [x] `GET /api/v1/health` (contract path; keep root `/health` + `/health/ready` too)

### Phase 3 — Database foundation and shared helpers ✅

- [x] Sequelize instance and connection
- [x] Global options (`underscored`, UTC) and model loader with `associate()`
- [x] ID helper (string PK `VARCHAR(64)`, UUID v7, fixed seed IDs allowed)
- [x] Utils + unit tests: money, phone → E.164, slug (unique), Lagos day, haversine, order code, delivery code, seeded RNG
- [x] `withTransaction` + row-lock pattern
- [x] `db:migrate` and `db:migrate:undo:all` clean on empty DB

### Phase 4 — List query layer ✅

- [x] `buildListQuery` (page clamp, limit ≤100, sort whitelist, search, comma filters, bool, ranges, prefix, geo, from/to Lagos days)
- [x] Scope override wins over client filters
- [x] `paginate()` meta; cursor helpers
- [x] Unit tests for every operator

### Phase 5 — Redis, queues, notifications ✅

- [x] Redis connection; Redis rate-limit store; auth/OTP limits
- [x] BullMQ queue/worker factories, `worker.js`, `scheduler.js`
- [x] `notifications` queue: `sms.send`, `email.send`, `inapp.create`
- [x] `notifications` table + `notify()` helper
- [x] `/health/ready` checks Redis
- Endpoints (mounted and HTTP-tested in phase 6):
  - [x] `GET /notifications`
  - [x] `GET /notifications/unread-count`
  - [x] `POST /notifications/{id}/read`
  - [x] `POST /notifications/read-all`

### Phase 6 — Authentication, profile, addresses ✅

- [x] Tables: `users`, `refresh_tokens`, `otp_codes`, `addresses`
- [x] `authenticate`, `requireRole`; refresh cookie rotation + reuse detection
- [x] Seed: 11 demo accounts, Ada's 2 addresses, ~70 customers (some suspended / banned)
- Endpoints:
  - [x] `POST /auth/register`
  - [x] `POST /auth/login`
  - [x] `POST /auth/otp/request`
  - [x] `POST /auth/otp/verify`
  - [x] `POST /auth/google`
  - [x] `POST /auth/refresh`
  - [x] `POST /auth/logout`
  - [x] `POST /auth/password/forgot`
  - [x] `POST /auth/password/reset`
  - [x] `GET /me`
  - [x] `PATCH /me`
  - [x] `DELETE /me`
  - [x] `GET /addresses`
  - [x] `POST /addresses`
  - [x] `PATCH /addresses/{id}`
  - [x] `DELETE /addresses/{id}`
  - [x] `POST /addresses/{id}/default`

### Phase 7 — Admin roles, permissions, admin users ⬜

- [ ] Tables: roles, permissions, role_permissions; default sets from handoff
- [ ] `requirePermission` with Redis cache; permission test matrix
- [ ] Bull Board behind super admin
- Endpoints:
  - [ ] `GET /admin/users`
  - [ ] `POST /admin/users`
  - [ ] `PATCH /admin/users/{id}`
  - [ ] `GET /admin/roles`
  - [ ] `PATCH /admin/roles/{id}`
  - [ ] `POST /admin/roles/{id}/reset`

### Phase 8 — Uploads and audit log ⬜

- [ ] Multipart upload → Cloudinary (types, 8 MB, WebP for food, private documents)
- [ ] `audit.log()` helper; back-fill phase 7 actions
- Endpoints:
  - [ ] `POST /uploads`
  - [ ] `GET /admin/audit-log`

### Phase 9 — Settings, banks, reference data, seeder core ⬜

- [ ] Tables: settings, service_areas, notification_templates, required_documents, banks
- [ ] Settings cache + invalidation; Paystack client (banks, resolve, subaccount)
- [ ] Seeder core (`npm run seed`): settings, areas, templates, banks, required docs, cities
- Endpoints:
  - [ ] `GET /admin/settings`
  - [ ] `PATCH /admin/settings`
  - [ ] `GET /banks`
  - [ ] `POST /banks/resolve`

### Phase 10 — Vendor onboarding and admin vendor review ⬜

- [ ] Tables: vendors, vendor_documents, opening hours, bank accounts, bank_change_requests
- [ ] Seed: Mama Put, Chidi Grills, Tolu's Pot + 45 vendors in the required states
- Endpoints:
  - [ ] `GET /vendor/onboarding`
  - [ ] `PATCH /vendor/onboarding`
  - [ ] `POST /vendor/onboarding/submit`
  - [ ] `POST /vendor/documents`
  - [ ] `DELETE /vendor/documents/{id}`
  - [ ] `GET /admin/vendors`
  - [ ] `GET /admin/vendors/{id}`
  - [ ] `POST /admin/vendors/{id}/approve`
  - [ ] `POST /admin/vendors/{id}/reject`
  - [ ] `POST /admin/vendors/{id}/suspend`
  - [ ] `POST /admin/vendors/{id}/reinstate`
  - [ ] `POST /admin/vendors/{id}/bank-change/{decision}`

### Phase 11 — Rider onboarding and admin rider review ⬜

- [ ] Tables: riders, rider_documents, rider bank accounts, guarantor
- [ ] Seed: Tunde, Kemi + 34 riders
- Endpoints:
  - [ ] `GET /rider/onboarding`
  - [ ] `PATCH /rider/onboarding`
  - [ ] `POST /rider/onboarding/submit`
  - [ ] `POST /rider/documents`
  - [ ] `DELETE /rider/documents/{id}`
  - [ ] `GET /rider/me`
  - [ ] `GET /admin/riders`
  - [ ] `GET /admin/riders/{id}`
  - [ ] `POST /admin/riders/{id}/approve`
  - [ ] `POST /admin/riders/{id}/reject`
  - [ ] `POST /admin/riders/{id}/suspend`
  - [ ] `POST /admin/riders/{id}/reinstate`

### Phase 12 — Plans, subscriptions, Paystack webhook ⬜

- [ ] Tables: plans, subscriptions, subscription_invoices, payments, payment_events
- [ ] `POST /webhooks/paystack` (signature, dedupe, queue) — not in the 162
- [ ] Scheduler: reminders, grace, expiry; `isVendorPublic()` helper
- [ ] Seed: 3 plans, subscriptions mix, invoices + payments
- Endpoints:
  - [ ] `GET /plans`
  - [ ] `GET /vendor/subscription`
  - [ ] `GET /vendor/subscription/invoices`
  - [ ] `POST /vendor/subscription/trial`
  - [ ] `POST /vendor/subscription/initialize`
  - [ ] `POST /vendor/subscription/verify`
  - [ ] `POST /vendor/subscription/change`
  - [ ] `POST /vendor/subscription/cancel`
  - [ ] `POST /vendor/subscription/resume`
  - [ ] `GET /admin/plans`
  - [ ] `POST /admin/plans`
  - [ ] `PATCH /admin/plans/{id}`
  - [ ] `GET /admin/subscriptions`
  - [ ] `POST /admin/subscriptions/{id}/extend`

### Phase 13 — Catalogue, vendor menu, store, staff ⬜

- [ ] Tables: categories, food_items (photos + credits, options, availability, hidden), vendor_staff
- [ ] Seed: categories, 35 dishes, real photos via upload pipeline (cached download), covers, logos
- Endpoints:
  - [ ] `GET /categories`
  - [ ] `GET /food-items`
  - [ ] `GET /food-items/{id}`
  - [ ] `GET /vendors`
  - [ ] `GET /vendors/{slugOrId}`
  - [ ] `GET /vendor/menu`
  - [ ] `POST /vendor/menu`
  - [ ] `GET /vendor/menu/{id}`
  - [ ] `PATCH /vendor/menu/{id}`
  - [ ] `DELETE /vendor/menu/{id}`
  - [ ] `GET /vendor/store`
  - [ ] `PATCH /vendor/store`
  - [ ] `POST /vendor/bank-change`
  - [ ] `GET /vendor/staff`
  - [ ] `POST /vendor/staff`
  - [ ] `DELETE /vendor/staff/{id}`

### Phase 14 — Social, feed and moderation ⬜

- [ ] Tables: likes, follows, comments, reports
- [ ] Seed: likes, follows, comments + replies, open reports
- Endpoints:
  - [ ] `GET /feed`
  - [ ] `POST /food-items/{id}/likes`
  - [ ] `DELETE /food-items/{id}/likes`
  - [ ] `GET /me/likes`
  - [ ] `GET /food-items/{id}/comments`
  - [ ] `POST /food-items/{id}/comments`
  - [ ] `PATCH /comments/{id}`
  - [ ] `DELETE /comments/{id}`
  - [ ] `POST /reports`
  - [ ] `POST /vendors/{id}/follow`
  - [ ] `DELETE /vendors/{id}/follow`
  - [ ] `GET /me/follows`
  - [ ] `GET /vendor/engagement`
  - [ ] `GET /vendor/comments`
  - [ ] `GET /admin/reports`
  - [ ] `POST /admin/reports/{id}/resolve`

### Phase 15 — Checkout, payments, orders, vendor sales ⬜

- [ ] Tables: orders, order_items, payments (order type)
- [ ] Order state machine; accept-deadline delayed job; Paystack split + refunds; reconciliation flags
- [ ] Seed: 360 orders over 90 days, today's Mama Put queue, Ada's live order
- Endpoints:
  - [ ] `POST /checkout/quote`
  - [ ] `POST /payments/initialize`
  - [ ] `POST /payments/verify`
  - [ ] `GET /me/payments`
  - [ ] `GET /orders`
  - [ ] `GET /orders/{id}`
  - [ ] `POST /orders/{id}/cancel`
  - [ ] `POST /orders/{id}/accept`
  - [ ] `POST /orders/{id}/reject`
  - [ ] `POST /orders/{id}/preparing`
  - [ ] `POST /orders/{id}/ready`
  - [ ] `GET /vendor/stats`
  - [ ] `GET /vendor/sales`
  - [ ] `GET /vendor/sales/daily`
  - [ ] `GET /admin/customers`
  - [ ] `POST /admin/customers/{id}/status`
  - [ ] `GET /admin/payments`
  - [ ] `POST /admin/payments/{id}/reconcile`

### Phase 16 — Real time (Socket.IO) ⬜

- [ ] Socket.IO server, Redis adapter, JWT on connect, room join checks
- [ ] `order:subscribe` / `order:unsubscribe` → `order:status`
- [ ] `vendor:subscribe` / `vendor:unsubscribe` → `vendor:order:new`
- [ ] `notification:new` (optional)

### Phase 17 — Dispatch, deliveries, GPS, live map, chat ⬜

- [ ] Tables: deliveries, delivery_offers, chat_messages
- [ ] Dispatch queue (nearest rider, 30 s offers, next rider, alert dispatch)
- [ ] Socket: `rider:subscribe`, `rider:location` (in/out), `rider:job:offer`, `chat:message`, `admin:live-map`
- [ ] `GET /admin/riders` extended with `nearOrderId`
- [ ] Seed: deliveries, Ada's live route, Tunde's trips
- Endpoints:
  - [ ] `POST /rider/status`
  - [ ] `GET /rider/offers`
  - [ ] `POST /deliveries/offers/{id}/accept`
  - [ ] `POST /deliveries/offers/{id}/decline`
  - [ ] `GET /rider/delivery`
  - [ ] `POST /deliveries/{id}/pickup`
  - [ ] `POST /deliveries/{id}/complete`
  - [ ] `POST /admin/orders/{id}/reassign`
  - [ ] `GET /admin/live-map`
  - [ ] `GET /orders/{id}/chat`
  - [ ] `POST /orders/{id}/chat`

### Phase 18 — Reviews, rider trips, earnings, payouts ⬜

- [ ] Tables: reviews, rider_payout_statements; monthly statement job
- [ ] Seed: reviews, 3 months of statements
- Endpoints:
  - [ ] `POST /orders/{id}/reviews`
  - [ ] `GET /reviews`
  - [ ] `POST /reviews/{id}/reply`
  - [ ] `GET /rider/trips`
  - [ ] `GET /rider/earnings`
  - [ ] `GET /rider/statements`
  - [ ] `GET /admin/payouts`
  - [ ] `POST /admin/payouts/{id}/approve`
  - [ ] `POST /admin/payouts/{id}/mark-paid`

### Phase 19 — Refunds ⬜

- [ ] Table: refunds (timeline, comments); deadline job with `refundMissedAction`
- [ ] Seed: ~20 refunds across all statuses
- Endpoints:
  - [ ] `GET /refunds`
  - [ ] `POST /refunds`
  - [ ] `GET /refunds/{id}`
  - [ ] `POST /refunds/{id}/confirm`
  - [ ] `POST /refunds/{id}/dispute`
  - [ ] `POST /refunds/{id}/respond`
  - [ ] `POST /refunds/{id}/mark-paid`
  - [ ] `POST /refunds/{id}/comments`
  - [ ] `POST /refunds/{id}/escalate`

### Phase 20 — Support tickets and admin inbox ⬜

- [ ] Tables: support_tickets, support_messages
- [ ] Seed: 11 tickets
- Endpoints:
  - [ ] `GET /support/tickets`
  - [ ] `POST /support/tickets`
  - [ ] `GET /support/tickets/{id}`
  - [ ] `POST /support/tickets/{id}/messages`
  - [ ] `POST /support/tickets/{id}/resolve`
  - [ ] `GET /admin/tickets`
  - [ ] `GET /admin/tickets/{id}`
  - [ ] `PATCH /admin/tickets/{id}`
  - [ ] `POST /admin/tickets/{id}/messages`
  - [ ] `GET /admin/agents`

### Phase 21 — Admin overview and the full demo world ⬜

- [ ] Full deterministic seeder (handoff section 8), notifications, 60 audit entries, 26 extra active orders today
- [ ] Four journeys pass with `VITE_USE_MOCKS=false`; all frontend mocks deleted
- Endpoints:
  - [ ] `GET /admin/overview`

### Phase 22 — Hardening and deployment ⬜

- [ ] Coverage 80%+ on services; contract validation in CI; k6 load test
- [ ] Security review, permission matrix on staging, forged webhooks, PII per role
- [ ] Full Paystack test-mode run; reconciliation check; one live transaction
- [ ] Production infra, CI/CD, monitoring, backups, production seed, runbook
- [ ] UAT sign-off

## Deviations and decisions

| Date | Decision | Why |
| --- | --- | --- |
| 2026-10-28 | `docs/api/openapi.yaml` (frontend handoff) is the master contract; `docs/openapi/` split files will be retired | Handoff says the contract wins; one source avoids drift |
| 2026-10-28 | Orders are created only by `POST /payments/verify` (and the webhook), not by a `POST /orders` | Handoff section 6; replaces the old build plan's flow |
| 2026-10-28 | Uploads go through `POST /uploads` (multipart, server-side to Cloudinary), not signed client uploads | Handoff section 7 |
| 2026-10-28 | String primary keys (`VARCHAR(64)`) so seeded demo IDs match the frontend tests | Handoff 8.2 (optional but easier test porting) |
| 2026-10-28 | Notification storage built in phase 5 (not phase 19) | Almost every later phase creates notifications |
| 2026-10-29 | Kept generic `CONFLICT` (409) and added `INVALID_CREDENTIALS` (401) beside the handoff codes | The frontend mock uses both (`respond.js` default 409 code; login failure). Unique-constraint safety net returns `CONFLICT` + `fieldErrors` |
| 2026-10-29 | Error envelope also carries `error.requestId` (= `X-Request-Id` header); added to the `Error` schema in the contract | Lets users quote it to support; additive, the frontend ignores unknown keys |
| 2026-10-29 | `/health/ready` added to `docs/api/openapi.yaml` (server root); `/api/v1/health` returns `status`, `time` and `uptime` | Merged the retired `docs/openapi/health.yaml` into the master contract |
| 2026-10-29 | Default error messages copied from the frontend mock (`foodie-fe/src/mocks/utils/respond.js`); each specific code got its own friendly default | Same wording whether the frontend runs on mocks or the real API |
| 2026-10-29 | Test DB name comes from `DB_NAME_TEST` (default `<DB_NAME>_test`) and must end in `_test`; `npm test` creates + migrates it in Jest `globalSetup`. Jest `testTimeout` 20 s | Tests truncate tables, so they must never hit a real DB. The current `.env` points at TiDB Cloud, where the first TLS connect can take >5 s |
| 2026-10-29 | Models live in `src/db/models/*.model.js` (factory `(sequelize, DataTypes) => Model`); the Sequelize instance moved to `src/db/sequelize.js`; `src/db/index.js` re-exports everything | Avoids a circular import between the instance and the loader |
| 2026-10-29 | Migrations are `.cjs` (the package is ESM; sequelize-cli `require()`s them) and use `src/db/migrationHelpers.cjs` for `id` / FK / timestamps / soft delete / kobo columns. Timestamps are `DATETIME(3)` | Checked with a throwaway migration: migrate, FK `RESTRICT`/`CASCADE`, undo-all all clean |
| 2026-10-29 | `truncateAllTables()` uses `DELETE`, not `TRUNCATE` | `TRUNCATE` is DDL: slow on TiDB and an implicit commit on MySQL; IDs are strings so there are no counters to reset |
| 2026-10-29 | `normalisePhone` uses the frontend's exact rule (10 national digits starting 7/8/9) | A stricter backend rule would reject numbers the form accepted |
| 2026-10-29 | Order codes use `A–Z 2–9` without look-alikes (no 0/O, 1/I/L); slugs drop apostrophes and accents (`Tolu's Pot` → `tolus-pot`) | People read codes aloud; nicer URLs. Nothing in the frontend depends on the mock's slug for apostrophes |
| 2026-10-29 | Tests against the current `.env` DB (TiDB Cloud, Tokyo) take ~70 s because each query is a ~0.5 s round trip. For a fast loop point `DB_*` at the local MySQL 8 (README steps) | Network latency, not code |
| 2026-10-29 | List config: `filters` entries are an attribute name, `{ field, op: eq\|gte\|lte\|gt\|lt\|prefix, type: string\|integer\|number\|boolean }`, or a custom `(values, query) => where` (geo). Unparseable values are ignored like unknown params. `sortable` is a whitelist (API key → attribute / nested path); `id ASC` is always appended as a tie-breaker | Handoff section 3; matches the mock's `applyListQuery` |
| 2026-10-29 | `$assoc.column$` search/sort only on belongsTo / hasOne includes; searching hasMany rows needs a custom `id IN (SELECT …)` filter | Sequelize moves the main query into a subquery when a hasMany is included with `limit`, so joined columns are out of reach. Every search in handoff section 3 is on a belongsTo relation |
| 2026-10-29 | Scoped lists: a client filter on a scoped attribute is dropped, then the scope is ANDed in | Customers passing another `customerId` just get their own rows, never someone else's |
| 2026-10-29 | Cursor = offset as a string (`"20"`), default limit 10, max 50 | Same as the mock's `cursorPaginate`; opaque to the client, so it can become a keyset cursor later |
| 2026-10-29 | Redis is a managed instance (`rediss://`, set by the project owner) rather than local; keys are namespaced by `REDIS_KEY_PREFIX` (default `kjt:<NODE_ENV>`) so dev and tests share it safely | No local Redis on the dev machine |
| 2026-10-29 | Job ids use `jobId('autoReject', orderId)` → `autoReject-<orderId>`; Architecture doc updated | BullMQ 6 rejects `:` in custom job ids |
| 2026-10-29 | `notify()` writes the in-app row in the caller's transaction and queues SMS / email in `afterCommit`; a queue failure there is logged, not thrown | Nobody is texted about a change that rolled back, and a Redis blip can't fail a request whose DB work already committed |
| 2026-10-29 | `notifications.user_id` has no FK yet; the phase 6 users migration adds it | `users` doesn't exist until phase 6 |
| 2026-10-29 | Rate limiter uses `passOnStoreError` | A Redis outage degrades to "no rate limit" instead of taking the API down |
| 2026-10-29 | **Open:** production email provider not chosen; `email.send` throws in production until one is wired in (`EMAIL_API_KEY` is reserved for it) | No provider named in the docs; project owner to decide before go-live |
| 2026-10-29 | `users` stores `first_name` / `last_name` (contract), not `full_name` (Schema doc); `admin_role` is a slug column until phase 7 adds the roles table | Contract `User` has firstName / lastName / adminRole |
| 2026-10-29 | Minimal `vendors` / `riders` tables created in phase 6 (approval, onboarding step, subscription status, plan id, online) | Sign-up must create the draft profile and `/me` must return `vendor {…}` / `rider {…}` now; phases 10–12 add the remaining columns |
| 2026-10-29 | Duplicate phone / email on register and PATCH /me → **409 `CONFLICT`** with `fieldErrors` (contract), not the mock's 422 | Contract wins; the frontend `Form` puts `fieldErrors` on the inputs for any status |
| 2026-10-29 | `DELETE /addresses/{id}` returns **200 `{ id, deleted: true }`** | Contract and mock both say 200 (exception to the handoff's "DELETE → 204") |
| 2026-10-29 | `/auth/logout` needs no access token (the refresh cookie identifies the session) and is always 204 | Logout must work when the access token has expired |
| 2026-10-29 | `authenticate` refuses banned **and** suspended users on every request (403 `ACCOUNT_BANNED` / `ACCOUNT_SUSPENDED`), not just at login / refresh | Blocks take effect at once instead of up to 15 minutes later |
| 2026-10-29 | `DELETE /me` anonymises (name "Deleted user", email / phone / password / Google id cleared), deletes addresses, revokes sessions, then soft-deletes the user | NDPA; orders (later phases) keep pointing at the anonymised row |
| 2026-10-29 | JWT secrets must be 32+ characters only in production (dev `.env` has shorter ones) | Don't break existing dev config; production is strict |
| 2026-10-29 | `JWT_REFRESH_TTL` is read as days (`30d`) to match the existing `.env` | Owner's `.env` already used that key |
| 2026-10-29 | `RATE_LIMITS=false` in tests (tests/setup/env.js); auth limits are per route (`authRateLimit('login')`) | One shared counter across all auth routes would lock users out after a normal sign-in flow |
| 2026-10-29 | Test reset uses one multi-statement query on a test-only connection; `DB_TEST_HOST/PORT/USER/PASS/SSL` can point tests at a local MySQL; Jest timeout 60 s | Remote TiDB round trips (~0.45 s) made per-test resets take ~5 s; the full suite takes ~7 min remotely |
| 2026-10-28 | No Docker anywhere: MySQL and Redis run locally / managed; tests use a local `kjt_foodie_test` DB; CI uses GitHub Actions `services`; production runs Node processes with PM2 | Project owner's decision |

## Contract questions for the frontend

Add: date, endpoint, what the handoff/contract says, what is unclear or wrong.

| Date | Endpoint | Question |
| --- | --- | --- |
| 2026-10-29 | `POST /auth/register` 409 | Contract gives no `error.code` for a duplicate phone/email. The backend sends `CONFLICT` (as the mock's default) with `fieldErrors.phone` / `fieldErrors.email`. Confirm, or name a code |
| 2026-10-29 | `POST /auth/register` duplicate | The mock returns 422 `VALIDATION_ERROR` with `fieldErrors.phone`; the contract says 409. Backend follows the contract (409 `CONFLICT` + `fieldErrors`). Please align the mock |
| 2026-10-29 | `POST /auth/logout` | Contract inherits `bearerAuth`; backend accepts it without a token (cookie only). Suggest `security: []` in the contract |
| 2026-10-29 | `GET /me` | Backend also returns `phoneVerified` and `createdAt` (not in the `User` schema); please add them or say if unwanted |
| 2026-10-29 | `POST /auth/login` 401 | The mock sends `INVALID_CREDENTIALS`, which the handoff error table does not list. Backend sends it; please add it to the handoff table |

## Session log

| Date | Phase | What was done |
| --- | --- | --- |
| 2026-10-28 | 1–2 | Initial setup and core plumbing committed (`setup`, `p2`). Frontend handoff received; build plan rewritten against it; this progress file created. |
| 2026-10-29 | 6 | Auth (register, password, OTP, Google, refresh rotation with reuse detection, logout, password reset), `/me` get / patch / delete, addresses, notifications mounted; users / vendors / riders / tokens / OTP / addresses tables; seed slice (81 users); Postman Auth, Account, Notifications folders; 249 tests green; dev DB migrated + seeded; verified end to end against the running server. |
| 2026-10-29 | 5 | Redis (managed, TLS), Redis rate-limit store + auth/OTP limiters, BullMQ queue/worker factories, `worker.js` and `scheduler.js` (smoke-tested as real processes), notifications table/model/service/jobs, `notify()`, readiness checks Redis. Tests: SMS/email in log mode, retry with backoff, unknown job fails without retry, duplicate job ids, notify after commit / nothing on rollback, 429 from the Redis limiter (191 tests green). Dev DB migrated. |
| 2026-10-29 | 4 | List query layer: `buildListQuery`, `paginate`, cursor helpers; unit tests for every operator, clamp, max limit, ignored params, sort whitelist, scope override; MySQL integration test (174 tests green). |
| 2026-10-29 | 3 | Database foundation: model loader, ID helper, transaction + row-lock helpers (concurrency test proves only one of two racing updates wins), migration helpers, shared utils with unit tests (125 tests green). |
| 2026-10-29 | 1–2 | Finished phases 1 and 2: ESLint/Prettier, Jest + Supertest (66 tests green against `kjt_foodie_test`), CI workflow, README, full `.env.example`, seed placeholder + `truncateAllTables`; error codes/classes/messages aligned with the handoff, body-parser 400/413, `noContent`, CORS, `GET /api/v1/health`, Swagger on `docs/api/openapi.yaml` (`docs/openapi/` removed), Postman updated. |
