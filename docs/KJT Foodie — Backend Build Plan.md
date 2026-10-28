# KJT Foodie — Backend Build Plan

Oct 28, 2026 · @Lorem Backend

## 0. Where the documents live

Export each KJT Foodie document as Markdown and commit it to the backend repo's `docs/` folder, numbered in reading order. The OpenAPI contract's master copy lives here; the frontend repo keeps a copy.

```text
kjt-foodie-api/
├─ README.md                        # how to run; links to every file in docs/
├─ docs/
│  ├─ 01-brd.md                     # KJT Foodie — Business Requirements Document
│  ├─ 02-backend-architecture.md    # KJT Foodie — Backend Architecture
│  ├─ 03-database-schema.md         # KJT Foodie — Database Schema
│  ├─ 04-backend-build-plan.md      # this document
│  ├─ 05-implementation-plan.md     # KJT Foodie — Implementation Plan (both teams)
│  ├─ openapi/                      # API contract, one YAML per module + index (master)
│  └─ postman/                      # Postman collection + environments, updated every phase
└─ src/ ...
```

| Document | Backend repo | Frontend repo |
| --- | --- | --- |
| Business Requirements Document | `docs/01-brd.md` | `docs/01-brd.md` |
| Backend Architecture | `docs/02-backend-architecture.md` | — |
| Database Schema | `docs/03-database-schema.md` | — |
| Backend Build Plan | `docs/04-backend-build-plan.md` | — |
| Implementation Plan | `docs/05-implementation-plan.md` | `docs/04-implementation-plan.md` |
| Frontend Guidelines | — | `docs/02-frontend-guidelines.md` |
| Frontend Build Plan | — | `docs/03-frontend-build-plan.md` |
| API contract (OpenAPI) | `docs/openapi/` (master) | `docs/api/openapi.yaml` (copy) |

By the time backend work starts (week 15), the contract already holds every endpoint the frontend's mocks use; the backend's job is to make real responses match it.

## 1. Build order at a glance

The backend is built in 20 phases over weeks 15–32: plumbing first, then identity, then the things that exist before an order (vendors, plans, food), then the order itself, then what happens after it. Each phase builds on the tables and middleware of the ones before.

| # | Phase | Sprint (weeks) | Needs | Frontend switches off mocks |
| --- | --- | --- | --- | --- |
| 1 | Project setup | BE1 (15–16) | — |  |
| 2 | Core plumbing (app, errors, responses, logging) | BE1 | 1 |  |
| 3 | Database foundation (Sequelize, migrations) | BE1 | 1 |  |
| 4 | Reusable query layer (pagination, filters, sort) | BE1 | 2, 3 |  |
| 5 | Queues foundation (Redis, BullMQ, notifications) | BE1 | 2 |  |
| 6 | Authentication | BE1 | 3, 5 | Auth, profile |
| 7 | Roles, permissions and policies | BE1 | 6 | Admin users |
| 8 | Uploads and audit log | BE2 (17–18) | 7 |  |
| 9 | Settings and service areas | BE2 | 7, 8 | Admin settings |
| 10 | Vendor and rider onboarding (+ Paystack subaccounts) | BE2 | 8, 9 | Onboarding, approvals |
| 11 | Plans and subscriptions (+ webhook endpoint) | BE3 (19–20) | 10 | Plans, subscription |
| 12 | Catalogue | BE4 (21–22) | 11 | Menu, storefront |
| 13 | Social, reviews and moderation | BE4 | 12 | Feed, likes, comments |
| 14 | Orders, checkout and payments | BE5 (23–24) | 12 | Cart, checkout, orders |
| 15 | Real time (Socket.IO) | BE5 | 6, 14 | Live order queue |
| 16 | Dispatch, deliveries and GPS | BE6 (25–26) | 14, 15 | Rider app, tracking |
| 17 | Rider earnings and payouts | BE6 | 16 | Earnings, statements |
| 18 | Refunds | BE7 (27–28) | 14 | Refunds |
| 19 | Support, chat, notifications centre, reports | BE7 | 14, 16 | Support, reports, audit log |
| 20 | Hardening and deployment | Weeks 29–32 | all | All mocks removed |

Write each module's integration tests in the same phase as its endpoints.

### Postman documentation standard (every phase)

Every phase that adds or changes an endpoint must also add it to the KJT Foodie Postman collection, to the standard below. **A phase is not done until its endpoints are documented in Postman and the collection's tests pass.**

**Collection and files**

- One Postman team workspace "KJT Foodie" with one collection, **KJT Foodie API**, exported (Collection v2.1) to `docs/postman/kjt-foodie-api.postman_collection.json` and committed with each phase.
- Environments `local`, `staging`, `production` in `docs/postman/environments/`, committed with **empty secret values** (keys and tokens are filled in locally, never in Git).
- Variables: `baseUrl` (e.g. `{{host}}/api/v1`), `customerToken`, `vendorToken`, `riderToken`, `adminToken`, and IDs saved by tests (`vendorId`, `foodItemId`, `orderId`, `refundId`...).

**Structure**

- One folder per module in build order (Health, Auth, Me, Admin › Users, Uploads, Settings, Vendors, Riders, Plans & Subscriptions, Catalogue, Social, Checkout & Orders, Payments, Realtime, Deliveries, Rider Payouts, Refunds, Support, Notifications, Reports, Webhooks).
- Inside a module, subfolders by role where the endpoint differs (Customer, Vendor, Rider, Admin, Public).
- Auth is set once on the collection (Bearer `{{token}}`); each role folder overrides it with that role's token variable.

**Every request must have**

| Item | Standard |
| --- | --- |
| Name | Sentence case action: "Create food item", "Accept order" |
| URL | `{{baseUrl}}/...` with path variables (`:orderId`) described |
| Description (Markdown) | Purpose; who can call it (role or permission); path, query and body fields with type, required/optional and rules; side effects (jobs queued, notifications, socket events); related BRD requirement IDs |
| Body | A realistic example (Nigerian names, kobo amounts) |
| Saved examples | Success, plus each error that can happen: 422 validation, 401, 403, 404, 409 (where relevant) |
| List requests | Example `page`, `limit`, `sort`, `search` and filter params (disabled ones kept as documented options); example response shows `meta` |
| Tests tab | Status code, `success` envelope shape, key fields present; save new IDs/tokens to variables |

**Special cases**

- Webhooks: sample Paystack payloads for each handled event, with a pre-request script that computes `x-paystack-signature` from the test secret.
- Real time: a Socket.IO request in the Realtime folder listing every event name, direction and example payload.
- The collection must match the OpenAPI contract in `docs/openapi/`; if they disagree, fix the contract first.

**Automation**

- CI runs the collection with Newman against staging after each deploy: `newman run docs/postman/kjt-foodie-api.postman_collection.json -e docs/postman/environments/staging.postman_environment.json`.
- The README links to the published Postman documentation for the team and the frontend developers.

## 2. Foundation (phases 1–5, weeks 15–16)

No business features yet: these phases give every module the same app shell, error format, database access, list queries and job queues.

### Phase 1 — Project setup

- [ ] `kjt-foodie-api` repo, Node 20, ESM (`"type": "module"`), ESLint + Prettier + Husky
- [ ] Folder structure from Backend Architecture section 3
- [ ] `docker-compose.yml`: MySQL 8, Redis 7, Adminer; `npm run dev` with nodemon
- [ ] `config/env.js`: load and validate all variables with Zod; `.env.example`
- [ ] Jest + Supertest; GitHub Actions: lint, test, migrate on a fresh database
- [ ] Commit the documents into `docs/` (section 0)

**Postman:** create the "KJT Foodie" workspace, the empty **KJT Foodie API** collection with collection-level Bearer auth and variables, and the `local`, `staging` and `production` environments; commit them to `docs/postman/`; add the Newman step to CI.

**Done when:** `docker compose up` + `npm run dev` start cleanly; CI is green.

### Phase 2 — Core plumbing (`src/core`)

- [ ] `app.js` with the global middleware chain in order (requestId, helmet, cors, compression, raw body for webhooks, json, cookieParser, pino-http, rate limit)
- [ ] `core/errors/`: `AppError`, `ValidationError`, `NotFoundError`, `ForbiddenError`, `ConflictError`, codes from section 5 of the architecture doc
- [ ] `core/middlewares/errorHandler.js`, `notFound.js`, `validate.js` (Zod for body, query, params)
- [ ] `core/http/`: `asyncHandler`, `respond.ok`, `respond.created`, `respond.paginated`
- [ ] `server.js` with graceful shutdown; `GET /health` and `/health/ready`
- [ ] Swagger UI at `/docs` serving `docs/openapi/`

**Postman:** Health folder (`GET /health`, `GET /health/ready`); document the success and error envelopes and all error codes in the collection description so every later request can refer to them.

**Done when:** a test route returns the success envelope, and a thrown `ValidationError` returns the exact error envelope the frontend mocks use.

### Phase 3 — Database foundation (`src/db`)

- [ ] Sequelize instance (`underscored`, UTC, big number options), `.sequelizerc`, `sequelize-cli`
- [ ] UUID v7 default helper; model loader with `associate()`
- [ ] Migration and seeder naming rules (Database Schema section 9)
- [ ] Testcontainers setup so integration tests get a fresh MySQL

**Postman:** no endpoints in this phase; nothing to add.

**Done when:** `npm run db:migrate` and `db:migrate:undo:all` run cleanly on an empty database.

### Phase 4 — Reusable query layer (`core/query`)

- [ ] `buildListQuery(query, config, { scope })`: page/limit (max 100), sort whitelist, search, operators `eq`, `ne`, `in`, `like`, `range`, `dateRange`, `bool`, `isNull`, `geoRadius`, includes whitelist
- [ ] `paginate(rows, count, page, limit)` → `meta`; cursor helpers `encodeCursor` / `decodeCursor` for feeds
- [ ] Unit tests for every operator, the sort whitelist, the scope override and ignored unknown params

**Postman:** add a "List conventions" section to the collection description: `page`, `limit`, `sort`, `search`, cursor, and every filter operator with an example URL. Every list request later links to it.

**Done when:** tests prove a client cannot filter or sort on a column outside the config, or escape the role scope.

### Phase 5 — Queues foundation (`core/queue`)

- [ ] Redis connection (shared), queue factory with default job options, worker factory with graceful shutdown
- [ ] `worker.js` (separate process) and `scheduler.js` (registers repeatable jobs)
- [ ] `notifications` queue with `sms.send` (Termii), `email.send`, `inapp.create` processors; templates
- [ ] Bull Board mounted at `/admin/queues` (protected later in phase 7)
- [ ] `npm run worker` script; worker container in Docker Compose

**Postman:** no public endpoints; note the Bull Board URL and who may open it in the collection description.

**Done when:** adding an `sms.send` job from a test route delivers an SMS in the provider's sandbox, and a failing job retries with backoff.

## 3. Identity (phases 6–8, weeks 15–18)

Every later endpoint needs to know who is calling and what they may do, so authentication, roles and the audit log come before any business module.

### Phase 6 — Authentication (`modules/auth`, `modules/users`)

- [ ] Migrations + models: `users`, `addresses`, `refresh_tokens`, `otp_codes`
- [ ] Endpoints: `POST /auth/register` (customer, vendor, rider), `/auth/otp/send`, `/auth/otp/verify`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/auth/password/forgot`, `/auth/password/reset`, `GET/PATCH /me`, `/me/addresses` CRUD
- [ ] JWT access token (15 min) + rotating refresh token in httpOnly cookie, stored hashed, reuse detection
- [ ] `authenticate` middleware (rejects suspended/banned users); OTP and login rate limits
- [ ] OTP SMS sent through the `notifications` queue
- [ ] Integration tests for each endpoint, including token reuse and expired OTP

**Postman:** Auth folder (register as customer, vendor and rider; OTP send/verify; login; refresh; logout; logout everywhere; forgot/reset password) and Me folder (profile, addresses CRUD). Login tests save `customerToken`, `vendorToken`, `riderToken` and `adminToken`.

**Done when:** the frontend's auth, profile and address features run against the real API on staging. Delete their mock handlers.

### Phase 7 — Roles, permissions and policies

- [ ] Migrations + models: `roles`, `permissions`, `role_permissions`; `users.admin_role_id`
- [ ] Seeders: every permission key, the five admin sub-roles, the first super admin
- [ ] `authorize({ roles, permissions })` with permissions cached in Redis per role and `perm_version` check
- [ ] `loadResource` and `checkPolicy` middleware; policy file pattern (`*.policy.js`)
- [ ] Admin endpoints: `/admin/users` (create admin, change sub-role, suspend), `/admin/roles` (edit permissions)
- [ ] Protect Bull Board with super admin
- [ ] Tests: a matrix of role × endpoint expected status codes

**Postman:** Admin › Users and Admin › Roles folders; each request's description states its required permission, with a saved 403 example from a sub-role that lacks it.

**Done when:** each admin sub-role gets 403 on endpoints outside its permissions; the frontend admin users page runs on the real API.

### Phase 8 — Uploads and audit log (`integrations/cloudinary`, `core/audit`)

- [ ] `POST /uploads/sign`: signed Cloudinary parameters by upload type (food photo, document, avatar) with size/type limits
- [ ] `media` queue: `image.optimize`, `image.delete`
- [ ] `audit_logs` migration; `audit.log({ actor, action, entity, before, after, req })` helper
- [ ] `GET /admin/audit-logs` with filters (actor, action, entity, date range) via `buildListQuery`

**Postman:** Uploads folder (`POST /uploads/sign` for each upload type) and Admin › Audit logs (list with filter examples).

**Done when:** an upload from the frontend lands in Cloudinary through a signed request, and admin actions appear in the audit log page.

## 4. Business setup (phases 9–13, weeks 17–22)

Before anyone can order, there must be settings, approved vendors and riders, paid subscriptions and food on the menu.

### Phase 9 — Settings and service areas (`modules/settings`)

- [ ] Migrations: `settings`, `service_areas`, `notification_templates`; seed all keys from Database Schema section 8 and all Nigerian states
- [ ] `settingsService.get(key)` cached in Redis, invalidated on update; every change audited
- [ ] `GET/PATCH /admin/settings`, `/admin/service-areas`, `/admin/notification-templates`

**Postman:** Admin › Settings (list, update one key with an example for each seeded key), Service areas and Notification templates.

**Done when:** admin changes the rider payout % on the frontend and the new value is read by the service on the next call.

### Phase 10 — Vendor and rider onboarding (`modules/vendors`, `modules/riders`, `integrations/paystack`)

- [ ] Migrations: `vendors`, `vendor_staff`, `vendor_opening_hours`, `vendor_documents`, `required_documents`, `vendor_payout_accounts`, `riders`, `rider_documents`
- [ ] Paystack client: list banks, resolve account, create subaccount
- [ ] Vendor endpoints: onboarding steps, documents by vendor type, bank account, hours, staff, store settings, pause orders
- [ ] Rider endpoints: onboarding, documents, bank account
- [ ] Admin endpoints: approval queues, approve/reject with reason (creates Paystack subaccount on vendor approval), suspend
- [ ] Bank change: OTP + admin approval; old account kept as `replaced`
- [ ] Public: `GET /vendors`, `/vendors/:slug` (approved and visible only), geo filter with spatial index

**Postman:** Banks (list, resolve account), Vendors › Vendor (onboarding steps, documents, bank account, hours, staff, store settings), Riders › Rider (onboarding, documents, bank), Admin › Approvals (vendor and rider queues, approve, reject, suspend), Vendors › Public (list with near-me filter, storefront).

**Done when:** onboarding and approvals on the frontend run on the real API, and an approved test vendor has a Paystack test subaccount.

### Phase 11 — Plans and subscriptions (`modules/subscriptions`, `modules/payments/webhooks`)

- [ ] Migrations: `plans`, `plan_prices`, `subscriptions`, `subscription_invoices`, `subscription_events`; seed Basic, Pro, Premium
- [ ] Admin: create/edit plans and prices (creates Paystack plans), extend a subscription
- [ ] Vendor: start trial, subscribe/initialise payment, upgrade (prorated), downgrade at renewal, cancel at period end, invoices
- [ ] `POST /webhooks/paystack`: raw body, HMAC signature check, IP allow-list, store in `payment_events` (dedupe), respond 200, enqueue `payments:webhook.process`
- [ ] Handle `subscription.create`, `charge.success` (renewal), `invoice.payment_failed`, `subscription.not_renew`, `subscription.disable`
- [ ] `subscriptions` queue + scheduler: reminders (7 days, 1 day), grace start, grace expiry → `vendors.is_visible = false`
- [ ] `requireActiveSubscription` middleware on vendor selling endpoints; plan limits enforced (items, photos, staff)

**Postman:** Plans & Subscriptions (public plans; vendor trial, subscribe, upgrade, downgrade, cancel, invoices; admin plans and prices, extend) and Webhooks › Paystack with signed sample bodies for every subscription event.

**Done when:** in Paystack test mode a vendor can trial, subscribe, fail a renewal, enter grace and be hidden, then renew and reappear.

### Phase 12 — Catalogue (`modules/catalogue`)

- [ ] Migrations: `categories`, `food_items`, `food_item_photos`, `food_item_option_groups`, `food_item_options`, `food_item_availability`; seed categories
- [ ] Vendor CRUD for items, photos, options and availability; sold-out toggle
- [ ] Public: food items list with `buildListQuery` (category, price range, vendor, near me, available now), FULLTEXT search, item detail
- [ ] Admin: hide/unhide item with reason

**Postman:** Catalogue (categories; vendor food item CRUD, photos, option groups, availability, sold-out; public list with every filter, search and detail; admin hide/unhide). Include the 402/403 example when a plan limit is reached.

**Done when:** the frontend's menu management, storefront and search run on the real API.

### Phase 13 — Social, reviews and moderation (`modules/social`, `modules/reviews`)

- [ ] Migrations: `likes`, `comments`, `follows`, `reports`, `reviews`
- [ ] Feed endpoint with cursor pagination (followed vendors first, then nearby popular)
- [ ] Like/unlike, comment/reply/edit/delete, follow/unfollow, report; counters updated in the same transaction
- [ ] Admin moderation queue: hide/remove comments and items, dismiss reports
- [ ] Reviews endpoint (enabled once orders exist in phase 14; table and validation ready now)
- [ ] `notifications` jobs: new follower post, comment reply

**Postman:** Social (feed with cursor example, like/unlike, comments and replies, follow/unfollow, report), Reviews, and Admin › Moderation.

**Done when:** the frontend's feed, likes, comments, follows and moderation run on the real API.

## 5. Transactions (phases 14–17, weeks 23–26)

The heart of the product: a paid order moves from vendor to rider to customer in real time, and each delivery earns the rider money.

### Phase 14 — Orders, checkout and payments (`modules/orders`, `modules/payments`)

- [ ] Migrations: `orders`, `order_items`, `order_status_history`, `payments`
- [ ] `POST /checkout/quote`: server-side prices, options, delivery fee (base + per km from settings, distance from Google Distance Matrix or haversine fallback), processing fee, total
- [ ] `POST /orders`: re-quote, create `pending_payment` order, Paystack `transaction/initialize` with vendor `subaccount`, `transaction_charge` = delivery + processing fee, `bearer: account`
- [ ] Webhook `charge.success` → verify transaction → order `paid` → notify vendor → schedule `order.autoReject` delayed job
- [ ] Order state machine (`orders.service.transition()`): allowed transitions only, history row and audit on each change, inside a transaction with row lock
- [ ] Vendor actions: accept (removes auto-reject job), reject, preparing, ready; customer cancel before acceptance
- [ ] Delivery-fee refund on vendor rejection via Paystack `/refund` (partial)
- [ ] Lists: `/me/orders`, `/vendor/orders`, `/admin/orders` sharing one service with role scopes
- [ ] `payments` queue: `webhook.process`, `transaction.verify`; settlement status from Paystack settlements
- [ ] Enable reviews (phase 13 table) for delivered orders

**Postman:** Checkout & Orders (quote, create order, customer/vendor/admin lists, detail, accept, reject, preparing, ready, cancel), Payments (initialize, verify, list), and Webhooks › Paystack `charge.success` and `refund.processed` samples. Tests save `orderId` so the next requests run in sequence.

**Done when:** a test-mode order is paid, split correctly (vendor share in the subaccount, fees to KJT Foodie), accepted and marked ready; auto-reject fires when the vendor does nothing.

### Phase 15 — Real time (`core/socket`)

- [ ] Socket.IO server on the same HTTP server, Redis adapter, JWT auth on connect
- [ ] Rooms: `user:`, `vendor:`, `order:`, `rider:`, `admin:live-map` with join checks
- [ ] Order service emits `order:new` and `order:status` after each committed transition
- [ ] `GET /orders/:id/tracking` REST fallback

**Postman:** Realtime folder with a Socket.IO request: connect with a token, join rules per room, and every event (`order:new`, `order:status`) with direction and example payload; plus `GET /orders/:id/tracking`.

**Done when:** the vendor live order queue and customer order status update instantly on the frontend without refresh.

### Phase 16 — Dispatch, deliveries and GPS (`modules/deliveries`, `modules/tracking`)

- [ ] Migrations: `deliveries`, `delivery_offers`, `delivery_locations`, `chat_messages`
- [ ] Rider online/offline; `rider:location` handler: validate, `GEOADD riders:online`, emit to order room and admin map (throttled), sample to `delivery_locations` every 30 s
- [ ] On order `ready`: `dispatch` queue `order.offerToRider` → nearest online rider (Redis `GEOSEARCH`) → `job:offer` → `offer.timeout` 30 s → next rider; alert Dispatch after N failures
- [ ] Rider endpoints: accept/decline offer, arrived at vendor, picked up, confirm delivery with 4-digit code (hashed compare)
- [ ] Admin: manual assign/reassign, live map data
- [ ] ETA: straight-line every update, Distance Matrix at most once a minute
- [ ] Customer–rider chat over socket + `chat_messages`

**Postman:** Deliveries (rider online/offline, accept/decline offer, arrived, picked up, confirm with code; admin assign/reassign, live map) and Realtime additions (`rider:location`, `job:offer`, chat events with example payloads).

**Done when:** on staging, a ready order is offered to a test rider's phone, accepted, tracked live on the customer map and completed with the code.

### Phase 17 — Rider earnings and payouts (`modules/riders/payouts`)

- [ ] Migrations: `rider_earnings`, `rider_payout_statements`
- [ ] On delivery completion: insert earning = delivery fee × payout % (copied from settings or rider override)
- [ ] Scheduler: 1st of month 01:00 → `payouts:rider.monthlyStatement` per rider (idempotent, unique per rider + month)
- [ ] Admin (Finance): list statements, approve, mark paid with bank reference; void an earning with reason
- [ ] Rider: `/rider/earnings` (this month), `/rider/statements`

**Postman:** Rider Payouts (rider earnings this month, statements; admin list, approve, mark paid, void an earning).

**Done when:** running the statement job for a test month produces correct totals, and a second run creates no duplicates.

## 6. After the sale (phases 18–19, weeks 27–28)

With orders flowing, the last modules handle what goes wrong (refunds, support) and what the business needs to see (notifications, reports, reconciliation).

### Phase 18 — Refunds (`modules/refunds`)

- [ ] Migrations: `refunds`, `refund_attachments`, `refund_events`
- [ ] Customer: request refund (reason, amount, photos) on a delivered or failed order; confirm receipt or dispute
- [ ] Vendor: accept (full/partial), reject with reason, mark paid with method and reference
- [ ] Delayed job `refund.deadline` at `respond_by` (hours from settings) → applies the admin-configured action (escalate, warn or suspend)
- [ ] Admin: list with filters, full timeline, comment, escalate; vendor `refund_rate` recalculated
- [ ] Every step writes a `refund_events` row and an audit entry

**Postman:** Refunds folder with Customer (request, confirm, dispute), Vendor (accept, partial, reject, mark paid) and Admin (list, timeline, comment, escalate) subfolders, run in order so one refund goes through its whole life.

**Done when:** the full refund journey on the frontend runs on the real API, including a missed deadline triggering the configured action.

### Phase 19 — Support, notifications centre and reports (`modules/support`, `notifications`, `reports`)

- [ ] Migrations: `support_tickets`, `support_messages`, `notifications`, `notification_preferences`, `push_subscriptions`
- [ ] Support tickets linked to orders; admin inbox with assignment, replies, internal notes
- [ ] Notifications centre: list, unread count, mark read; preferences; web push via FCM
- [ ] Wire all notification triggers (order status, subscription reminders, refund updates, payout statements) through templates
- [ ] `reports` queue: `stats.daily` pre-computes dashboard numbers; admin and vendor overview endpoints read them
- [ ] CSV exports as background jobs (`export.csv`) with a download link when ready
- [ ] Scheduled `payments.reconcile` (daily) and `tracking.archiveGps`, `auth.purgeTokens` maintenance jobs

**Postman:** Support (tickets, messages, admin inbox), Notifications (list, unread count, mark read, preferences, push subscribe), Reports (admin and vendor overviews) and Exports (request CSV, check status, download).

**Done when:** every frontend mock handler has been deleted and the whole app runs on the real API (**gate: all mocks removed**).

## 7. Hardening and deployment (phase 20, weeks 29–32)

The final phase proves the system is safe to put real money through, then ships it.

### Phase 20 — Hardening and deployment

**Quality**

- [ ] Coverage: 80%+ on services; every endpoint has an integration test for success, validation error, 401, 403 and wrong-owner cases
- [ ] Contract check: responses validated against `docs/openapi/` in CI
- [ ] Load test (k6): 2,000 orders/day pattern, lunch peak at 5×, 200 riders sending GPS every 5 s; fix slow queries (add indexes, check `EXPLAIN`)

**Security**

- [ ] OWASP Top 10 review; `npm audit`; secrets scan
- [ ] Role × permission × endpoint matrix re-run against staging
- [ ] Webhook signature and IP checks verified with forged requests
- [ ] Rate limits tuned; PII exposure checked per role (riders see masked customer phone)

**Payments**

- [ ] Full Paystack test-mode run: split order, rejection with delivery-fee refund, subscription trial → paid → failed → grace → expired → renewed
- [ ] Reconciliation job compared with the Paystack dashboard for a test week
- [ ] Switch to live keys on production; one small real transaction end to end

**Operations**

- [ ] Production: managed MySQL (daily backups, point-in-time recovery), managed Redis with AOF, 2+ API instances behind a load balancer with sticky sessions, 1+ worker instance
- [ ] CI/CD: build Docker image → run migrations → rolling deploy; staging deploys on merge to `main`, production on tagged release
- [ ] Sentry, log shipping, uptime checks, alerts (error rate, failed jobs, queue backlog, webhook failures, reconciliation mismatches)
- [ ] Backup restore tested once on staging
- [ ] Seed production: roles, permissions, super admin, plans, categories, settings, service areas, templates (no demo data)
- [ ] Runbook in `docs/`: deploy, roll back, rotate keys, replay a failed webhook, re-run a payout statement

**Postman:** final review: every endpoint is in the collection with description, examples and tests; the full Newman run passes against staging; the collection matches the OpenAPI contract; publish the documentation link in the README and commit the final export to `docs/postman/`.

**Done when:** **UAT sign-off** on staging and production health checks are green. The pilot and launch (weeks 33–36) follow the Implementation Plan.
