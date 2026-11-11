# KJT Foodie — Backend Build Plan

Oct 28, 2026 · Backend · v2 (rewritten against the frontend handoff)

This plan builds the Express backend the finished frontend expects. It is organised in phases; each
phase lists the endpoints, rules, jobs, seed data and tests it delivers, and when it counts as done.

**Progress is tracked in a separate file: [`docs/BACKEND-PROGRESS.md`](BACKEND-PROGRESS.md).**
This file says *what* to build and *how*; the progress file says *what is done and what is left*.
Update the progress file at the end of every working session.

## 0. Sources of truth

| Question | Where the answer is | Wins over |
| --- | --- | --- |
| Request / response shapes, field names, status codes | `docs/api/openapi.yaml` (from the frontend) | everything else |
| Conventions, filters, events, rules, seeder | `docs/05-backend-handoff.md` | this plan |
| Business rules (BR-*, FR-*) | `docs/Food Marketplace App — Business Requirements Document.md` | — |
| Folder layout, middleware chain, queues | `docs/KJT Foodie — Backend Architecture.md` | — |
| Tables and columns | `docs/KJT Foodie — Database Schema.md` (adapt where the contract needs other fields) | — |
| Seed photos | `docs/backend/seed-images.json` | — |
| Phase order, scope, done criteria | this file | — |
| What is done / left | `docs/BACKEND-PROGRESS.md` | — |

Rules:

- If the handoff and `openapi.yaml` disagree, `openapi.yaml` wins; note it in the progress file's
  "Contract questions" list for the frontend team.
- If the older Architecture / Schema documents disagree with the handoff (endpoint names, upload flow,
  order creation), the handoff wins. The older docs are kept for structure and reasoning only.
- `docs/api/openapi.yaml` becomes the **master contract** and Swagger serves it. The old split
  `docs/openapi/*.yaml` files are retired in phase 2 (keep `health.yaml` content merged in).

## 1. Fixed technical choices

| Area | Choice |
| --- | --- |
| Runtime | Node 20+, ESM, Express 4. No Docker: MySQL and Redis run locally (installed on the machine) or as managed services |
| Database | MySQL 8 via Sequelize 6 + `sequelize-cli` migrations |
| Cache, queues, rate limits | Redis 7, BullMQ (separate `worker.js` process + `scheduler.js`) |
| Real time | Socket.IO 4 on the same HTTP server (port 4000), Redis adapter |
| Validation | Zod (`validate({ body, query, params })`) |
| Files | `POST /uploads` multipart → Cloudinary; documents private (signed, short-lived URLs) |
| Payments | Paystack (transactions with split, subaccounts, banks, resolve, webhooks) |
| SMS / email | Termii (SMS) and an email provider, both via the `notifications` queue; demo OTP `123456` outside production |
| Maps | Haversine distance; Google Distance Matrix optional for ETA |
| Tests | Jest + Supertest against a separate local test database (`kjt_foodie_test`) and local Redis |
| Logging | pino / pino-http |
| IDs | String primary keys `VARCHAR(64)` so the seeder can keep demo IDs (`usr_customer_ada`, `ven_mama_put`); generated IDs are UUID v7 |
| Money | Integer kobo, `BIGINT` / `INT UNSIGNED` columns; never floats |
| Time | Stored UTC; "Lagos day" buckets computed with UTC+1 |

## 2. Cross-cutting rules (apply in every phase)

These come from `05-backend-handoff.md` sections 2, 3 and 6. Every endpoint must follow them.

1. **Base path** `/api/v1`; kebab-case plural paths; actions are `POST /{resource}/{id}/{verb}`.
2. **Envelopes**: `{ success, data }`, lists add `meta { page, limit, total, totalPages, hasNextPage, hasPrevPage }`,
   cursor lists `meta { nextCursor, limit, total }`. Extra `meta` keys (`summary`, `limits`, `trialDays`) sit beside the standard ones.
3. **Errors**: `{ success: false, error: { code, message, fieldErrors? } }`. Codes: `BAD_REQUEST` 400,
   `UNAUTHENTICATED` 401, `FORBIDDEN` / `ACCOUNT_BANNED` / `ACCOUNT_SUSPENDED` 403, `NOT_FOUND` 404,
   409 `ALREADY_SUBMITTED` `NOT_APPROVED` `TRIAL_USED` `SAME_PLAN` `DOWNGRADE_AT_RENEWAL` `PAYMENT_REQUIRED`
   `PLAN_LIMIT` `INVALID_STATUS` `OFFER_GONE` `CANNOT_CANCEL`, `PAYLOAD_TOO_LARGE` 413, `VALIDATION_ERROR` 422
   (plus quote codes `VENDOR_PAUSED` `VENDOR_CLOSED` `OUT_OF_RANGE` `ITEM_UNAVAILABLE` `EMPTY_CART`),
   `RATE_LIMITED` 429, `INTERNAL_ERROR` 500.
4. **`message` is shown to users as-is**: friendly, plain English, says what to do next, no codes.
   `fieldErrors` keys are request field paths with dots (`address.line1`, `optionGroups.0.options.1.name`).
5. **Not yours = 404**, never 403, for scoped resources (never leak existence).
6. **Lists** use the shared query layer: `page` (clamped), `limit` (default 20, max 100), `sort`
   (`-field`, comma list, whitelisted), `search` (contains over listed fields), field filters (comma = any of),
   `from` / `to` (inclusive, `YYYY-MM-DD` = whole Lagos day), `cursor`. Unknown / empty params ignored.
   Each list's search fields, filters, date field and default sort are in handoff section 3.
7. **Formats**: kobo money, ISO UTC dates, E.164 phones (accept `0803…`, `234803…`, `+234 803 …`),
   6-char order code, 4-digit delivery code (customer + admin only), `distanceM` in metres, absolute https image URLs.
8. **Admin permissions** are checked on the server on every admin route (`x-permission` in the contract).
9. **Audit log** entry for every admin decision and money event (action names in handoff section 6).
10. **Notifications**: create in-app notifications for every event the handoff names.
11. **Seed as you go**: every phase adds its slice of the deterministic demo seeder (section 8 of the handoff),
    so the frontend can test that phase against real data.
12. **Tests**: every endpoint gets integration tests for success, validation, 401, 403/404 (wrong role / not owner)
    and its 409 cases, in the same phase.
13. **Docs**: every phase updates Postman (`docs/postman/`) for its endpoints and the progress file.

### Definition of done for a phase

- [ ] Every endpoint listed in the phase matches `docs/api/openapi.yaml` (shapes, status codes, error codes)
- [ ] Integration tests pass; lint passes
- [ ] Seed data for the phase exists and `npm run seed` is still deterministic
- [ ] Postman collection updated
- [ ] The frontend screens for that phase work with `VITE_USE_MOCKS=false`
- [ ] `docs/BACKEND-PROGRESS.md` updated (ticks, notes, deviations, next step)

## 3. Phase overview

162 operations in total (handoff section 4). Counts below add up to all of them.

| # | Phase | Endpoints | Needs | Frontend can drop mocks for |
| --- | --- | --- | --- | --- |
| 1 | Project setup and tooling | — | — | — |
| 2 | Core plumbing aligned to the handoff | 1 | 1 | `/health` |
| 3 | Database foundation and shared helpers | — | 1 | — |
| 4 | List query layer | — | 2, 3 | — |
| 5 | Redis, queues, notifications | 4 | 3 | Notification bell |
| 6 | Authentication, profile, addresses | 17 | 3–5 | Login, sign-up, profile, addresses |
| 7 | Admin roles, permissions, admin users | 6 | 6 | Admin users and roles |
| 8 | Uploads and audit log | 2 | 7 | Upload widgets, audit log page |
| 9 | Settings, banks, reference data, seeder core | 4 | 7, 8 | Admin settings, bank pickers |
| 10 | Vendor onboarding and admin vendor review | 12 | 9 | Vendor wizard, vendor approvals |
| 11 | Rider onboarding and admin rider review | 12 | 9 | Rider wizard, rider approvals |
| 12 | Plans, subscriptions, Paystack webhook | 14 | 10 | Plans, billing, admin plans/subscriptions |
| 13 | Catalogue, vendor menu, store, staff | 16 | 12 | Search, storefront, menu, store settings |
| 14 | Social, feed and moderation | 16 | 13 | Feed, likes, comments, follows, moderation |
| 15 | Checkout, payments, orders, vendor sales | 18 | 13 | Cart, checkout, order list, vendor orders, payments |
| 16 | Real time (Socket.IO) | — | 6, 15 | Live order status, vendor new-order sound |
| 17 | Dispatch, deliveries, GPS, live map, chat | 11 (+1 extended) | 16 | Rider app, tracking, live map, chat |
| 18 | Reviews, rider trips, earnings, payouts | 9 | 17 | Ratings, rider earnings, admin payouts |
| 19 | Refunds | 9 | 15 | Refund flows (all roles) |
| 20 | Support tickets and admin inbox | 10 | 15 | Help centre, admin inbox |
| 21 | Admin overview and the full demo world | 1 | all | Admin dashboard; mocks fully removed |
| 22 | Hardening and deployment | — | all | — |

Endpoint count check: 1 + 4 + 17 + 6 + 2 + 4 + 12 + 12 + 14 + 16 + 16 + 18 + 11 + 9 + 9 + 10 + 1 = **162**.
`GET /admin/riders` is built in phase 11 and only extended (`nearOrderId`) in phase 17.
`POST /webhooks/paystack` (phase 12) is extra: it is not in the frontend contract.

---

## 4. Foundation (phases 1–5)

### Phase 1 — Project setup and tooling

- `package.json` scripts: `dev`, `start`, `worker`, `scheduler`, `test`, `lint`, `format`,
  `db:migrate`, `db:migrate:undo:all`, `seed` (wipe + seed, deterministic)
- ESLint + Prettier (+ optional Husky pre-commit)
- Local MySQL 8 and Redis 7 installed on the machine (no Docker); README lists install and DB/user creation steps
- Jest + Supertest, a local test database (`kjt_foodie_test`, migrated by the test setup), a helper to reset the DB between test files
- GitHub Actions: install, lint, migrate on a fresh database (MySQL and Redis as Actions `services`), test
- `.env.example` complete (DB, Redis, JWT secrets, cookie settings, Cloudinary, Paystack, Termii, email, Google)
- `README.md`: how to run, how to seed, links to every doc

**Done when:** with local MySQL and Redis running, `npm run db:migrate && npm run dev` starts clean; `npm test` and CI are green.

### Phase 2 — Core plumbing aligned to the handoff

Most of this exists; this phase fixes it to match the handoff exactly.

- Error codes: rename `INTERNAL` → `INTERNAL_ERROR`; add `BAD_REQUEST`, `PAYLOAD_TOO_LARGE`,
  `ACCOUNT_BANNED`, `ACCOUNT_SUSPENDED`; add every 409 code and the 422 quote codes; drop codes the
  contract does not use (`SUBSCRIPTION_INACTIVE`, generic `CONFLICT`, 402s) or map them to contract codes
- Error classes take a `code` so services can throw `new ConflictError('TRIAL_USED', 'You have already used your free trial.')`
- Body parser errors: malformed JSON → 400 `BAD_REQUEST`; too large → 413 `PAYLOAD_TOO_LARGE`
- Friendly default messages (unique constraint, not found, unauthenticated) per Frontend Guidelines tone
- `GET /api/v1/health` (contract path); keep `/health` and `/health/ready` for load balancers
- CORS: origins `5173`, `5174`, `4173` (from `CORS_ORIGINS`), `credentials: true`,
  methods `GET, POST, PATCH, DELETE`, headers `Authorization, Content-Type`
- Swagger UI at `/docs` serves `docs/api/openapi.yaml`; retire `docs/openapi/`
- `respond.noContent(res)` for `DELETE` → 204

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/health` | Public |

**Done when:** tests prove each error code returns the exact envelope; the frontend gets CORS-clean responses from `:5173`.

### Phase 3 — Database foundation and shared helpers

- Sequelize: `underscored`, UTC, model loader with `associate()`, `timestamps` + `paranoid` where deletes must keep history
- ID helper (UUID v7 string, accepts fixed IDs from the seeder)
- Shared utils (unit tested): `money` (kobo), `phone.normalise()` → E.164, `slugify` + unique slug,
  `lagosDay(date)` → `YYYY-MM-DD`, `haversineM(a, b)`, `orderCode()` (6 chars), `deliveryCode()` (4 digits),
  seeded RNG wrapper (`seed 2026`, Faker `en_NG`) for the seeder
- Transaction helper (`withTransaction`) and row-lock pattern for state machines

**Done when:** migrate / undo-all run clean on an empty DB; util tests pass.

### Phase 4 — List query layer (`core/query`)

- `buildListQuery(req.query, config, { scope })` where `config` = `{ searchFields, filters, dateField, defaultSort, sortable, includes }`
- Filters: exact, comma = any of, booleans (`true|false`), ranges (`minPrice`/`maxPrice`, `minRating`),
  prefix match (`action` on audit log), custom (geo `maxDistanceKm` with `lat`/`lng`)
- `from` / `to` inclusive on the date field, `YYYY-MM-DD` = whole Lagos day
- `page` clamped to the last page; `limit` default 20, max 100
- `paginate()` → standard `meta`; cursor helpers for feed and comments (`meta.nextCursor`, `limit`, `total`)
- `scope` always wins over client filters (customer can't pass another `customerId`)

**Done when:** unit tests cover every operator, clamp, max limit, ignored unknown/empty params, sort whitelist and scope override.

### Phase 5 — Redis, queues, notifications

- Redis connection; rate limiter moves to the Redis store; auth/OTP limits (5/min)
- BullMQ queue + worker factories, `worker.js`, `scheduler.js`, graceful shutdown; Bull Board (super admin only, after phase 7)
- `notifications` queue: `sms.send` (Termii; logged only outside production), `email.send`, `inapp.create`
- `notifications` table + `notify(userId, { type, title, body, link, data })` helper used by every later phase
- `/health/ready` checks Redis too

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/notifications` | Signed in |
| `GET` | `/notifications/unread-count` | Signed in |
| `POST` | `/notifications/{id}/read` | Signed in |
| `POST` | `/notifications/read-all` | Signed in |

List: filters `type`, `unread=true`; default sort `-createdAt`. (Needs auth from phase 6 to test end to end; build the service now, mount the routes in phase 6.)

**Done when:** a test job sends an SMS in sandbox / log mode; a failing job retries with backoff; the bell count works once auth exists.

---

## 5. Identity (phases 6–8)

### Phase 6 — Authentication, profile, addresses

Tables: `users`, `refresh_tokens` (hashed, rotated, family id for reuse detection), `otp_codes`, `addresses`.

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | Public | customer / vendor / rider only. Vendor and rider get an empty profile with `approvalStatus: draft` |
| `POST` | `/auth/login` | Public | email + password → `{ accessToken, user }` + refresh cookie |
| `POST` | `/auth/otp/request` | Public | SMS OTP; rate limited; `123456` outside production |
| `POST` | `/auth/otp/verify` | Public | starts a session |
| `POST` | `/auth/google` | Public | Google ID token; sign in or sign up as customer |
| `POST` | `/auth/refresh` | Public | rotates `kjt_refresh` cookie; 401 = signed out |
| `POST` | `/auth/logout` | Signed in | revokes token, clears cookie |
| `POST` | `/auth/password/forgot` | Public | reset code to phone or email |
| `POST` | `/auth/password/reset` | Public | code + new password |
| `GET` | `/me` | Signed in | fresh `permissions`, `vendor {…}`, `rider {…}` |
| `PATCH` | `/me` | Signed in | edit profile |
| `POST` | `/me/phone/otp` | Signed in | code to a new phone number (not saved yet) |
| `POST` | `/me/phone/verify` | Signed in | check the code, save the number as verified |
| `DELETE` | `/me` | Customer | anonymise personal data, keep orders |
| `GET` | `/addresses` | Customer | default first |
| `POST` | `/addresses` | Customer | first one becomes default |
| `PATCH` | `/addresses/{id}` | Customer | |
| `DELETE` | `/addresses/{id}` | Customer | promote another to default |
| `POST` | `/addresses/{id}/default` | Customer | |

Rules: access JWT ~15 min in `Authorization: Bearer`; refresh cookie `kjt_refresh`, `Path=/api/v1/auth`,
`SameSite=Lax`, `Secure` outside localhost, 30 days, rotated each refresh. Banned / suspended →
403 `ACCOUNT_BANNED` / `ACCOUNT_SUSPENDED` at login and refresh. Middleware: `authenticate`, `requireRole(...)`.
Also mount the phase 5 notification routes.

Seed: the 11 demo accounts (handoff 8.2) with password `password123`, Ada's two addresses, ~70 customers with one address each, some suspended / banned.

**Done when:** frontend login (password, OTP, Google), refresh on reload, profile, addresses and logout work without mocks.

### Phase 7 — Admin roles, permissions, admin users

Tables: `admin_roles` (5 sub-roles), `permissions`, `admin_role_permissions`; `users.admin_role`.

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/admin/users` | `admin_users.manage` |
| `POST` | `/admin/users` | `admin_users.manage` (sends set-password email) |
| `PATCH` | `/admin/users/{id}` | `admin_users.manage` (role, suspend / restore; not yourself) |
| `GET` | `/admin/roles` | `admin_users.manage` |
| `PATCH` | `/admin/roles/{id}` | `admin_users.manage` (super_admin locked; `dashboard.view` required) |
| `POST` | `/admin/roles/{id}/reset` | `admin_users.manage` |

- `requirePermission('x.y')` middleware; permissions cached per role in Redis, invalidated on change
- Default permission sets exactly as handoff section 2 table
- Role × permission × endpoint test matrix (grows each phase)

**Done when:** each sub-role gets 403 outside its permissions; the admin users and roles pages work without mocks.

### Phase 8 — Uploads and audit log

| Method | Path | Who |
| --- | --- | --- |
| `POST` | `/uploads` | Signed in; `purpose` decides allowed role and file types |
| `GET` | `/admin/audit-log` | `audit_log.view` |

- Multipart `file` + `purpose`; JPG / PNG / WebP (+ PDF for documents); max 8 MB → 413
- Food photos stored as WebP, ≤1600 px wide, <2 MB; documents private (signed short-lived URL, owner + admins)
- `audit.log({ actor, action, targetType, targetId, summary, req })` writing
  `{ actorId, actorName, actorRole, action, targetType, targetId, summary, ip, createdAt }`
- Audit list: search summary / actor / action / target id; filters `actorRole`, `targetType`, `action` (prefix)

Back-fill audit calls into phase 7 actions (`role.updated|reset`, `admin_user.created|updated`).

**Done when:** a frontend upload returns a Cloudinary URL; admin actions appear on the audit log page.

---

## 6. Business setup (phases 9–14)

### Phase 9 — Settings, banks, reference data, seeder core

Tables: `settings` (single row / key-value), `service_areas`, `notification_templates`, `required_documents`, `banks` (cache).

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/admin/settings` | `settings.manage` |
| `PATCH` | `/admin/settings` | `settings.manage` (audited `settings.updated`) |
| `GET` | `/banks` | Public (Paystack list in production; seeded list locally) |
| `POST` | `/banks/resolve` | Signed in (locally: user's name in capitals; numbers ending `0000` → not found) |

- `settings.get()` cached in Redis, invalidated on update
- Paystack client: list banks, resolve account, create subaccount (used in phase 10)
- Seeder core: `npm run seed` wipes and seeds in order; settings values (handoff 8.3), service areas,
  templates, banks, required documents per vendor type / rider, the 6 cities with areas and centres

**Done when:** admin changes rider payout % in the UI and the next read uses it; bank pickers work.

### Phase 10 — Vendor onboarding and admin vendor review

Tables: `vendors`, `vendor_documents`, `vendor_opening_hours`, `vendor_bank_accounts`, `bank_change_requests`.

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/vendor/onboarding` | Vendor |
| `PATCH` | `/vendor/onboarding` | Vendor (one step; `onboardingStep` only moves forward) |
| `POST` | `/vendor/onboarding/submit` | Vendor (`ALREADY_SUBMITTED`; needs required docs, pin, resolved bank) |
| `POST` | `/vendor/documents` | Vendor (one per type, replaces) |
| `DELETE` | `/vendor/documents/{id}` | Vendor (before submitting) |
| `GET` | `/admin/vendors` | `vendors.view` (not drafts; filters `approvalStatus`, `subscriptionStatus`, `type`, `city`) |
| `GET` | `/admin/vendors/{id}` | `vendors.view` (docs, full bank, plan, 30-day numbers) |
| `POST` | `/admin/vendors/{id}/approve` | `vendors.approve` (creates Paystack subaccount; notify owner) |
| `POST` | `/admin/vendors/{id}/reject` | `vendors.approve` (reason the owner sees) |
| `POST` | `/admin/vendors/{id}/suspend` | `vendors.approve` |
| `POST` | `/admin/vendors/{id}/reinstate` | `vendors.approve` |
| `POST` | `/admin/vendors/{id}/bank-change/{decision}` | `vendors.approve` (approve / reject) |

Rules: editing only while `draft` or `rejected`; slug unique from store name; `/me` returns the
`vendor` block fresh. Audit `vendor.approve|reject|suspend|reinstate`.
(`POST /vendor/bank-change` lives in phase 13 with store settings.)

Seed: Mama Put, Chidi Grills, Tolu's Pot exactly as handoff 8.2; 45 more vendors (6 pending, 1 rejected,
1 suspended, rest approved), documents using the paperwork photo labelled SAMPLE.

**Done when:** a new vendor completes the wizard and an onboarding admin approves it in the UI.

### Phase 11 — Rider onboarding and admin rider review

Tables: `riders`, `rider_documents`, `rider_bank_accounts`, guarantor fields.

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/rider/onboarding` | Rider |
| `PATCH` | `/rider/onboarding` | Rider |
| `POST` | `/rider/onboarding/submit` | Rider |
| `POST` | `/rider/documents` | Rider |
| `DELETE` | `/rider/documents/{id}` | Rider |
| `GET` | `/rider/me` | Rider (bank last 4 only) |
| `GET` | `/admin/riders` | `riders.view` (filters incl. `online`; `nearOrderId` added in phase 17) |
| `GET` | `/admin/riders/{id}` | `riders.view` |
| `POST` | `/admin/riders/{id}/approve` | `riders.approve` |
| `POST` | `/admin/riders/{id}/reject` | `riders.approve` |
| `POST` | `/admin/riders/{id}/suspend` | `riders.approve` |
| `POST` | `/admin/riders/{id}/reinstate` | `riders.approve` |

Seed: Tunde, Kemi + 34 riders (4 pending, 1 suspended; vehicle mix; 45% of approved online), guarantor, docs, bank.

**Done when:** the rider wizard and rider approvals work without mocks.

### Phase 12 — Plans, subscriptions, Paystack webhook

Tables: `plans`, `subscriptions`, `subscription_invoices`, `payments` (type `subscription`), `payment_events` (webhook dedupe).

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/plans` | Public (cheapest first; `meta.trialDays`) |
| `GET` | `/vendor/subscription` | Vendor |
| `GET` | `/vendor/subscription/invoices` | Vendor |
| `POST` | `/vendor/subscription/trial` | Vendor (`NOT_APPROVED`, `TRIAL_USED`) |
| `POST` | `/vendor/subscription/initialize` | Vendor (first plan, renewal, prorated upgrade; `SAME_PLAN`, `DOWNGRADE_AT_RENEWAL`) |
| `POST` | `/vendor/subscription/verify` | Vendor (idempotent) |
| `POST` | `/vendor/subscription/change` | Vendor (schedule downgrade) |
| `POST` | `/vendor/subscription/cancel` | Vendor (at period end) |
| `POST` | `/vendor/subscription/resume` | Vendor |
| `GET` | `/admin/plans` | `subscriptions.view` (incl. retired, vendor counts) |
| `POST` | `/admin/plans` | `subscriptions.manage` |
| `PATCH` | `/admin/plans/{id}` | `subscriptions.manage` |
| `GET` | `/admin/subscriptions` | `subscriptions.view` |
| `POST` | `/admin/subscriptions/{id}/extend` | `subscriptions.manage` |

Plus `POST /webhooks/paystack` (not in the contract's 162; raw body, HMAC check, dedupe, 200, enqueue).
Rules: yearly = 12 × monthly × (1 − `yearlyDiscountPct`/100); upgrades prorated and paid now; downgrades
at renewal (`scheduledChange`); trial once per business, after approval, no card. Scheduler: reminders 7 days
and 1 day before trial end / renewal, failed renewal → `grace` for `graceDays` → `expired` (store hidden).
Visibility helper `isVendorPublic(vendor)` (approved + trial/active/grace) used by every public read.
Audit `plan.created|updated`, `subscription.extended`.

Seed: 3 plans (handoff 8.3); approved vendors' subscriptions (60% active, 20% trial, 10% grace, 10% expired),
invoices and matching subscription payments.

**Done when:** in Paystack test mode a vendor can trial, pay, upgrade, schedule a downgrade, cancel and resume; an expired vendor disappears from public reads.

### Phase 13 — Catalogue, vendor menu, store and staff

Tables: `categories`, `food_items` (+ `photos`, `photo_credits`, option groups/options JSON or tables, `available_days`, `is_hidden`, counters), `vendor_staff`.

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/categories` | Public |
| `GET` | `/food-items` | Public (search + filters incl. `maxDistanceKm`; default `-likesCount`) |
| `GET` | `/food-items/{id}` | Public (with vendor; photo credits) |
| `GET` | `/vendors` | Public (visible only; default `-rating`) |
| `GET` | `/vendors/{slugOrId}` | Public (404 when hidden) |
| `GET` | `/vendor/menu` | Vendor (`meta.limits`; incl. sold-out) |
| `POST` | `/vendor/menu` | Vendor (`PLAN_LIMIT` on items / photos) |
| `GET` | `/vendor/menu/{id}` | Vendor |
| `PATCH` | `/vendor/menu/{id}` | Vendor (or just `{ isAvailable }`) |
| `DELETE` | `/vendor/menu/{id}` | Vendor (orders keep their copy) |
| `GET` | `/vendor/store` | Vendor (bank last 4) |
| `PATCH` | `/vendor/store` | Vendor (hours, pause, radius, prep time, page details) |
| `POST` | `/vendor/bank-change` | Vendor (resolve now; admin approves in phase 10 endpoint) |
| `GET` | `/vendor/staff` | Vendor (with plan limit) |
| `POST` | `/vendor/staff` | Vendor (`PLAN_LIMIT`) |
| `DELETE` | `/vendor/staff/{id}` | Vendor |

Rules: hidden or deleted dishes never public; sold-out stays visible with `isAvailable: false`;
`distanceM` from query `lat`/`lng`, else default address, else central Lagos.

Seed: 12 categories, 35 dishes with option groups (handoff 8.3); Mama Put the first 14, others 5–10;
**real photos** from `seed-images.json` downloaded once and stored via the upload pipeline (cache locally
so re-seeding doesn't re-download); plan photo limits; rotated starting photo; vendor covers and square logos.

**Done when:** search, storefront and the vendor menu / store / staff pages work without mocks.

### Phase 14 — Social, feed and moderation

Tables: `likes`, `follows`, `comments` (parentId, editedAt, deleted flag), `reports`.

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/feed` | Public (cursor, limit 10; tabs nearby / popular / newest / following) |
| `POST` | `/food-items/{id}/likes` | Customer |
| `DELETE` | `/food-items/{id}/likes` | Customer |
| `GET` | `/me/likes` | Customer |
| `GET` | `/food-items/{id}/comments` | Public (cursor, with vendor replies) |
| `POST` | `/food-items/{id}/comments` | Customer; vendor reply on own dish with `parentId` |
| `PATCH` | `/comments/{id}` | Author |
| `DELETE` | `/comments/{id}` | Author ("Comment removed") |
| `POST` | `/reports` | Signed in |
| `POST` | `/vendors/{id}/follow` | Customer |
| `DELETE` | `/vendors/{id}/follow` | Customer |
| `GET` | `/me/follows` | Customer |
| `GET` | `/vendor/engagement` | Vendor |
| `GET` | `/vendor/comments` | Vendor (`answered` filter) |
| `GET` | `/admin/reports` | `moderation.manage` |
| `POST` | `/admin/reports/{id}/resolve` | `moderation.manage` (hide / remove / dismiss settles all open reports on the target) |

(Feed ranking: nearby = 1 km bands then newest; popular = likes + 2×orders + 3×comments.)
Rules: comments ≤500 chars; counters updated in the same transaction. Audit `comment.hidden|removed`, `food_item.hidden|removed`.

Seed: likes, follows, comments (35% with vendor reply), 9 comment + 3 dish reports open.

**Done when:** feed, likes, comments, follows, vendor engagement and admin moderation work without mocks.

---

## 7. Transactions (phases 15–18)

### Phase 15 — Checkout, payments, orders, vendor sales

Tables: `orders` (code, deliveryCode, snapshot of vendor/address, fees, `acceptDeadline`, `statusHistory`), `order_items` (copy of dish + options), `payments` (type `order`, split, settlement status, channel, flags).

| Method | Path | Who |
| --- | --- | --- |
| `POST` | `/checkout/quote` | Customer (422 quote codes) |
| `POST` | `/payments/initialize` | Customer (re-quote; Paystack init with split; **no order yet**) |
| `POST` | `/payments/verify` | Customer (idempotent; creates the order; also run by webhook `charge.success`) |
| `GET` | `/me/payments` | Customer |
| `GET` | `/orders` | Signed in, scoped |
| `GET` | `/orders/{id}` | Signed in, scoped (deliveryCode only for customer + admin) |
| `POST` | `/orders/{id}/cancel` | Customer (only while `paid`, else `CANNOT_CANCEL`; full refund) |
| `POST` | `/orders/{id}/accept` | Vendor (before `acceptDeadline`) |
| `POST` | `/orders/{id}/reject` | Vendor (reason; full refund) |
| `POST` | `/orders/{id}/preparing` | Vendor |
| `POST` | `/orders/{id}/ready` | Vendor (triggers dispatch in phase 17) |
| `GET` | `/vendor/stats` | Vendor |
| `GET` | `/vendor/sales` | Vendor (`meta.summary`) |
| `GET` | `/vendor/sales/daily` | Vendor (Lagos days) |
| `GET` | `/admin/customers` | `customers.view` (with order counts) |
| `POST` | `/admin/customers/{id}/status` | `customers.ban` (audited) |
| `GET` | `/admin/payments` | `payments.view` (`meta.summary`, `flagged`) |
| `POST` | `/admin/payments/{id}/reconcile` | `payments.view` (audited `payment.reconciled`) |

Rules:
- Delivery fee = `deliveryBaseFee + ceil(km) × deliveryPerKm`, capped at `deliveryMaxFee`; processing fee =
  `processingFeePct`% of (subtotal + delivery) + `processingFeeFlat` when that is ≥ ₦2,500, capped at `processingFeeCap`
- Split: subtotal → vendor subaccount, delivery fee → KJT Foodie, processing fee paid by customer
- State machine `paid → accepted → preparing → ready_for_pickup → rider_assigned → picked_up → delivered`
  (+ `rejected`, `cancelled`); illegal moves → 409 `INVALID_STATUS`; every change appends `{ status, at, by, note? }` and notifies the customer
- Delayed job at `acceptDeadline` → `rejected` "Not accepted in time" + full refund (Paystack refund)
- Payment settlement: `settling` → `settled`; reconciliation job flags `amount_mismatch` / `missing_webhook`

Seed: 360 orders over 90 days with payments (channels, settlements, ~1.5% flagged, refunds), today's Mama Put live queue and Ada's `picked_up` order (rider + delivery come in phase 17 seed).

**Done when:** a test-mode payment creates an order, the vendor accepts → ready, auto-reject fires when ignored, and money splits correctly in Paystack.

### Phase 16 — Real time (Socket.IO)

- Socket.IO on port 4000, path `/socket.io`, websocket, same CORS origins, Redis adapter
- JWT auth on connect (reject invalid); reconnect with new token
- Rooms: `user:{id}`, `vendor:{id}`, `rider:{id}`, `order:{id}`, `admin:live-map`, each with a join check

| Direction | Event |
| --- | --- |
| C→S | `order:subscribe` / `order:unsubscribe` `{ orderId }` |
| S→C | `order:status` `{ orderId, status, statusHistory, updatedAt, rider?, delivery? }` |
| C→S | `vendor:subscribe` / `vendor:unsubscribe` `{ vendorId }` |
| S→C | `vendor:order:new` `{ vendorId, orderId, code, total, acceptDeadline }` |
| S→C | `notification:new` (optional) |

- Order service emits after each committed transition

**Done when:** customer order page and vendor live queue update instantly without refresh.

### Phase 17 — Dispatch, deliveries, GPS, live map, chat

Tables: `deliveries` (fee, `payoutPct` snapshot, `riderEarning`, route points), `delivery_offers`, `chat_messages`.

| Method | Path | Who |
| --- | --- | --- |
| `POST` | `/rider/status` | Rider (online / offline) |
| `GET` | `/rider/offers` | Rider |
| `POST` | `/deliveries/offers/{id}/accept` | Rider (`OFFER_GONE`) |
| `POST` | `/deliveries/offers/{id}/decline` | Rider |
| `GET` | `/rider/delivery` | Rider (current or null) |
| `POST` | `/deliveries/{id}/pickup` | Rider |
| `POST` | `/deliveries/{id}/complete` | Rider (4-digit code; wrong → 422 on `code`) |
| `POST` | `/admin/orders/{id}/reassign` | `orders.reassign` (before pickup; audited) |
| `GET` | `/admin/live-map` | `live_map.view` |
| `GET` | `/orders/{id}/chat` | Customer or assigned rider |
| `POST` | `/orders/{id}/chat` | Customer or assigned rider (only `rider_assigned` / `picked_up`) |
| `GET` | `/admin/riders` | shared — add `nearOrderId` filter (approved, online, free, nearest with `distanceM`) |

Socket events: C→S `rider:subscribe` / `rider:unsubscribe`, `rider:location` (every ~8 s, online only;
store, append route, forward); S→C `rider:location` `{ orderId, riderId, lat, lng, heading, etaMins, at }`,
`rider:job:offer` (30 s), `chat:message`; C→S `admin:live-map:subscribe` / `:unsubscribe`; S→C `admin:live-map` every few seconds.

Dispatch: on `ready_for_pickup`, offer to nearest online, approved, free rider in the same city; decline or
`riderOfferTimeoutSec` timeout → next rider; alert Dispatch admins when nobody accepts.
On complete: rider earns `payoutPct`% of the delivery fee (stored on the delivery).

Seed: deliveries for every order that had a rider; Ada's live `picked_up` delivery with a route; Tunde's 24 trips.

**Done when:** a ready order is offered to a rider, accepted, tracked live on the customer map and admin live map, chatted on, and completed with the code.

### Phase 18 — Reviews, rider trips, earnings, payouts

Tables: `reviews`, `rider_payout_statements`.

| Method | Path | Who |
| --- | --- | --- |
| `POST` | `/orders/{id}/reviews` | Customer (delivered; once per target; updates rating, `ratedVendor` / `ratedRider`) |
| `GET` | `/reviews` | Public |
| `POST` | `/reviews/{id}/reply` | Vendor (once) |
| `GET` | `/rider/trips` | Rider (default `-deliveredAt`) |
| `GET` | `/rider/earnings` | Rider |
| `GET` | `/rider/statements` | Rider |
| `GET` | `/admin/payouts` | `payouts.manage` (`month` filter) |
| `POST` | `/admin/payouts/{id}/approve` | `payouts.manage` |
| `POST` | `/admin/payouts/{id}/mark-paid` | `payouts.manage` (transfer reference; notify rider) |

Scheduler: 1st of month → monthly statement per rider (idempotent, unique rider + month), `draft → approved → paid`.
Audit `payout.approved|marked_paid`.

Seed: ~45% of delivered orders reviewed; 3 months of statements per approved rider.

**Done when:** ratings, rider earnings / statements and admin payouts work without mocks; re-running the statement job makes no duplicates.

---

## 8. After the sale (phases 19–21)

### Phase 19 — Refunds

Tables: `refunds` (amount ≤ food subtotal, photos, `deadline`, `timeline` events, admin comments).

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/refunds` | Signed in, scoped |
| `POST` | `/refunds` | Customer (delivered order; one per order) |
| `GET` | `/refunds/{id}` | Signed in, scoped (full timeline) |
| `POST` | `/refunds/{id}/confirm` | Customer |
| `POST` | `/refunds/{id}/dispute` | Customer (notify admins) |
| `POST` | `/refunds/{id}/respond` | Vendor (accept full / part, or reject with reason, before deadline) |
| `POST` | `/refunds/{id}/mark-paid` | Vendor (reference) |
| `POST` | `/refunds/{id}/comments` | `refunds.view` (internal) |
| `POST` | `/refunds/{id}/escalate` | `refunds.escalate` (audited `refund.escalated`) |

Delayed job at `deadline` (`refundDeadlineHours`) → `refundMissedAction` (escalate / warn / suspend).
Admins never move vendor money.

Seed: ~20 refunds cycling every status with matching timelines (2 of Ada's, 4 of Mama Put's).

**Done when:** one refund goes through its whole life across the customer, vendor and admin UIs, including a missed deadline.

### Phase 20 — Support tickets and admin inbox

Tables: `support_tickets` (number, priority, assignee, optional order), `support_messages` (internal flag).

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/support/tickets` | Customer, vendor, rider (no internal notes) |
| `POST` | `/support/tickets` | Customer, vendor, rider |
| `GET` | `/support/tickets/{id}` | Owner |
| `POST` | `/support/tickets/{id}/messages` | Owner (waiting / resolved → open) |
| `POST` | `/support/tickets/{id}/resolve` | Owner |
| `GET` | `/admin/tickets` | `support.manage` (`assignee` = me / none / id) |
| `GET` | `/admin/tickets/{id}` | `support.manage` (incl. internal notes) |
| `PATCH` | `/admin/tickets/{id}` | `support.manage` (status, priority, assignee; audited `ticket.updated`) |
| `POST` | `/admin/tickets/{id}/messages` | `support.manage` (reply → notify, open → pending; or internal note) |
| `GET` | `/admin/agents` | `support.manage` |

Seed: 11 tickets (handoff 8.4) with replies and an internal note.

**Done when:** help centre and admin inbox work without mocks.

### Phase 21 — Admin overview and the full demo world

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/admin/overview` | `dashboard.view` (GMV + orders today, active deliveries, MRR, delivery-fee revenue, sign-ups, work waiting) |

- Finish the seeder: run the whole of handoff section 8 end to end, deterministic (`seed 2026`, `en_NG`), times relative to now;
  26 more active orders today across other vendors; notifications created by the flows; 60 audit entries over 30 days
- Verify every remaining frontend mock can be deleted; walk the four journeys (customer orders and tracks,
  vendor accepts and marks ready, rider delivers with the code, admin approves a vendor) and the Playwright specs

**Done when:** the frontend runs with `VITE_USE_MOCKS=false` everywhere and all four journeys pass (**gate: all mocks removed**).

## 9. Hardening and deployment (phase 22)

**Quality** — 80%+ service coverage; every endpoint tested for success, validation, 401, 403/404, 409;
responses validated against `docs/api/openapi.yaml` in CI; k6 load test (lunch peak, 200 riders sending GPS).

**Security** — OWASP Top 10 review, `npm audit`, secrets scan; permission matrix re-run on staging;
forged webhook tests; rate limits tuned; PII per role (riders see masked customer phone; delivery code never to vendor/rider).

**Payments** — full Paystack test-mode run (split order, rejection refund, auto-reject, subscription trial → paid → failed → grace → expired → renewed);
reconciliation compared with the Paystack dashboard; one small live transaction on production.

**Operations** — managed MySQL with backups, managed Redis, 2+ API instances run as Node processes with PM2 (sticky sessions for Socket.IO) + worker + scheduler;
CI/CD with migrations; Sentry, uptime, alerts (errors, failed jobs, queue backlog, webhook failures);
production seed = roles, permissions, super admin, plans, categories, settings, service areas, templates only (no demo data);
runbook (deploy, roll back, rotate keys, replay a webhook, re-run a payout statement).

**Done when:** UAT sign-off on staging and production health checks are green.

## 10. Postman standard (every phase)

- One collection **KJT Foodie API** exported to `docs/postman/kjt-foodie-api.postman_collection.json`;
  environments `local`, `staging`, `production` in `docs/postman/environments/` with empty secrets
- Variables: `baseUrl`, `customerToken`, `vendorToken`, `riderToken`, `adminToken` (+ per sub-role), saved IDs
- One folder per module in build order, role subfolders where behaviour differs
- Every request: sentence-case name, description (purpose, who / permission, fields, side effects, BRD IDs),
  realistic body (Nigerian names, kobo), saved success + error examples, tests that save IDs
- Webhook samples with a pre-request script computing `x-paystack-signature`; a Realtime request listing every socket event
- CI runs the collection with Newman against staging after each deploy
