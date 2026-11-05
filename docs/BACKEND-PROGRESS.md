# KJT Foodie — Backend Progress

Last updated: 2026-11-04 · Current phase: **16** · Next up: **Phase 16 — Real time (Socket.IO)** (emit `order:status` from `transition()` in `orders.service.js` and `vendor:order:new` after order creation; confirm CI is green on the first push)

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
| 7 | Admin roles, permissions, admin users | 6 | 6/6 | ✅ |
| 8 | Uploads and audit log | 2 | 2/2 | ✅ |
| 9 | Settings, banks, reference data, seeder core | 4 | 4/4 | ✅ |
| 10 | Vendor onboarding and admin vendor review | 12 | 12/12 | ✅ |
| 11 | Rider onboarding and admin rider review | 12 | 12/12 | ✅ |
| 12 | Plans, subscriptions, Paystack webhook | 14 | 14/14 | ✅ |
| 13 | Catalogue, vendor menu, store, staff | 16 | 16/16 | ✅ |
| 14 | Social, feed and moderation | 16 | 16/16 | ✅ |
| 15 | Checkout, payments, orders, vendor sales | 18 | 18/18 | ✅ |
| 16 | Real time (Socket.IO) | — | — | ⬜ |
| 17 | Dispatch, deliveries, GPS, live map, chat | 11 | 0/11 | ⬜ |
| 18 | Reviews, rider trips, earnings, payouts | 9 | 0/9 | ⬜ |
| 19 | Refunds | 9 | 0/9 | ⬜ |
| 20 | Support tickets and admin inbox | 10 | 0/10 | ⬜ |
| 21 | Admin overview and the full demo world | 1 | 0/1 | ⬜ |
| 22 | Hardening and deployment | — | — | ⬜ |
| | **Total** | **162** | **122/162** | |

An endpoint counts as done only when it matches the contract, has integration tests, and is in Postman.

## What exists in the code today

| Area | File(s) | State |
| --- | --- | --- |
| Express app, middleware chain | `src/app.js` | Built: requestId, helmet, cors, compression, raw body for webhook, json, cookieParser, pino-http, rate limit |
| Server + graceful shutdown | `src/server.js` | Built (HTTP only; no Socket.IO yet); closes queues, Redis, DB |
| Redis | `src/config/redis.js` | ioredis via `REDIS_URL` (lazy connect); every key under `REDIS_KEY_PREFIX` (default `kjt:<NODE_ENV>`); `closeRedis()` |
| Queues | `src/core/queue/*`, `src/worker.js`, `src/scheduler.js` | `QUEUES` definitions (only `notifications` so far: concurrency 20, 5 attempts, exponential 10 s); `getQueue` / `addJob` / `jobId()`; `createWorker` routes by job name (unknown name → `UnrecoverableError`); worker process with graceful shutdown; scheduler registers `SCHEDULES` (empty) |
| Notifications | `src/modules/notifications/*`, `src/db/models/notification.model.js`, migration `20261029100000-create-notifications.cjs` | Table + model; service: list (`type`, `unread=true`, scoped), unread count, mark read (404 if not yours), read all; `notify(userId, payload, { transaction, sms, email })`; `notifyLater()`; jobs `sms.send`, `email.send`, `inapp.create`. Mounted at `/notifications` behind `authenticate` |
| Auth | `src/core/auth/*`, `src/core/middlewares/auth.js`, `src/modules/auth/*` | JWT access token (HS256, 15 min, `sub` + `role`); `authenticate` reloads the user every request (banned / suspended → 403 at once), `requireRole(...)`; refresh token = random 48 bytes in `kjt_refresh` cookie (httpOnly, `Path=/api/v1/auth`, SameSite=Lax, 30 days), stored as keyed SHA-256, rotated every refresh, family revoked on reuse (15 s grace for parallel tabs); OTPs hashed, 5 tries, single use, `123456` outside production; bcrypt (12; 4 in tests); Google ID token verify (`google.verifyIdToken`, replaceable in tests); per-route 5/min limits + OTP 5 per 10 min per phone; live permission sets from `admin_role_permissions` via `rolePermissions()` (Redis cache 10 min, invalidated on change); `requirePermission(...)` |
| Users / account | `src/modules/users/*`, `src/modules/addresses/*` | `toUserDto` (contract `User` with `permissions`, `vendor {…}`, `rider {…}`); `/me` get / patch / delete (anonymise + soft delete + revoke sessions); addresses CRUD + default, default first |
| Tables | migrations `20261029110000`–`120000` | `users` (paranoid), minimal `vendors` and `riders` (phases 10–12 add columns), `refresh_tokens`, `otp_codes`, `addresses`; FK `notifications.user_id → users`; `permissions`, `admin_roles`, `admin_role_permissions` (defaults inserted by the migration), FK `users.admin_role → admin_roles`. Every table `utf8mb4_0900_ai_ci` |
| Admin users / roles | `src/modules/admin/*` | `/admin/users` list / create (invite email with a 72 h set-password code) / patch (role, suspend, not yourself); `/admin/roles` list / patch / reset; Bull Board at `/admin/queues` (super admin; `?token=` link → path-scoped cookie) |
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
| Uploads | `src/modules/uploads/*`, `src/integrations/cloudinary/{cloudinary.client,storage}.js`, `uploads` table | `POST /uploads`: multer in memory (8 MB → 413), type from the bytes (sharp / `%PDF-`), images → WebP (EXIF-rotated, metadata stripped, width cap per purpose, ≤2 MB), role per purpose (403), documents `type: private` with 1 h signed URLs; every file recorded in `uploads` (owner, purpose, public id). `storage` is replaceable in tests; `uploadUrl(upload)` re-signs private files |
| Audit log | `src/core/audit/audit.js`, `src/modules/audit/*`, `audit_logs` table | `audit.log({ actor, action, targetType, targetId, summary, req }, { transaction })` (actor null → System); `GET /admin/audit-log` (`audit_log.view`). Phase 7 actions write `admin_user.created/updated`, `role.updated/reset` |
| API router | `src/routes.js` | Empty; modules mount here |
| Seeder | `src/db/seed/index.js`, `steps/{reference,users,vendors}.js`, `data/{cities,reference,vendors,images}.js` | `npm run seed`: refuses production, wipes all tables, runs `reference` (settings, 6 service areas with centres + neighbourhoods, 4 templates, 12 banks, required documents), `users`, `vendors` (Mama Put, Chidi Grills, Tolu's Pot + 45: 6 pending, 1 rejected, 1 suspended; documents, bank accounts, opening hours), `riders` (Tunde, Kemi + 34: 18 in Lagos, 4 pending, 1 suspended, 45% of approved online; guarantor, documents, bank), `subscriptions` (from each vendor's plan status; Mama Put Pro monthly renews in 9 days; invoices + matching subscription payments), then `catalogue` (12 categories, 287 dishes: Mama Put the first 14, others 5–10, photos up to the plan limit with credits; Mama Put's 2 staff), then `social` (likes, follows, ~1,000 comments with 35% vendor replies, 9 comment + 3 dish reports; counters padded), then `orders` (360 over 90 days, Mama Put's live queue today, Ada's `picked_up` order with a Lagos rider, Tunde's 24 trips; one payment each; dish ordersCount and rider tripsCount). `reference` also seeds the 3 plans; vendors get real-photo logos and covers |
| Settings | `src/modules/settings/*`, tables `settings` (key → JSON), `service_areas`, `notification_templates`, `required_documents` | `getSettings()` (Redis 10 min, defaults in code for missing keys), `updateSettings()` (mock bounds + wording, max fee ≥ base fee, audited), `invalidateSettings()`, `requiredDocuments(appliesTo)`. `GET`/`PATCH /admin/settings` (`settings.manage`) |
| Banks / Paystack | `src/modules/banks/*`, `src/integrations/paystack/paystack.client.js`, table `banks` | `paystack.listBanks / resolveAccount / createSubaccount` (replaceable in tests); `GET /banks` (public) and `POST /banks/resolve` (signed in, 10/min per user): Paystack in production with the list refreshed daily into `banks`, seeded list + fake lookup elsewhere |
| Vendor onboarding | `src/modules/vendors/{onboarding.service,vendors.presenter,vendors.routes}.js`, `src/modules/onboarding/onboarding.shared.js`, tables `vendor_documents`, `vendor_opening_hours`, `vendor_bank_accounts`, `bank_change_requests` + storefront columns on `vendors` | `/vendor/onboarding` (get, one step per PATCH, submit), `/vendor/documents` (attach / remove). Shared with riders: forward-only steps (`advanceStep`), `assertEditable` (draft / rejected), `ownUpload` (URL → the caller's own upload of that purpose), `resolveBank`, `notifyReviewers`, `decide()` for approve / reject / suspend / reinstate. Submit adds default opening hours when the store has none |
| Admin vendors | `src/modules/vendors/adminVendors.service.js` | `/admin/vendors` list / detail / approve / reject / suspend / reinstate / bank-change; `ensureSubaccount()` (best effort at approval, again at checkout); `DETAIL_EXTENSIONS` / `ROW_INCLUDES` let later phases add plan, menu and order numbers to the detail |
| Riders | `src/modules/riders/*`, tables `rider_documents`, `rider_bank_accounts` + vehicle / guarantor / review / position columns on `riders` | `/rider/onboarding` (vehicle → guarantor → documents → bank → review), `/rider/documents`, `GET /rider/me` (bank as last 4 digits, `payoutPct` from settings); `/admin/riders` list (filters incl. `online`) / detail / approve / reject / suspend (also goes offline) / reinstate. `isBusy` and `recentTrips` wait for deliveries (phase 17) |
| Plans and subscriptions | `src/modules/subscriptions/*`, tables `plans`, `subscriptions` (one per vendor), `subscription_invoices` | `GET /plans` (public, meta trialDays / yearlyDiscountPct); `/vendor/subscription` get / invoices / trial / initialize / verify / change / cancel / resume; `/admin/plans` (vendorCount, one popular, audited) and `/admin/subscriptions` list / extend. `quoteChange()` (new, same, upgrade prorated with ₦100 minimum, downgrade), `confirmSubscriptionPayment()` (idempotent, row-locked, amount checked) shared by verify and the webhook. `vendors.subscription_status` mirrors the subscription and is what public reads filter on |
| Payments and webhook | `src/modules/payments/*`, tables `payments` (subscription now, orders in phase 15), `payment_events` | `POST /webhooks/paystack`: HMAC-SHA512 over the raw body (401 otherwise), stored once by `event:data.id`, 200, `payments:webhook.process` job; `charge.success` for a plan payment activates it |
| Renewal sweep | `subscriptions.scan` (scheduler: hourly at :05), `src/modules/vendors/visibility.js` | 7-day and 1-day reminders (in-app + email with the `subscription_reminder` template), trial / cancelled plans end → expired, active plans renew by charging the saved card (Paystack live) or go to grace for `graceDays`, grace ends → expired. `isVendorPublic()` / `publicVendorWhere()` for phase 13 public reads |
| Catalogue | `src/modules/catalogue/*`, tables `categories`, `food_items` (photos, credits, option groups and days as JSON; counters; `is_hidden`; paranoid) | `GET /categories`, `/food-items` (search, filters incl. `maxDistanceKm`, sort `distanceM` via a SQL haversine), `/food-items/{id}`, `/vendors`, `/vendors/{slugOrId}`. Only `publicVendorWhere()` stores and non-hidden, non-deleted dishes. `optionalAuth` personalises; `originFor()` = lat/lng → default address → central Lagos; `isOpen` from opening hours in Lagos time (`core/utils/openingHours.js`). `personal.js` gives isLiked / isFollowing for the page |
| Vendor menu, store, staff | `src/modules/store/*`, table `vendor_staff` | `/vendor/menu` CRUD with plan limits (`planLimitsFor()`; 409 PLAN_LIMIT items, 422 photos; photos must be the vendor's own `food_photo` uploads or already on the item), `/vendor/store` (hours, pause, radius, prep, description, logo, cover), `/vendor/bank-change` (resolved, audited, reviewers told), `/vendor/staff` (plan staff limit) |
| Seed photos | `src/db/seed/media.js`, `.seed-cache/` (git-ignored) | Downloads every seed photo once, stores it through the upload pipeline (WebP, resized, Cloudinary `seed/<kind>`), caches the URL in `.seed-cache/manifest.json`; logos are 400×400 centre crops of dish photos. `SEED_MEDIA=remote` skips it (Wikimedia URLs) |
| Social and moderation | `src/modules/social/*`, tables `likes`, `follows`, `comments` (one level of vendor replies; `removed` / `hidden` flags), `reports` | `GET /feed` (cursor; nearby 1 km bands / popular score / newest / following, ranked in SQL), likes and follows (idempotent, counters in the same transaction), `/me/likes`, `/me/follows`, comments (500 chars; vendors reply on own dishes; edit / delete by the author), `POST /reports` (one open per person and target), `/vendor/engagement`, `/vendor/comments` (`answered` via EXISTS on vendor replies), `/admin/reports` list / resolve (settles every open report on the target; audited `comment.hidden|removed|report_dismissed`, `food_item.…`) |
| Checkout and payments | `src/modules/checkout/*`, `payments` (type `order`) | `priceCart()` (server prices, options, fees, ETA, scheduling, 422 quote codes), `/checkout/quote`, `/payments/initialize` (Paystack split: subtotal → vendor subaccount, `transaction_charge` = delivery + processing fee; flag `no_split` without a subaccount), `/payments/verify` → `confirmOrderPayment()` (idempotent, row-locked, amount checked; also run by the webhook) creates the order, schedules `dispatch:order.autoReject`, audits `payment.received`; `/me/payments` |
| Orders | `src/modules/orders/*`, tables `orders` (snapshots, fees, address JSON, delivery code, accept deadline, status history JSON), `order_items` | Scoped `/orders` and `/orders/{id}` (`orderScope()`; deliveryCode only for customer / admin), customer cancel (paid only, CANNOT_CANCEL), vendor accept / preparing / ready / reject (409 INVALID_STATUS), `transition()` appends history + notifies the customer, refunds (payment refunded; Paystack `/refund` after commit when live, `refund_failed` flag on error), accept deadline (delayed job + sweep on vendor reads), `/vendor/stats`, `/vendor/sales` (meta.summary), `/vendor/sales/daily` |
| Admin customers and payments | `src/modules/payments/{adminPayments,settlement}.service.js` | `/admin/customers` (ordersCount) and status changes (audited), `/admin/payments` (split summary, flagged) and reconcile (audited); hourly `payments.settle` (settling → settled after 36 h) and `payments.reconcile` (`missing_webhook` when Paystack never confirmed) |
| Postman | `docs/postman/kjt-foodie-api.postman_collection.json` | Health folder (`/api/v1/health`, `/health`, `/health/ready`); error-code table updated |
| Tests, lint, CI | `tests/`, `jest.config.js`, `eslint.config.js`, `.prettierrc.json`, `.github/workflows/ci.yml` | Jest + Supertest (337 tests), ESLint 10 flat config + Prettier, CI workflow (not run yet) |
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

### Phase 7 — Admin roles, permissions, admin users ✅

- [x] Tables: roles, permissions, role_permissions; default sets from handoff
- [x] `requirePermission` with Redis cache; permission test matrix
- [x] Bull Board behind super admin
- Endpoints:
  - [x] `GET /admin/users`
  - [x] `POST /admin/users`
  - [x] `PATCH /admin/users/{id}`
  - [x] `GET /admin/roles`
  - [x] `PATCH /admin/roles/{id}`
  - [x] `POST /admin/roles/{id}/reset`

### Phase 8 — Uploads and audit log ✅

- [x] Multipart upload → Cloudinary (types, 8 MB, WebP for food, private documents)
- [x] `audit.log()` helper; back-fill phase 7 actions
- Endpoints:
  - [x] `POST /uploads`
  - [x] `GET /admin/audit-log`

### Phase 9 — Settings, banks, reference data, seeder core ✅

- [x] Tables: settings, service_areas, notification_templates, required_documents, banks
- [x] Settings cache + invalidation; Paystack client (banks, resolve, subaccount)
- [x] Seeder core (`npm run seed`): settings, areas, templates, banks, required docs, cities
- Endpoints:
  - [x] `GET /admin/settings`
  - [x] `PATCH /admin/settings`
  - [x] `GET /banks`
  - [x] `POST /banks/resolve`

### Phase 10 — Vendor onboarding and admin vendor review ✅

- [x] Tables: vendors, vendor_documents, opening hours, bank accounts, bank_change_requests
- [x] Seed: Mama Put, Chidi Grills, Tolu's Pot + 45 vendors in the required states
- Endpoints:
  - [x] `GET /vendor/onboarding`
  - [x] `PATCH /vendor/onboarding`
  - [x] `POST /vendor/onboarding/submit`
  - [x] `POST /vendor/documents`
  - [x] `DELETE /vendor/documents/{id}`
  - [x] `GET /admin/vendors`
  - [x] `GET /admin/vendors/{id}`
  - [x] `POST /admin/vendors/{id}/approve`
  - [x] `POST /admin/vendors/{id}/reject`
  - [x] `POST /admin/vendors/{id}/suspend`
  - [x] `POST /admin/vendors/{id}/reinstate`
  - [x] `POST /admin/vendors/{id}/bank-change/{decision}`

### Phase 11 — Rider onboarding and admin rider review ✅

- [x] Tables: riders, rider_documents, rider bank accounts, guarantor
- [x] Seed: Tunde, Kemi + 34 riders
- Endpoints:
  - [x] `GET /rider/onboarding`
  - [x] `PATCH /rider/onboarding`
  - [x] `POST /rider/onboarding/submit`
  - [x] `POST /rider/documents`
  - [x] `DELETE /rider/documents/{id}`
  - [x] `GET /rider/me`
  - [x] `GET /admin/riders`
  - [x] `GET /admin/riders/{id}`
  - [x] `POST /admin/riders/{id}/approve`
  - [x] `POST /admin/riders/{id}/reject`
  - [x] `POST /admin/riders/{id}/suspend`
  - [x] `POST /admin/riders/{id}/reinstate`

### Phase 12 — Plans, subscriptions, Paystack webhook ✅

- [x] Tables: plans, subscriptions, subscription_invoices, payments, payment_events
- [x] `POST /webhooks/paystack` (signature, dedupe, queue) — not in the 162
- [x] Scheduler: reminders, grace, expiry; `isVendorPublic()` helper
- [x] Seed: 3 plans, subscriptions mix, invoices + payments
- Endpoints:
  - [x] `GET /plans`
  - [x] `GET /vendor/subscription`
  - [x] `GET /vendor/subscription/invoices`
  - [x] `POST /vendor/subscription/trial`
  - [x] `POST /vendor/subscription/initialize`
  - [x] `POST /vendor/subscription/verify`
  - [x] `POST /vendor/subscription/change`
  - [x] `POST /vendor/subscription/cancel`
  - [x] `POST /vendor/subscription/resume`
  - [x] `GET /admin/plans`
  - [x] `POST /admin/plans`
  - [x] `PATCH /admin/plans/{id}`
  - [x] `GET /admin/subscriptions`
  - [x] `POST /admin/subscriptions/{id}/extend`

### Phase 13 — Catalogue, vendor menu, store, staff ✅

- [x] Tables: categories, food_items (photos + credits, options, availability, hidden), vendor_staff
- [x] Seed: categories, 35 dishes, real photos via upload pipeline (cached download), covers, logos
- Endpoints:
  - [x] `GET /categories`
  - [x] `GET /food-items`
  - [x] `GET /food-items/{id}`
  - [x] `GET /vendors`
  - [x] `GET /vendors/{slugOrId}`
  - [x] `GET /vendor/menu`
  - [x] `POST /vendor/menu`
  - [x] `GET /vendor/menu/{id}`
  - [x] `PATCH /vendor/menu/{id}`
  - [x] `DELETE /vendor/menu/{id}`
  - [x] `GET /vendor/store`
  - [x] `PATCH /vendor/store`
  - [x] `POST /vendor/bank-change`
  - [x] `GET /vendor/staff`
  - [x] `POST /vendor/staff`
  - [x] `DELETE /vendor/staff/{id}`

### Phase 14 — Social, feed and moderation ✅

- [x] Tables: likes, follows, comments, reports
- [x] Seed: likes, follows, comments + replies, open reports
- Endpoints:
  - [x] `GET /feed`
  - [x] `POST /food-items/{id}/likes`
  - [x] `DELETE /food-items/{id}/likes`
  - [x] `GET /me/likes`
  - [x] `GET /food-items/{id}/comments`
  - [x] `POST /food-items/{id}/comments`
  - [x] `PATCH /comments/{id}`
  - [x] `DELETE /comments/{id}`
  - [x] `POST /reports`
  - [x] `POST /vendors/{id}/follow`
  - [x] `DELETE /vendors/{id}/follow`
  - [x] `GET /me/follows`
  - [x] `GET /vendor/engagement`
  - [x] `GET /vendor/comments`
  - [x] `GET /admin/reports`
  - [x] `POST /admin/reports/{id}/resolve`

### Phase 15 — Checkout, payments, orders, vendor sales ✅

- [x] Tables: orders, order_items, payments (order type)
- [x] Order state machine; accept-deadline delayed job; Paystack split + refunds; reconciliation flags
- [x] Seed: 360 orders over 90 days, today's Mama Put queue, Ada's live order
- Endpoints:
  - [x] `POST /checkout/quote`
  - [x] `POST /payments/initialize`
  - [x] `POST /payments/verify`
  - [x] `GET /me/payments`
  - [x] `GET /orders`
  - [x] `GET /orders/{id}`
  - [x] `POST /orders/{id}/cancel`
  - [x] `POST /orders/{id}/accept`
  - [x] `POST /orders/{id}/reject`
  - [x] `POST /orders/{id}/preparing`
  - [x] `POST /orders/{id}/ready`
  - [x] `GET /vendor/stats`
  - [x] `GET /vendor/sales`
  - [x] `GET /vendor/sales/daily`
  - [x] `GET /admin/customers`
  - [x] `POST /admin/customers/{id}/status`
  - [x] `GET /admin/payments`
  - [x] `POST /admin/payments/{id}/reconcile`

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
| 2026-10-29 | Admin roles live in `admin_roles` / `admin_role_permissions` (slug ids = `users.admin_role`, now an FK); `super_admin` is locked and always has every permission in code, whatever the table says | Handoff section 2; nobody can lock everyone out |
| 2026-10-29 | `ensureAdminRoles()` re-inserts missing roles + defaults; the seeder and the admin test factory call it | Seed wipes and test resets empty the roles tables the migration filled |
| 2026-10-29 | `POST /admin/users` creates the admin with no password and emails a 72 h `reset` OTP + `FRONTEND_URL/reset-password?identifier=…`; they finish through `POST /auth/password/reset` | Contract says "they get an email to set a password"; reuses the existing reset flow instead of a new invite endpoint |
| 2026-10-29 | Duplicate email on `POST /admin/users` → **422** `fieldErrors.email` (as the mock), unlike register's 409 | Contract lists only 422 for this endpoint |
| 2026-10-29 | Every migration passes `TABLE_OPTIONS` (`utf8mb4_0900_ai_ci`); test DB recreated with that collation if it differs. Phase 6 migrations edited in place (not yet deployed anywhere but dev, which already had that collation) | Case- and accent-insensitive search must not depend on the server default |
| 2026-10-29 | Bull Board at `/admin/queues` (server root, not `/api/v1`): open `/admin/queues?token=<access token>` once; the token moves to an httpOnly `SameSite=Strict` cookie on `Path=/admin/queues` and the URL is cleaned by redirect. Super admin only, re-checked every request | A browser page can't send a Bearer header; the cookie never reaches the API |
| 2026-10-29 | Every `POST /uploads` file gets an `uploads` row (owner, purpose, Cloudinary public id, returned url). Later phases resolve a `url` the client sends (`photos`, `documents[].url`, …) through this table and refuse files that aren't the caller's or have the wrong purpose | Stops users attaching other people's files; private documents can be re-signed from the public id |
| 2026-10-29 | Private documents use Cloudinary `type: private` + `private_download_url` (1 h). Screens that show documents later (onboarding, admin review) re-sign with `uploadUrl()`; the stored url is only an identifier | Handoff: "signed, short-lived URLs; owner and admins only". Checked against the real account: the signed URL downloads the PDF |
| 2026-10-29 | Upload type is detected from the bytes (sharp metadata / `%PDF-`), never from the file name or MIME type; GIF, HEIC, SVG etc. → 422. Documents may be an image (stored as WebP) or a PDF (stored as-is) | A renamed file can't slip through; SVG could carry script |
| 2026-10-29 | Width caps: food photo / cover / refund photo 1600 px, logo / avatar 512 px, documents 2000 px; WebP quality steps 80 → 45 until ≤ 2 MB | Handoff only fixes food photos (1600 px, < 2 MB); the rest are our choice |
| 2026-10-29 | Who may upload: vendor → food_photo, vendor_logo, vendor_cover, vendor_document; rider → rider_document; customer → refund_photo; anyone signed in → avatar. Admins can only upload avatars | Contract: "purpose decides who may upload" without a table |
| 2026-10-29 | `audit_logs` is append-only (no `updated_at`), keeps `actor_name` / `actor_role` as they were, no FK on `actor_id`; `audit.log` takes the caller's transaction | The log must not change when users do, and a rolled-back change must leave no entry |
| 2026-10-29 | If Cloudinary stores a file but the `uploads` insert then fails, the file is orphaned | Rare; a cleanup job can sweep files with no row later (phase 22) |
| 2026-10-29 | `settings` is key → JSON rows with the defaults in code (`settings.defaults.js`); a key without a row reads its default. `serviceAreas` and `notificationTemplates` live in their own tables but are read and written through the same settings object | New settings in later phases need no migration; areas carry centres / neighbourhoods and templates are looked up by key |
| 2026-10-29 | Cities removed from `serviceAreas` are retired (`is_active = false`), not deleted; names match case-insensitively, so re-adding one revives it with its centre | Old addresses and vendors keep pointing at the city |
| 2026-10-29 | Template edits only change existing keys (unknown key → 422 `notificationTemplates.N.key`); admins can change channel, subject and body | The code sends by key, so a new key would never be used |
| 2026-10-29 | `PATCH /admin/settings` also accepts `processingFeePct` (as the mock does); numbers must be JSON numbers (the mock coerced strings) and kobo / seconds / days / hours must be whole numbers | Contract types are `integer` / `number` |
| 2026-10-29 | Bank list and account lookup use Paystack only when `NODE_ENV=production`; `PAYSTACK_SECRET_KEY` is required there. Phase 12 decides separately how payments use the test keys in development | Plan: "Paystack list in production; seeded list locally"; the fake lookup gives the frontend journeys predictable names |
| 2026-10-29 | If Paystack is down, `GET /banks` serves the last stored list instead of failing | The onboarding form keeps working |
| 2026-10-29 | The seeder closes Redis as well as the DB when it ends; a killed seed leaves the DB empty, because the wipe commits before the seed transaction | Seed steps clear Redis caches; an open Redis connection kept the process alive after a successful seed |
| 2026-11-04 | Vendor / rider documents are rows pointing at `uploads` (`upload_id`); the API returns a freshly signed link each time | The stored URL of a private file is only an identifier (phase 8 decision) |
| 2026-11-04 | Seeded documents point at the Wikimedia paperwork photo through an `uploads` row (`publicId: seed/document-sample`, public); phase 13 copies seed images through the upload pipeline and will repoint them | Phase 13 owns the cached image download; documents only need a placeholder until then |
| 2026-11-04 | Paystack subaccount is created after approval only when `paystackMode.live()` (a secret key is set and not in tests); a failure is logged and the approval stands; the code lives on the active `vendor_bank_accounts` row | Approval shouldn't fail on a Paystack hiccup; checkout (phase 15) creates it if missing. Replaced accounts keep their code for history |
| 2026-11-04 | Bank account numbers are stored in plain text for now | Encryption at rest is listed for phase 22 hardening |
| 2026-11-04 | Unknown wizard `step` → 422 `fieldErrors.step` (mock: 400); location city must be an active service area (stored with its own spelling); unfinished submit → 422 with `fieldErrors` keyed by step | Field errors are easier to show; the form only offers service-area cities |
| 2026-11-04 | Approval decisions and "new application" notices use notification `type: system` (the mock sends `vendor`, `rider`, `vendor_submitted`, `rider_submitted`) | The contract's `Notification.type` enum (and the column) only has order, refund, social, review, subscription, payout, system |
| 2026-11-04 | Rider vehicle types are `motorcycle`, `bicycle`, `car` (handoff 8.4 says "motorbike") | Contract and mock use motorcycle |
| 2026-11-04 | One payout account per rider (`rider_bank_accounts.rider_id` unique), replaced in place while editing | Riders are paid by monthly transfer; no split subaccount or approval flow for changes in the contract |
| 2026-11-04 | Plans are one table with `monthly_price`; the yearly price is computed from `yearlyDiscountPct` (no `plan_prices` / Paystack Plan codes) | Contract `Plan` + mock; a discount change applies to every plan at once |
| 2026-11-04 | Billing uses one-off Paystack transactions per period, not Paystack recurring subscriptions: the reusable card from the last payment is charged at renewal by the hourly sweep; no card / failure → grace | Matches the contract's initialize / verify / upgrade flow (prorated upgrades are impossible with Paystack Plans) |
| 2026-11-04 | `paystackMode.live()` = a secret key is set and not in tests. Without it (or in tests) initialize returns a local reference / access code and verify succeeds like the mock | Lets the frontend journeys run without Paystack; dev with test keys uses real Paystack test mode |
| 2026-11-04 | A trial or a cancelled plan ends as `expired` (no grace); grace is only for an active plan whose renewal wasn't paid | BRD: grace follows a failed renewal |
| 2026-11-04 | Verify with an unpaid / mismatched payment → 409 `INVALID_STATUS` ("We haven't received this payment yet…"); a short payment is flagged `amount_mismatch` and never activates | Contract lists only 200 / 404 for verify |
| 2026-11-04 | Plan payments write audit `subscription.paid` (not in the handoff's list) | "Every money event" is audited |
| 2026-11-04 | The plans migration clears `vendors.plan_id` before adding its FK | Earlier seeds stored plan ids before `plans` existed; reseed after migrating |
| 2026-11-05 | Order payments keep the mock's split fields: `vendorShare` = subtotal, `platformShare` = delivery fee, `fee` = processing fee (Paystack's real fee replaces it when live) | Same numbers as the mock admin screens; the processing fee is what covers Paystack |
| 2026-11-05 | A missing Paystack subaccount doesn't block checkout: the payment is flagged `no_split` and the whole amount lands with KJT Foodie | The customer can still order; finance settles the vendor by hand |
| 2026-11-05 | Accept deadline: delayed BullMQ job `dispatch:order.autoReject` (removed on accept / reject / cancel) plus a sweep on vendor order reads; a late accept returns 409 with the mock's "not accepted in time" message | Works even if the worker was down |
| 2026-11-05 | Settlement is time-based (settled 36 h after payment) until Paystack settlement data is wired in; reconciliation only flags `missing_webhook` when Paystack is live | Matches the T+1 schedule the dashboard shows |
| 2026-11-05 | Order notifications use type `order`; the status line is the frontend's customer text per status | Contract enum |
| 2026-11-05 | Unpaid checkouts (`status: pending`) are hidden from `/me/payments` and `/admin/payments` | They are not transactions yet |
| 2026-11-05 | Comment, like and new-comment notifications use type `social`; moderation notices to vendors use `system` | Contract notification enum (the mock sends `moderation`) |
| 2026-11-05 | Dismissing a report audits `comment.report_dismissed` / `food_item.report_dismissed` (as the mock); the handoff lists only hidden / removed | Every admin decision is logged |
| 2026-11-05 | Food items keep `photos`, `photo_credits`, `option_groups` and `available_days` as JSON columns, not child tables | Never filtered on; orders copy the chosen options; the frontend sends them whole |
| 2026-11-05 | Distances are computed in SQL with a haversine expression (`distanceSql()`), not a spatial index | TiDB (dev DB) has no ST_Distance_Sphere / spatial indexes; fine at this size, revisit with Redis GEO in phase 17 |
| 2026-11-05 | Seed photos are uploaded to Cloudinary once and reused via `.seed-cache/manifest.json`; a photo that can't be copied falls back to its Wikimedia URL with a warning | Handoff 8.1: no hot-linking, re-seeds must not re-download. Wikimedia rate-limits (429), so downloads retry with Retry-After and run two at a time |
| 2026-11-05 | Seeded documents now point at the Cloudinary copy of the paperwork photo (public; `#<id>` keeps each `uploads.url` unique) | Replaces the phase 10 Wikimedia placeholder |
| 2026-11-05 | Staff are records (name, email, phone, role) counted against the plan; they get no login yet | The contract has no staff auth flow; **open:** decide with the frontend how staff sign in |
| 2026-11-05 | Category `icon` keeps the mock's emoji; categories also get `image`, a real dish photo | The contract has `icon`; handoff 8.1 says pictures must be photos |
| 2026-11-05 | Moderation "remove" on a dish hides it (like the mock) instead of deleting it | The vendor still sees it (`isHidden`) and can contact support |
| 2026-11-05 | `paginate()` no longer passes `attributes` to the count query | Selecting columns with COUNT fails under ONLY_FULL_GROUP_BY (`GET /vendors`) |
| 2026-11-04 | Wrong status for an admin decision → 409 `INVALID_STATUS` with the mock's message; unknown bank-change decision → 400 | Contract says 409 without a code; INVALID_STATUS is the handoff's generic one |
| 2026-10-28 | No Docker anywhere: MySQL and Redis run locally / managed; tests use a local `kjt_foodie_test` DB; CI uses GitHub Actions `services`; production runs Node processes with PM2 | Project owner's decision |

## Contract questions for the frontend

Add: date, endpoint, what the handoff/contract says, what is unclear or wrong.

| Date | Endpoint | Question |
| --- | --- | --- |
| 2026-10-29 | `POST /auth/register` 409 | Contract gives no `error.code` for a duplicate phone/email. The backend sends `CONFLICT` (as the mock's default) with `fieldErrors.phone` / `fieldErrors.email`. Confirm, or name a code |
| 2026-10-29 | `POST /auth/register` duplicate | The mock returns 422 `VALIDATION_ERROR` with `fieldErrors.phone`; the contract says 409. Backend follows the contract (409 `CONFLICT` + `fieldErrors`). Please align the mock |
| 2026-10-29 | `POST /auth/logout` | Contract inherits `bearerAuth`; backend accepts it without a token (cookie only). Suggest `security: []` in the contract |
| 2026-10-29 | `GET /me` | Backend also returns `phoneVerified` and `createdAt` (not in the `User` schema); please add them or say if unwanted |
| 2026-10-29 | `POST /uploads` | `width` / `height` are `integer` in the contract; for a PDF document the backend returns `null`. Please mark them nullable |
| 2026-11-04 | `Notification.type` | The mock creates `vendor`, `rider`, `vendor_submitted`, `rider_submitted`, `support`, `delivery`, `moderation`, `chat`, which the contract enum doesn't list. Backend uses `system` for onboarding ones for now. Extend the enum, or confirm the UI only needs the listed values |
| 2026-10-29 | `POST /auth/login` 401 | The mock sends `INVALID_CREDENTIALS`, which the handoff error table does not list. Backend sends it; please add it to the handoff table |

## Session log

| Date | Phase | What was done |
| --- | --- | --- |
| 2026-11-05 | 15 | Checkout quote, payments initialize / verify (order created on payment, idempotent, also via webhook), `/me/payments`, scoped orders, customer cancel, vendor accept / preparing / ready / reject with refunds, accept deadline job, vendor stats / sales / daily, admin customers and payments with reconcile (18 endpoints); orders and order_items; dispatch queue; settlement and reconciliation schedules; `orders` seed step; Postman "Checkout and orders" and "Admin · Customers and payments" folders; customer / payment endpoints in the permission matrix. Dev DB migrated and reseeded. |
| 2026-11-05 | 14 | Feed, likes, follows, comments, reports, vendor engagement / comments and admin moderation (16 endpoints); likes, follows, comments, reports tables; isLiked / isFollowing on catalogue reads; `social` seed step; Postman "Social" and "Admin · Moderation" folders; moderation endpoints in the permission matrix. Dev DB migrated and reseeded. |
| 2026-11-05 | 13 | Catalogue (5 public endpoints), vendor menu (5), store + bank change (3) and staff (3); categories, food_items, vendor_staff; seed photos copied to Cloudinary once (123 files, cached); `catalogue` seed step (287 dishes); `optionalAuth`, `distanceSql()`, Lagos opening-hours check; `paginate()` count fix; Postman "Catalogue" and "Vendor menu, store and staff" folders. Dev DB migrated and reseeded. |
| 2026-11-04 | 12 | Plans, vendor subscriptions (trial, pay / upgrade / downgrade / cancel / resume), admin plans and subscriptions (14 endpoints); payments + payment_events; Paystack webhook with signature check, dedupe and worker job; hourly renewal sweep; `isVendorPublic()`; plans in the reference seed and a `subscriptions` seed step; Postman "Subscriptions", "Admin · Plans and subscriptions" and "Webhooks" folders; plan endpoints in the permission matrix (162 cases green). Seed fix: sample document uploads get their own `public_id` / `url` (both unique). Dev DB migrated and reseeded (48 vendors, 36 riders, 40 subscriptions, 77 invoices). |
| 2026-11-04 | 11 | Rider onboarding (5 endpoints + `/rider/me`) and admin rider review (6 endpoints) on the shared onboarding helpers; rider tables and columns; `riders` seed step (36 riders); Postman "Rider onboarding" and "Admin · Riders" folders; rider endpoints in the permission matrix. |
| 2026-11-04 | 10 | Vendor onboarding (5 endpoints) and admin vendor review (7 endpoints); 4 new tables + storefront columns; shared onboarding helpers; `vendors` seed step (48 vendors with documents, banks, hours); Postman "Vendor onboarding" and "Admin · Vendors" folders; vendor endpoints added to the permission matrix. |
| 2026-10-28 | 1–2 | Initial setup and core plumbing committed (`setup`, `p2`). Frontend handoff received; build plan rewritten against it; this progress file created. |
| 2026-10-29 | 9 | Settings (key/JSON rows + defaults, Redis cache, mock validation, audited), service areas / templates / required documents / banks tables, Paystack client, `GET`/`PATCH /admin/settings`, `GET /banks`, `POST /banks/resolve`, `reference` seed step (seeder now also closes Redis); Postman Banks folder + settings requests; 337 tests green; dev DB migrated and reseeded. |
| 2026-10-29 | 8 | `POST /uploads` (multer, sharp → WebP, type sniffing, role per purpose, private documents with signed URLs, `uploads` table) and `GET /admin/audit-log` (`audit_logs` table, `audit.log()` helper, phase 7 actions back-filled). Real Cloudinary checked once (public upload, private PDF via signed URL; test files deleted). Postman Uploads folder + Audit log request; dev DB migrated. |
| 2026-10-29 | 7 | 296 tests green. Roles / permissions tables + migration defaults, `requirePermission` with Redis cache, permission matrix test over every admin endpoint × sub-role, `/admin/users` + `/admin/roles` (6 endpoints), Bull Board behind super admin, Postman "Admin · Users and roles" folder, utf8mb4_0900_ai_ci on every table; dev DB migrated. |
| 2026-10-29 | 6 | Auth (register, password, OTP, Google, refresh rotation with reuse detection, logout, password reset), `/me` get / patch / delete, addresses, notifications mounted; users / vendors / riders / tokens / OTP / addresses tables; seed slice (81 users); Postman Auth, Account, Notifications folders; 249 tests green; dev DB migrated + seeded; verified end to end against the running server. |
| 2026-10-29 | 5 | Redis (managed, TLS), Redis rate-limit store + auth/OTP limiters, BullMQ queue/worker factories, `worker.js` and `scheduler.js` (smoke-tested as real processes), notifications table/model/service/jobs, `notify()`, readiness checks Redis. Tests: SMS/email in log mode, retry with backoff, unknown job fails without retry, duplicate job ids, notify after commit / nothing on rollback, 429 from the Redis limiter (191 tests green). Dev DB migrated. |
| 2026-10-29 | 4 | List query layer: `buildListQuery`, `paginate`, cursor helpers; unit tests for every operator, clamp, max limit, ignored params, sort whitelist, scope override; MySQL integration test (174 tests green). |
| 2026-10-29 | 3 | Database foundation: model loader, ID helper, transaction + row-lock helpers (concurrency test proves only one of two racing updates wins), migration helpers, shared utils with unit tests (125 tests green). |
| 2026-10-29 | 1–2 | Finished phases 1 and 2: ESLint/Prettier, Jest + Supertest (66 tests green against `kjt_foodie_test`), CI workflow, README, full `.env.example`, seed placeholder + `truncateAllTables`; error codes/classes/messages aligned with the handoff, body-parser 400/413, `noContent`, CORS, `GET /api/v1/health`, Swagger on `docs/api/openapi.yaml` (`docs/openapi/` removed), Postman updated. |
