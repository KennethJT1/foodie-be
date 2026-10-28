# KJT Foodie — Implementation Plan

Oct 28, 2026 · @Lorem Backend

## 1. Approach

KJT Foodie is built in about **36 weeks**: 2 weeks of setup and API contract, 12 weeks of frontend against a mock API, 14 weeks of backend that replaces the mocks module by module, then 8 weeks of hardening, pilot and launch. Durations are estimates for a team of 3 developers, 1 product designer and 1 QA tester; more developers shorten the frontend and backend phases.

### How "frontend first" works without a backend

1. **Agree the contract first (weeks 1–2).** Write the OpenAPI spec for every endpoint: paths, request bodies, response envelope, pagination and filter parameters, error codes (Backend Architecture, section 5). This is the single source of truth for both sides.
2. **Build the frontend on MSW mocks (weeks 3–14).** Every screen for all four roles works end to end with fake data, fake payments and a fake moving rider. Stakeholders can click through the real product and request changes cheaply, before any backend code exists.
3. **Build the backend to the same contract (weeks 15–28).** Each backend sprint delivers a module and switches the matching frontend feature from mock to real API by deleting its mock handlers. Contract tests check that real responses match the spec.
4. **Harden, pilot and launch (weeks 29–36).**

### Ground rules

- Two-week sprints with a demo at the end of each; work tracked in Jira, Linear or GitHub Projects.
- Every change goes through a pull request with review and passing CI.
- "Must have" BRD requirements first; "should" and "could" items only when the sprint goal is done.
- A change to the API contract needs agreement from both frontend and backend before anyone codes it.

## 2. Roadmap

Four phases run one after another, each closed by a gate the product owner signs off.

&#91;embedded content: roadmap · 4 phases, 4 gates, 36 weeks\]

If the kick-off is set, each week number maps to a date; a 1 Dec 2026 start would put public launch around 10 Aug 2027.

## 3. Frontend sprints (weeks 1–14)

The shared component library comes first, then each role's screens in the order money flows: customer, vendor, rider, admin.

| Sprint | Weeks | Goal | Main tasks | Done when |
| --- | --- | --- | --- | --- |
| FE0 | 1–2 | Foundations and contract | Vite + React + Tailwind setup, ESLint/Prettier/Husky, folder structure, router skeleton with role layouts, MSW + Faker setup, Axios client, React Query, OpenAPI contract draft, design tokens and key screens in Figma | App boots with mocks; contract v1 reviewed by backend lead |
| FE1 | 3–4 | Component library and auth | `components/ui`, `forms`, `feedback`, `data` (DataTable, Pagination, FilterBar, StatCard), `useTableQuery`, layouts and nav configs, guards (`RequireAuth`, `RequireRole`, `RequirePermission`), login, sign-up (customer, vendor, rider), OTP, forgot password, `/dev/ui` style guide | All shared components tested; a user of each role can log in to their own layout |
| FE2 | 5–6 | Customer discovery and social | Home feed (infinite), search and filters, categories, food detail, vendor storefront, like, comment and reply, follow, report, share link | A customer can browse, like, comment and follow on mocks |
| FE3 | 7–8 | Customer ordering and tracking | Cart (one vendor), checkout summary with delivery and processing fee, Paystack popup (mocked), order confirmation, order history, live tracking map with moving rider, delivery code, ratings and reviews, refund request, notifications, addresses, profile | Full customer order journey works end to end on mocks |
| FE4 | 9–10 | Vendor dashboard | Onboarding wizard by vendor type with document upload, bank account (resolve name), pending-approval screen, live order queue with sound alerts (accept, reject, preparing, ready), menu management (items, photos, options, availability), sales and payouts ("settling"), engagement stats, refunds (respond, mark paid), plans and subscription (trial, upgrade, renew, expired lock), store settings and hours, staff | A vendor can onboard, manage menu and fulfil an order on mocks |
| FE5 | 11–12 | Rider app and admin part 1 | Rider: onboarding, online toggle, job offer with countdown, active delivery map and steps, confirm pickup, enter delivery code, trips, earnings this month, payout statements. Admin: overview KPIs and charts, vendor and rider approval queues, customers, all orders with reassignment, live map of riders | A rider can complete a delivery; admin can approve vendors and riders |
| FE6 | 13–14 | Admin part 2 and polish | Payments and settlement status, plans and prices, subscriptions, refunds with timeline and escalation, moderation queue, support inbox, settings (fees, payout %, deadlines), admin users and permissions, audit log, CSV exports; PWA, accessibility audit, performance budget, Playwright journeys on mocks | **Gate: frontend sign-off** — stakeholders accept every screen on mocks |

Design runs one sprint ahead of development (screens for FE2 are designed during FE1, and so on).

## 4. Backend sprints (weeks 15–28)

Each backend sprint ends by switching the matching frontend features from mocks to the real API on staging.

| Sprint | Weeks | Goal | Main tasks | Frontend switched off mocks |
| --- | --- | --- | --- | --- |
| BE1 | 15–16 | Core and auth | Express app, config validation, Docker Compose (MySQL, Redis), Pino logging, error handler, response helpers, `buildListQuery` + `paginate`, Sequelize setup and first migrations (users, roles, permissions, tokens, OTP, addresses), auth (OTP, password, JWT + refresh rotation), `authenticate`, `authorize`, `validate`, policies, rate limits, BullMQ setup + `notifications` queue (SMS, email), seeders, CI | Auth, profile, addresses |
| BE2 | 17–18 | Vendors and riders onboarding | Vendor and rider tables, documents and required-documents list, Cloudinary signed uploads, admin approvals, bank account resolve, Paystack subaccount creation, opening hours, staff, audit logging | Vendor and rider onboarding, admin approvals |
| BE3 | 19–20 | Plans and subscriptions | Plans and prices, Paystack plans, trial start, subscription checkout, webhooks (`subscription.*`, `invoice.*`), `subscriptions` queue: reminders, grace, expiry, storefront visibility; settings module | Plans, subscription pages, admin plans |
| BE4 | 21–22 | Catalogue and social | Categories, food items, photos, option groups, availability, plan limits, feed (cursor), search (FULLTEXT), geo "near me", likes, comments, follows, reports, moderation | Feed, search, storefront, menu management, moderation |
| BE5 | 23–24 | Orders and payments | Server-side pricing and delivery fee, checkout, Paystack split initialise, webhook endpoint + `payments` queue, order state machine, auto-reject delayed job, Socket.IO setup with rooms, `order:new` and `order:status` events, payment records and settlement status | Cart, checkout, orders for customer, vendor and admin, payments |
| BE6 | 25–26 | Dispatch, delivery and GPS | Rider online status, Redis GEO, nearest-rider offers with timeouts, manual assignment, deliveries, `rider:location` socket handling, ETA, GPS trail, delivery code, reviews, rider earnings, monthly statement job, payout approval | Rider app, live tracking, admin live map, rider payouts |
| BE7 | 27–28 | Refunds, support, reports | Refund flow and events, deadline job, delivery-fee refunds via Paystack, support tickets, customer–rider chat, notifications centre and templates, daily stats job, admin reports and CSV exports, reconciliation job, Bull Board, audit log search | Refunds, support, reports, audit log. **Gate: all mocks removed** |

Integration tests (Supertest + Testcontainers) are written in the same sprint as each endpoint, not later.

## 5. Integration, testing and launch (weeks 29–36)

The last eight weeks turn a feature-complete product into a safe launch: four weeks of hardening and user acceptance testing on staging, then a pilot with real vendors and riders before opening to everyone.

### Hardening and UAT (weeks 29–32)

- [ ] Playwright journeys run against the real staging API: customer orders and tracks, vendor accepts and marks ready, rider delivers, admin approves and refunds
- [ ] Load test (k6): 2,000 orders/day pattern, 200 riders sending GPS every 5 s, peak lunch hour at 5× average
- [ ] Security review: OWASP Top 10 checklist, role/permission matrix tested for every admin sub-role, dependency audit
- [ ] Paystack: full test-mode run of split payments, renewals, failed renewals, refunds; then a small live transaction test
- [ ] Monitoring live: Sentry, log alerts, queue backlog alerts, uptime checks
- [ ] Backups and restore tested once on staging
- [ ] Legal pages published: terms (customer, vendor, rider), privacy policy (NDPA 2023)
- [ ] UAT: business owner and admin team test every BRD "must have" requirement; bugs fixed. **Gate: UAT sign-off**

### Pilot and launch (weeks 33–36)

| Week | Activity |
| --- | --- |
| 33 | Onboard 10–20 pilot vendors and 10 riders in one city; admin team trained |
| 34 | Pilot open to invited customers; daily review of orders, payments, GPS, support tickets |
| 35 | Fix pilot issues; onboard more vendors and riders across cities |
| 36 | **Public launch** across Nigeria; marketing starts; on-call rota for the first month |

The BRD's "all cities" decision stands; the pilot city is only for the first two weeks, to catch problems while volumes are small.

## 6. Team, definition of done and risks

### Team (assumed)

| Role | Count | Focus by phase |
| --- | --- | --- |
| Product owner (business) | 1 | Priorities, sign-offs at each gate, UAT |
| Product designer | 1 | Figma screens one sprint ahead; design QA |
| Developers (React + Node) | 3 | All three on frontend in weeks 3–14, all three on backend in weeks 15–28; one keeps fixing frontend issues found during integration |
| QA tester | 1 | Test cases from the BRD from week 3; Playwright; UAT support |
| DevOps (part-time / contractor) | 0.5 | Staging and production setup, CI/CD, monitoring, backups |

### Definition of done (every story)

- Meets the BRD requirement and its acceptance criteria
- Built from shared components; follows the Frontend Guidelines or Backend Architecture conventions
- Loading, empty, error and no-permission states handled (frontend)
- Validation, role and ownership checks, audit entry where money or admin actions are involved (backend)
- Tests written and passing; CI green; reviewed by another developer
- Works on a 360 px phone and on desktop
- Deployed to staging and shown at the sprint demo

### Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Building frontend first means backend surprises come late | Rework in weeks 15–28 | Contract agreed in FE0; backend lead reviews every mock handler; spike the hardest backend pieces (Paystack split, GPS sockets) in week 2 |
| Mock data hides real performance issues | Slow pages after integration | Mocks include realistic delays and volumes; load testing in week 29–30 |
| Developers idle on one side while the other is built | Wasted capacity | Same full-stack developers do both phases; backend setup can start in week 13–14 if frontend finishes early |
| Paystack split or subscription behaviour differs from assumptions | Payment bugs at launch | Test-mode prototype in FE0; confirm settlement and fee rules with Paystack before BE5 |
| Browser GPS unreliable when rider's screen locks | Tracking gaps | Keep-awake prompt; native rider app planned for phase 2 (BRD section 13) |
| Scope growth (many requirements marked "must") | Missed launch date | Product owner re-ranks the backlog at every gate; extra items go to phase 2 |
