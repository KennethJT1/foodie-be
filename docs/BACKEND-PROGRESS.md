# KJT Foodie — Backend Progress

Last updated: 2026-10-29 · Current phase: **4** · Next up: **Phase 4 — List query layer** (and confirm CI is green on the first push)

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
| 4 | List query layer | — | — | ⬜ |
| 5 | Redis, queues, notifications | 4 | 0/4 | ⬜ |
| 6 | Authentication, profile, addresses | 17 | 0/17 | ⬜ |
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
| | **Total** | **162** | **1/162** | |

An endpoint counts as done only when it matches the contract, has integration tests, and is in Postman.

## What exists in the code today

| Area | File(s) | State |
| --- | --- | --- |
| Express app, middleware chain | `src/app.js` | Built: requestId, helmet, cors, compression, raw body for webhook, json, cookieParser, pino-http, rate limit |
| Server + graceful shutdown | `src/server.js` | Built (HTTP only; no Socket.IO yet) |
| Env validation | `src/config/env.js` | Built (Zod). `.env.example` lists every later var (Redis, JWT, cookie, Paystack, Termii, email, Google); each phase adds its vars to the Zod schema |
| Logger | `src/config/logger.js` | Built (pino) |
| Swagger | `src/config/openapi.js` | Serves `docs/api/openapi.yaml` at `/docs` (+ `/docs/openapi.json`); `docs/openapi/` removed |
| Errors | `src/core/errors/*` | Aligned with handoff: every code has a status + friendly default message; classes take a specific code (`new ConflictError('TRIAL_USED')`, `new QuoteError('OUT_OF_RANGE')`) and reject codes of the wrong status |
| Responses | `src/core/http/respond.js`, `asyncHandler.js` | `ok`, `created`, `noContent` (204), `paginated` |
| Middlewares | `src/core/middlewares/*` | errorHandler (body-parser → 400/413, Sequelize → 409/422), notFound, rateLimit (in-memory; health exempt), requestId, validate (Zod → `fieldErrors`). CORS: 5173/5174/4173, `GET POST PATCH DELETE`, `Authorization, Content-Type` |
| Health | `src/modules/health/health.routes.js`, `src/routes.js` | `GET /api/v1/health` (contract) + `/health`, `/health/ready` at the root |
| Database | `src/db/{sequelize,index,id,transaction,wipe}.js`, `src/db/models/index.js`, `src/db/migrationHelpers.cjs`, `src/config/database.cjs` | Sequelize (`underscored`, timestamps, UTC); loader for `src/db/models/*.model.js` + `associate()`; `idColumn()` / `newId()` (VARCHAR(64), UUID v7); `withTransaction` + `lockForUpdate`; migration column helpers (`id`, `foreignId`, `timestamps`, `softDelete`, `kobo`); `truncateAllTables()`. No real models or migrations yet |
| Utils | `src/core/utils/*` | `money`, `phone` (`normalisePhone`), `slug` (`slugify`, `uniqueSlug`), `dates` (Lagos days), `geo` (`haversineM`), `codes` (`orderCode`, `deliveryCode`, `uniqueCode`), `random` (seeded Faker `en_NG`, `weighted`) |
| Cloudinary | `src/integrations/cloudinary/cloudinary.client.js` | Client configured, no upload endpoint |
| API router | `src/routes.js` | Empty; modules mount here |
| Seeder | `src/db/seed/index.js` | `npm run seed`: refuses production, wipes all tables, runs `SEED_STEPS` (empty) |
| Postman | `docs/postman/kjt-foodie-api.postman_collection.json` | Health folder (`/api/v1/health`, `/health`, `/health/ready`); error-code table updated |
| Tests, lint, CI | `tests/`, `jest.config.js`, `eslint.config.js`, `.prettierrc.json`, `.github/workflows/ci.yml` | Jest + Supertest (125 tests), ESLint 10 flat config + Prettier, CI workflow (not run yet) |
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

### Phase 4 — List query layer ⬜

- [ ] `buildListQuery` (page clamp, limit ≤100, sort whitelist, search, comma filters, bool, ranges, prefix, geo, from/to Lagos days)
- [ ] Scope override wins over client filters
- [ ] `paginate()` meta; cursor helpers
- [ ] Unit tests for every operator

### Phase 5 — Redis, queues, notifications ⬜

- [ ] Redis connection; Redis rate-limit store; auth/OTP limits
- [ ] BullMQ queue/worker factories, `worker.js`, `scheduler.js`
- [ ] `notifications` queue: `sms.send`, `email.send`, `inapp.create`
- [ ] `notifications` table + `notify()` helper
- [ ] `/health/ready` checks Redis
- Endpoints (mounted in phase 6):
  - [ ] `GET /notifications`
  - [ ] `GET /notifications/unread-count`
  - [ ] `POST /notifications/{id}/read`
  - [ ] `POST /notifications/read-all`

### Phase 6 — Authentication, profile, addresses ⬜

- [ ] Tables: `users`, `refresh_tokens`, `otp_codes`, `addresses`
- [ ] `authenticate`, `requireRole`; refresh cookie rotation + reuse detection
- [ ] Seed: 11 demo accounts, Ada's 2 addresses, ~70 customers (some suspended / banned)
- Endpoints:
  - [ ] `POST /auth/register`
  - [ ] `POST /auth/login`
  - [ ] `POST /auth/otp/request`
  - [ ] `POST /auth/otp/verify`
  - [ ] `POST /auth/google`
  - [ ] `POST /auth/refresh`
  - [ ] `POST /auth/logout`
  - [ ] `POST /auth/password/forgot`
  - [ ] `POST /auth/password/reset`
  - [ ] `GET /me`
  - [ ] `PATCH /me`
  - [ ] `DELETE /me`
  - [ ] `GET /addresses`
  - [ ] `POST /addresses`
  - [ ] `PATCH /addresses/{id}`
  - [ ] `DELETE /addresses/{id}`
  - [ ] `POST /addresses/{id}/default`

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
| 2026-10-28 | No Docker anywhere: MySQL and Redis run locally / managed; tests use a local `kjt_foodie_test` DB; CI uses GitHub Actions `services`; production runs Node processes with PM2 | Project owner's decision |

## Contract questions for the frontend

Add: date, endpoint, what the handoff/contract says, what is unclear or wrong.

| Date | Endpoint | Question |
| --- | --- | --- |
| 2026-10-29 | `POST /auth/register` 409 | Contract gives no `error.code` for a duplicate phone/email. The backend sends `CONFLICT` (as the mock's default) with `fieldErrors.phone` / `fieldErrors.email`. Confirm, or name a code |
| 2026-10-29 | `POST /auth/login` 401 | The mock sends `INVALID_CREDENTIALS`, which the handoff error table does not list. Backend sends it; please add it to the handoff table |

## Session log

| Date | Phase | What was done |
| --- | --- | --- |
| 2026-10-28 | 1–2 | Initial setup and core plumbing committed (`setup`, `p2`). Frontend handoff received; build plan rewritten against it; this progress file created. |
| 2026-10-29 | 3 | Database foundation: model loader, ID helper, transaction + row-lock helpers (concurrency test proves only one of two racing updates wins), migration helpers, shared utils with unit tests (125 tests green). |
| 2026-10-29 | 1–2 | Finished phases 1 and 2: ESLint/Prettier, Jest + Supertest (66 tests green against `kjt_foodie_test`), CI workflow, README, full `.env.example`, seed placeholder + `truncateAllTables`; error codes/classes/messages aligned with the handoff, body-parser 400/413, `noContent`, CORS, `GET /api/v1/health`, Swagger on `docs/api/openapi.yaml` (`docs/openapi/` removed), Postman updated. |
