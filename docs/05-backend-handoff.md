# KJT Foodie — Backend Handoff (API and seeder)

Oct 28, 2026 · Frontend team → Backend team

This is what the web app expects from the Express backend: every endpoint, how URLs, filters,
pagination and errors look, the real-time events, the rules the server must enforce, and a
seeder that produces the same demo world the frontend was built against.

The frontend is finished on mocks (phases 1–17). Each mock handler in `src/mocks/handlers/` is the
reference behaviour for one endpoint; when an endpoint goes live, its mock is deleted (phase 18).

| File | What it is |
| --- | --- |
| `docs/05-backend-handoff.md` | This guide: conventions, endpoint list, filters, events, rules, seeder |
| `docs/api/openapi.yaml` | The contract: every request and response body. **Source of truth for shapes** |
| `docs/backend/seed-images.json` | 88 real photographs (dishes, vendor covers, a document sample) with credits |
| `src/mocks/seed/seed.js`, `src/mocks/seed/catalogue-data.js` | The mock seeder this spec describes; read it when in doubt |
| `src/mocks/handlers/*.js` | Reference behaviour for each endpoint (validation, status codes, side effects) |

If this guide and `openapi.yaml` ever disagree, `openapi.yaml` wins; tell the frontend team so we
fix both.

## 1. Local setup

| Thing | Value |
| --- | --- |
| Backend port | **4000** |
| REST base URL | `http://localhost:4000/api/v1` |
| Socket.IO | `http://localhost:4000` (default path `/socket.io`, websocket transport) |
| Frontend dev server | `http://localhost:5173` (Playwright uses `5174`, `vite preview` uses `4173`) |

Frontend `.env` to run against the backend:

```bash
VITE_USE_MOCKS=false
VITE_API_URL=http://localhost:4000/api/v1
VITE_SOCKET_URL=http://localhost:4000
VITE_PAYSTACK_PUBLIC_KEY=pk_test_...
VITE_GOOGLE_MAPS_KEY=...
```

Because the frontend runs on another port, the backend must send CORS headers for
`http://localhost:5173`, `http://localhost:5174` and `http://localhost:4173` with
`Access-Control-Allow-Credentials: true` (the refresh token is a cookie). Allow the
`Authorization` and `Content-Type` headers and the methods `GET, POST, PATCH, DELETE`.
Socket.IO needs the same origins.

## 2. Conventions

### URLs

- Everything lives under `/api/v1`. Paths are lowercase, plural nouns, kebab-case:
  `/food-items`, `/admin/audit-log`, `/vendor/subscription/invoices`.
- A resource is `/{collection}/{id}`. Actions that are not plain edits are `POST` sub-paths with a
  verb: `/orders/{id}/accept`, `/refunds/{id}/mark-paid`, `/admin/vendors/{id}/approve`.
- "My own" data for a signed-in user sits under a role prefix: `/me/*` (any user),
  `/vendor/*` (the vendor's own store), `/rider/*` (the rider's own work). The user comes from the
  token, never from the URL.
- Admin-only endpoints start with `/admin`, except refunds and orders, which are shared by every
  role and scoped by who is asking.
- `PATCH` sends only the fields that change. `DELETE` returns `204` with no body.
- Vendors are found by slug or id: `GET /vendors/{slugOrId}`.

### Envelopes

```jsonc
// success
{ "success": true, "data": { ... } }
// list
{ "success": true, "data": [ ... ], "meta": { "page": 1, "limit": 20, "total": 134, "totalPages": 7, "hasNextPage": true, "hasPrevPage": false } }
// cursor list (feed, comments)
{ "success": true, "data": [ ... ], "meta": { "nextCursor": "20", "limit": 10, "total": 134 } }
// error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Please check the highlighted fields.", "fieldErrors": { "email": "Enter a valid email address" } } }
```

Some lists add extra numbers to `meta` (for example `meta.summary` on `/vendor/sales` and
`/admin/payments`, `meta.limits` on `/vendor/menu`, `meta.trialDays` on `/plans`). Keep the
standard `meta` keys alongside them.

### Errors

| Status | `error.code` | When |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Malformed request |
| 401 | `UNAUTHENTICATED` | No or expired access token (the frontend then calls `/auth/refresh` once) |
| 403 | `FORBIDDEN`, `ACCOUNT_BANNED`, `ACCOUNT_SUSPENDED` | Wrong role, missing permission, blocked account |
| 404 | `NOT_FOUND` | Missing, **or** exists but the user may not see it (never leak existence) |
| 409 | specific codes below | The action does not fit the current state |
| 413 | `PAYLOAD_TOO_LARGE` | Upload too big |
| 422 | `VALIDATION_ERROR` | Field errors in `fieldErrors` |
| 429 | `RATE_LIMITED` | OTP and login throttling |
| 500 | `INTERNAL_ERROR` | Never send stack traces or raw database errors |

409 codes the frontend reacts to: `ALREADY_SUBMITTED`, `NOT_APPROVED`, `TRIAL_USED`, `SAME_PLAN`,
`DOWNGRADE_AT_RENEWAL`, `PAYMENT_REQUIRED`, `PLAN_LIMIT`, `INVALID_STATUS`, `OFFER_GONE`,
`CANNOT_CANCEL`. Checkout quote failures use 422 with `VENDOR_PAUSED`, `VENDOR_CLOSED`,
`OUT_OF_RANGE`, `ITEM_UNAVAILABLE` or `EMPTY_CART`.

**`message` is shown to the user as-is**, so write it in plain, friendly English (Frontend
Guidelines section 9): say what happened and what to do next, never blame the user, no codes.
Examples: "That phone number is already registered. Log in instead?", "This order can't be marked
as ready now. Refresh to see its latest status."

**`fieldErrors` keys are the request field names**, with dots for nested fields:
`address.line1`, `guarantor.phone`, `optionGroups.0.options.1.name`, `limits.menuItems`. The
forms put each message under the matching input.

### Data formats

| Thing | Format |
| --- | --- |
| Money | Integer **kobo** everywhere (₦3,500 = `350000`). No floats |
| Dates and times | ISO 8601 UTC strings (`2026-10-28T14:05:00.000Z`). The UI shows Africa/Lagos |
| Day buckets (charts, sales by day) | `YYYY-MM-DD` of the **Lagos** day (UTC+1) |
| Phone | E.164 `+2348031234567`. Accept `0803…`, `234803…`, `+234 803 …` and normalise |
| Order code | 6 uppercase letters/digits (`4F7Q2A`); the UI prints `KJT-4F7Q2A` |
| Delivery code | 4 digits, shown only to the customer and admins |
| Coordinates | `lat`, `lng` as numbers (WGS84) |
| Distances | metres (`distanceM`); radius settings in km |
| IDs | Strings. Any format (UUID, ObjectId); the frontend never parses them |
| Slugs | lowercase kebab-case from the store name, unique |
| Images | Absolute `https://` URLs returned by `POST /uploads` |

### Auth

- `POST /auth/login`, `/auth/otp/verify`, `/auth/google` and `/auth/refresh` return
  `{ accessToken, user }` (see `Session` in the contract).
- **Access token**: JWT, about 15 minutes, sent as `Authorization: Bearer <token>`. The frontend
  keeps it in memory only.
- **Refresh token**: httpOnly cookie (suggested name `kjt_refresh`, `Path=/api/v1/auth`,
  `SameSite=Lax`, `Secure` outside localhost), 30 days, **rotated** on every `/auth/refresh`.
  `/auth/logout` revokes it and clears the cookie. On page load the app calls `/auth/refresh`
  first; a 401 there just means "signed out".
- Parallel 401s are fine: the frontend makes one refresh call and retries the others.
- The `user` object must include `permissions` (array, admins only) and, for vendors,
  `vendor { id, name, slug, approvalStatus, subscriptionStatus, planId, onboardingStep, logo }`,
  for riders `rider { id, approvalStatus, isOnline }`. Route guards read these, so `/me` must
  return fresh values after approval, plan or online changes.
- Demo OTP in local and staging: `123456`. Real SMS only in production.

### Roles and admin permissions

Roles: `customer`, `vendor`, `rider`, `admin`. Admins also have `adminRole`
(`super_admin`, `support`, `finance`, `dispatch`, `onboarding`), and permissions come from an
editable roles table (`/admin/roles`). Every admin endpoint names its permission below
(`x-permission` in the contract). **Check it on the server every time**; the UI hiding a button
is not security.

| Sub-role | Default permissions |
| --- | --- |
| Super admin | all of them (cannot be edited) |
| Support | `dashboard.view`, `customers.view`, `vendors.view`, `riders.view`, `orders.view`, `refunds.view`, `refunds.escalate`, `moderation.manage`, `support.manage` |
| Finance | `dashboard.view`, `orders.view`, `payments.view`, `subscriptions.view`, `subscriptions.manage`, `payouts.manage`, `refunds.view`, `reports.export` |
| Dispatch | `dashboard.view`, `riders.view`, `orders.view`, `orders.reassign`, `live_map.view` |
| Onboarding | `dashboard.view`, `vendors.view`, `vendors.approve`, `riders.view`, `riders.approve` |

Other permissions: `customers.ban`, `settings.manage`, `admin_users.manage`, `audit_log.view`
(super admin by default).

## 3. Lists: pagination, sorting, search and filters

Every paginated list takes the same query parameters, with names exactly as below:

| Param | Example | Meaning |
| --- | --- | --- |
| `page` | `page=2` | 1-based. Out of range → clamp to the last page |
| `limit` | `limit=20` | Default 20, **max 100** |
| `sort` | `sort=-createdAt` / `sort=price` / `sort=-rating,name` | `-` = descending; comma for several |
| `search` | `search=jollof` | Case-insensitive "contains" over the search fields listed below |
| `<field>` | `status=paid,accepted` | Exact match; **comma = any of** |
| `from`, `to` | `from=2026-10-01&to=2026-10-28` | Inclusive dates on the list's date field. A `YYYY-MM-DD` means the whole day |
| `cursor` | `cursor=20` | Feed and comments only: opaque string from `meta.nextCursor` |

Unknown filters are ignored. Empty values are ignored. Sorting by any field shown in the table
should work; the ones in the table are what screens use.

| Endpoint | `search` looks in | Filters | Date field | Default sort |
| --- | --- | --- | --- | --- |
| `GET /categories` | name | — | — | `sortOrder` |
| `GET /feed` (cursor, limit 10) | — | `tab` = `nearby` \| `popular` \| `newest` \| `following`, `categoryId`, `lat`, `lng` | createdAt | nearby: 1 km distance bands then newest; popular: likes + 2×orders + 3×comments |
| `GET /food-items` | name, description, vendor name, category name | `categoryId`, `vendorId`, `available=true`, `minPrice`, `maxPrice` (kobo), `minRating`, `maxDistanceKm`, `lat`, `lng` | createdAt | `-likesCount` |
| `GET /vendors` | name, area, city | `city`, `lat`, `lng` | createdAt | `-rating` |
| `GET /food-items/{id}/comments` (cursor) | — | — | createdAt | `-createdAt` |
| `GET /me/likes`, `GET /me/follows` | — | — | createdAt | `-createdAt` |
| `GET /me/payments` | reference, order code, vendor name | `status` | createdAt | `-createdAt` |
| `GET /orders` (scoped¹) | code, vendor name, customer name | `status`, `active=true\|false`, `vendorId`, `customerId`, `riderId` | createdAt | `-createdAt` |
| `GET /refunds` (scoped¹) | order code, vendor, customer, reason | `status`, `vendorId`, `orderId` | createdAt | `-createdAt` |
| `GET /reviews` | comment, reviewer name | `targetType` (`vendor`\|`rider`), `targetId`, `rating` | createdAt | `-createdAt` |
| `GET /notifications` | — | `type`, `unread=true` | createdAt | `-createdAt` |
| `GET /support/tickets` | subject, number | `status` | updatedAt | `-updatedAt` |
| `GET /vendor/subscription/invoices` | reference, plan name | `status` | createdAt | `-createdAt` |
| `GET /vendor/menu` | name, description | `categoryId`, `availability` = `available` \| `sold_out` | createdAt | screen sends `name` |
| `GET /vendor/sales` | order code, customer, reference | `settlementStatus` = `settling` \| `settled` \| `refunded` | createdAt | `-createdAt` |
| `GET /vendor/comments` | comment, dish name, author | `answered=true\|false` | createdAt | `-createdAt` |
| `GET /rider/trips` | order code, vendor, drop-off area | — | deliveredAt | `-deliveredAt` |
| `GET /admin/vendors` | name, owner name, owner phone, city | `approvalStatus`, `subscriptionStatus`, `type`, `city` | createdAt | `-createdAt` (queue sends `submittedAt`) |
| `GET /admin/riders` | name, phone, plate, city | `approvalStatus`, `vehicleType`, `city`, `online=true\|false`, `nearOrderId`² | createdAt | `-createdAt` |
| `GET /admin/customers` | name, email, phone | `status` | createdAt | `-createdAt` |
| `GET /admin/payments` | reference, vendor, order code | `type`, `status`, `settlementStatus`, `channel`, `flagged=true` | createdAt | `-createdAt` |
| `GET /admin/subscriptions` | vendor, plan | `status`, `planId`, `interval` | currentPeriodEnd | `currentPeriodEnd` |
| `GET /admin/payouts` | rider name, reference | `status`, `month` (`YYYY-MM`) | createdAt | `-month` |
| `GET /admin/reports` | reason, reporter | `status`, `targetType` | createdAt | `-createdAt` |
| `GET /admin/tickets` | subject, name, number, order code | `status`, `priority`, `userRole`, `assignee` = `me` \| `none` \| admin id | updatedAt | `-updatedAt` |
| `GET /admin/users` | name, email | `adminRole`, `status` | createdAt | `name` |
| `GET /admin/audit-log` | summary, actor, action, target id | `actorRole`, `targetType`, `action` (prefix match) | createdAt | `-createdAt` |

¹ **Scoped lists** return only what the caller may see: customers their own, vendors their
store's, riders their trips, admins everything (with `orders.view` / `refunds.view`). A scoped
detail the caller may not see is a 404.

² `nearOrderId` returns only approved, online, free riders, nearest to that order's vendor first
(with `distanceM`), for manual reassignment.

## 4. Endpoints

All 162 operations, grouped like the contract. Request and response bodies are in
`docs/api/openapi.yaml`. "Who" is the role (or admin permission) the server must require.

### System

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Liveness check |

### Auth

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | Public | Sign up as a customer, vendor or rider (admins are created by a super admin) |
| `POST` | `/auth/login` | Public | Log in with email + password |
| `POST` | `/auth/otp/request` | Public | Send a login OTP by SMS |
| `POST` | `/auth/otp/verify` | Public | Verify an OTP and start a session |
| `POST` | `/auth/google` | Public | Sign in or sign up (as a customer) with a Google ID token (FR-ACC-05) |
| `POST` | `/auth/refresh` | Public | Rotate the refresh cookie and get a new access token |
| `POST` | `/auth/logout` | Signed in | End the session and clear the refresh cookie |
| `POST` | `/auth/password/forgot` | Public | Send a reset code to the phone or email |
| `POST` | `/auth/password/reset` | Public | Set a new password with the reset code |
| `GET` | `/me` | Signed in | The signed-in user |
| `PATCH` | `/me` | Signed in | Edit profile |
| `DELETE` | `/me` | Customer | Customer deletes their account (personal data removed, orders kept anonymised) |

### Uploads

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `POST` | `/uploads` | Signed in (purpose decides role) | Upload one image or document; returns the URL to send to other endpoints |

### Account

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/addresses` | Customer | Saved delivery addresses (default first) |
| `POST` | `/addresses` | Customer | Save an address (the first one becomes the default) |
| `PATCH` | `/addresses/{id}` | Customer | Update an address |
| `DELETE` | `/addresses/{id}` | Customer | Delete an address (another becomes default when needed) |
| `POST` | `/addresses/{id}/default` | Customer | Make an address the default |

### Catalogue

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/categories` | Public | Food categories |
| `GET` | `/feed` | Public | Home feed of food posts near a point (cursor pagination) |
| `GET` | `/food-items` | Public | Search food items |
| `GET` | `/food-items/{id}` | Public | One food item with its vendor |
| `GET` | `/vendors/{slug}` | Public | Vendor storefront (hidden when the subscription has lapsed, BR-SUB-06) |
| `GET` | `/vendors` | Public | Visible vendors (approved with a live plan) |

### Social

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `POST` | `/food-items/{id}/likes` | Customer | Like a food post (customers) |
| `DELETE` | `/food-items/{id}/likes` | Customer | Remove a like |
| `GET` | `/me/likes` | Customer | Food the signed-in customer liked |
| `GET` | `/food-items/{id}/comments` | Public | Top-level comments (newest first) with vendor replies, cursor paginated |
| `POST` | `/food-items/{id}/comments` | Customer; vendor (reply on own dish) | Comment (customers) or reply to a comment (the dish's vendor, parentId required) |
| `PATCH` | `/comments/{id}` | Author | Edit your own comment (sets editedAt) |
| `DELETE` | `/comments/{id}` | Author | Delete your own comment (shown as "Comment removed") |
| `POST` | `/reports` | Signed in | Report a comment or food post to the moderation queue |
| `POST` | `/vendors/{id}/follow` | Vendor | Follow a vendor (customers) |
| `DELETE` | `/vendors/{id}/follow` | Vendor | Unfollow a vendor |
| `GET` | `/me/follows` | Customer | Vendors the signed-in customer follows |

### Orders

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `POST` | `/checkout/quote` | Customer | Price a cart on the server (subtotal, delivery fee, processing fee, total, ETA) |
| `GET` | `/orders` | Signed in, scoped¹ | Orders scoped by role: customers their own, vendors their store's, riders their trips, admins (orders.view) all |
| `GET` | `/orders/{id}` | Signed in, scoped¹ | Order with vendor, rider, delivery route, payment and refund |
| `POST` | `/orders/{id}/cancel` | Customer | Customer cancels before the vendor accepts (FR-ORD-05); full refund |

### Payments

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `POST` | `/payments/initialize` | Customer | Start a Paystack transaction for the cart. No order exists yet (FR-ORD-03). |
| `POST` | `/payments/verify` | Customer | Confirm the payment with the gateway and create the order (idempotent) |
| `GET` | `/me/payments` | Customer | The customer's order payments (refunded when the order was cancelled or rejected) |

### Reviews

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `POST` | `/orders/{id}/reviews` | Customer | Customer rates the vendor or the rider of their delivered order (FR-SOC-06); once per target. Updates the target's rating and sets `ratedVendor` / `ratedRider` on the order. |
| `GET` | `/reviews` | Public | Public reviews of a vendor or rider |
| `POST` | `/reviews/{id}/reply` | Vendor | The vendor replies once to a review of their store |

### Refunds

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/refunds` | Signed in, scoped¹ | Refund requests scoped by role: customers their own, vendors their store's, admins (refunds.view) all |
| `POST` | `/refunds` | Customer | Customer asks for a refund on a delivered order (BR-REF-02); one per order, amount up to the food subtotal. The vendor must respond before `deadline`. |
| `GET` | `/refunds/{id}` | Signed in, scoped¹ | Refund with its full timeline |
| `POST` | `/refunds/{id}/confirm` | Customer | Customer confirms they received a refund the vendor marked as paid (BR-REF-04) |
| `POST` | `/refunds/{id}/dispute` | Customer | Customer disputes a paid or rejected refund; admins are notified (BR-REF-04) |
| `POST` | `/refunds/{id}/respond` | Vendor | The vendor accepts (full or part) or rejects a refund request before the deadline (BR-REF-03) |
| `POST` | `/refunds/{id}/mark-paid` | Vendor | The vendor records the refund payment reference; the customer is asked to confirm |
| `POST` | `/refunds/{id}/comments` | Admin · `refunds.view` | Internal team comment on a refund (BR-REF-05) |
| `POST` | `/refunds/{id}/escalate` | Admin · `refunds.escalate` | Escalate a refund; vendor and customer are told the team stepped in (BR-REF-05) |

### Notifications

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/notifications` | Signed in | The signed-in user's in-app notifications |
| `GET` | `/notifications/unread-count` | Signed in | Badge count for the bell |
| `POST` | `/notifications/{id}/read` | Signed in | Mark one notification as read |
| `POST` | `/notifications/read-all` | Signed in | Mark every notification as read |

### Support

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/support/tickets` | Customer, vendor, rider | The signed-in user's tickets (internal notes are never returned) |
| `POST` | `/support/tickets` | Customer, vendor, rider | Open a ticket, optionally about one of the user's orders |
| `GET` | `/support/tickets/{id}` | Customer, vendor, rider | One of the user's tickets with the conversation |
| `POST` | `/support/tickets/{id}/messages` | Customer, vendor, rider | Reply on a ticket; a waiting or resolved ticket opens again |
| `POST` | `/support/tickets/{id}/resolve` | Customer, vendor, rider | The user says their problem is solved |
| `GET` | `/orders/{id}/chat` | Customer or assigned rider | Customer–rider chat for an order (the customer and the assigned rider only) |
| `POST` | `/orders/{id}/chat` | Customer or assigned rider | Send a chat message while the order is rider_assigned or picked_up |

### Onboarding

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/vendor/onboarding` | Vendor | The signed-in vendor's application, saved step and approval status |
| `PATCH` | `/vendor/onboarding` | Vendor | Save one wizard step. Saved progress only moves forward. |
| `POST` | `/vendor/onboarding/submit` | Vendor | Send the application for admin review; status becomes pending (FR-VEN-02) |
| `POST` | `/vendor/documents` | Vendor | Attach an uploaded document. One per type; a new upload replaces the old one. |
| `DELETE` | `/vendor/documents/{id}` | Vendor | Remove a document before submitting |
| `GET` | `/banks` | Public | Nigerian banks supported for settlement (from Paystack) |
| `POST` | `/banks/resolve` | Signed in | Look up the account name for a bank account (Paystack resolve) |

### Subscriptions

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/plans` | Public | Plans on sale, cheapest first |
| `GET` | `/vendor/subscription` | Vendor | The vendor's plan status, current period and whether the free trial is still available |
| `GET` | `/vendor/subscription/invoices` | Vendor | The vendor's plan invoices |
| `POST` | `/vendor/subscription/trial` | Vendor | Start the free trial (once per business, after approval, no card) (BR-SUB-01) |
| `POST` | `/vendor/subscription/initialize` | Vendor | Start a Paystack payment for a first plan, a renewal or a prorated upgrade (BR-SUB-03) |
| `POST` | `/vendor/subscription/verify` | Vendor | Confirm the plan payment with the gateway and activate the plan (idempotent) |
| `POST` | `/vendor/subscription/change` | Vendor | Schedule a downgrade for the next renewal (BR-SUB-03) |
| `POST` | `/vendor/subscription/cancel` | Vendor | Cancel at period end; access continues until then (BR-SUB-02) |
| `POST` | `/vendor/subscription/resume` | Vendor | Undo a cancellation before the period ends |

### Vendor

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `POST` | `/orders/{id}/accept` | Vendor | Accept a paid order before its acceptDeadline |
| `POST` | `/orders/{id}/reject` | Vendor | Reject a paid or accepted order with a reason; the customer is refunded in full |
| `POST` | `/orders/{id}/preparing` | Vendor | Mark an accepted order as being prepared |
| `POST` | `/orders/{id}/ready` | Vendor | Mark as ready for pickup; dispatch starts looking for a rider |
| `GET` | `/vendor/stats` | Vendor | Overview numbers for today, waiting orders, rating, a daily sales series and top dishes |
| `GET` | `/vendor/sales` | Vendor | Food money per order with its Paystack settlement status |
| `GET` | `/vendor/sales/daily` | Vendor | Food sales per Lagos day, newest first |
| `GET` | `/vendor/menu` | Vendor | The vendor's own menu, including sold-out items |
| `POST` | `/vendor/menu` | Vendor | Add a menu item within the plan's item and photo limits |
| `GET` | `/vendor/menu/{id}` | Vendor | One of the vendor's menu items, with the plan limits |
| `PATCH` | `/vendor/menu/{id}` | Vendor | Edit a menu item, or just `{ isAvailable }` to mark it sold out / back on sale |
| `DELETE` | `/vendor/menu/{id}` | Vendor | Delete a menu item (past orders keep their own copy) |
| `GET` | `/vendor/store` | Vendor | Store settings (bank shown as the last 4 digits only) |
| `PATCH` | `/vendor/store` | Vendor | Update hours, pause orders, delivery radius, prep time or store page details (FR-VEN-03) |
| `POST` | `/vendor/bank-change` | Vendor | Ask to change the settlement account; it is resolved now and approved by an admin (BR-PAY-02) |
| `GET` | `/vendor/staff` | Vendor | Staff logins and the plan limit |
| `POST` | `/vendor/staff` | Vendor | Invite a staff member (manager or kitchen) |
| `DELETE` | `/vendor/staff/{id}` | Vendor | Remove a staff login |
| `GET` | `/vendor/engagement` | Vendor | Likes, followers, unanswered comments and most liked dishes |
| `GET` | `/vendor/comments` | Vendor | Customers' comments on the vendor's dishes; reply with POST /food-items/{id}/comments and parentId |

### Rider

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/rider/onboarding` | Rider | The rider's application, saved step and approval status |
| `PATCH` | `/rider/onboarding` | Rider | Save one wizard step |
| `POST` | `/rider/onboarding/submit` | Rider | Send the application for admin review (status pending) |
| `POST` | `/rider/documents` | Rider | Attach an uploaded document (one per type) |
| `DELETE` | `/rider/documents/{id}` | Rider | Remove a document before submitting |
| `GET` | `/rider/me` | Rider | Rider profile, online state, rating and payout account (last 4 digits) |
| `POST` | `/rider/status` | Rider | Go online (job offers start) or offline |
| `GET` | `/rider/offers` | Rider | Job offers still waiting for an answer |
| `POST` | `/deliveries/offers/{id}/accept` | Rider | Accept a job offer before it expires; the order moves to rider_assigned |
| `POST` | `/deliveries/offers/{id}/decline` | Rider | Decline (or let expire) a job offer; another offer follows while online |
| `GET` | `/rider/delivery` | Rider | The rider's current delivery, or null |
| `POST` | `/deliveries/{id}/pickup` | Rider | Confirm pickup at the vendor (order picked_up) |
| `POST` | `/deliveries/{id}/complete` | Rider | Hand over with the customer's 4-digit delivery code (order delivered) |
| `GET` | `/rider/trips` | Rider | Completed deliveries |
| `GET` | `/rider/earnings` | Rider | This month's trips, delivery fees and earnings (payout % of fees, BR-PAY-06) |
| `GET` | `/rider/statements` | Rider | Monthly payout statements, newest first |

### Admin

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/admin/overview` | Admin · `dashboard.view` | GMV and orders today, active deliveries, MRR, delivery-fee revenue, sign-ups, work waiting |
| `GET` | `/admin/vendors` | Admin · `vendors.view` | Vendors (not drafts) with filters |
| `GET` | `/admin/vendors/{id}` | Admin · `vendors.view` | Vendor detail with documents, full bank account, plan and 30-day numbers |
| `POST` | `/admin/vendors/{id}/approve` | Admin · `vendors.approve` | Approve a pending application; the owner is notified |
| `POST` | `/admin/vendors/{id}/reject` | Admin · `vendors.approve` | Reject a pending application with a reason the owner sees |
| `POST` | `/admin/vendors/{id}/suspend` | Admin · `vendors.approve` | Suspend an approved account with a reason |
| `POST` | `/admin/vendors/{id}/reinstate` | Admin · `vendors.approve` | Lift a suspension |
| `POST` | `/admin/vendors/{id}/bank-change/{decision}` | Admin · `vendors.approve` | Approve or reject a vendor's new settlement account (BR-PAY-02) |
| `GET` | `/admin/riders` | Admin · `riders.view` | Riders (not drafts) with online status, trips and rating |
| `GET` | `/admin/riders/{id}` | Admin · `riders.view` | Rider detail with licence, guarantor, documents, bank and recent trips |
| `POST` | `/admin/riders/{id}/approve` | Admin · `riders.approve` | Approve a pending application; the owner is notified |
| `POST` | `/admin/riders/{id}/reject` | Admin · `riders.approve` | Reject a pending application with a reason the owner sees |
| `POST` | `/admin/riders/{id}/suspend` | Admin · `riders.approve` | Suspend an approved account with a reason |
| `POST` | `/admin/riders/{id}/reinstate` | Admin · `riders.approve` | Lift a suspension |
| `GET` | `/admin/customers` | Admin · `customers.view` | Customers with order counts |
| `POST` | `/admin/customers/{id}/status` | Admin · `customers.ban` | Suspend, ban (reason required) or restore a customer |
| `POST` | `/admin/orders/{id}/reassign` | Admin · `orders.reassign` | Give an order to another rider before pickup (manual dispatch) |
| `GET` | `/admin/live-map` | Admin · `live_map.view` | Online riders and active deliveries (FR-GPS-04) |
| `GET` | `/admin/payments` | Admin · `payments.view` | Every transaction with its Paystack split, settlement and reconciliation flag (BR-PAY-08) |
| `POST` | `/admin/payments/{id}/reconcile` | Admin · `payments.view` | Clear a reconciliation flag with a note on how it was checked |
| `GET` | `/admin/plans` | Admin · `subscriptions.view` | All plans including retired, with how many vendors are on each |
| `POST` | `/admin/plans` | Admin · `subscriptions.manage` | Create a plan (BR-SUB-07) |
| `PATCH` | `/admin/plans/{id}` | Admin · `subscriptions.manage` | Edit a plan's price, limits, placement, analytics, popular flag or retire it |
| `GET` | `/admin/subscriptions` | Admin · `subscriptions.view` | Vendor subscriptions (trial, active, grace, expired), soonest to end first |
| `POST` | `/admin/subscriptions/{id}/extend` | Admin · `subscriptions.manage` | Complimentary extension; an expired or grace plan becomes active (BR-SUB-07) |
| `GET` | `/admin/payouts` | Admin · `payouts.manage` | Rider monthly payout statements |
| `POST` | `/admin/payouts/{id}/approve` | Admin · `payouts.manage` | Approve a draft statement (BR-PAY-06) |
| `POST` | `/admin/payouts/{id}/mark-paid` | Admin · `payouts.manage` | Record the bank transfer reference; the rider is notified |
| `GET` | `/admin/reports` | Admin · `moderation.manage` | Moderation queue of reported comments and dishes, with a preview of each |
| `POST` | `/admin/reports/{id}/resolve` | Admin · `moderation.manage` | Hide, remove or dismiss; every open report on the same thing is settled |
| `GET` | `/admin/tickets` | Admin · `support.manage` | Support inbox |
| `GET` | `/admin/tickets/{id}` | Admin · `support.manage` | Ticket with every message, including internal notes |
| `PATCH` | `/admin/tickets/{id}` | Admin · `support.manage` | Change status, priority or assignee |
| `POST` | `/admin/tickets/{id}/messages` | Admin · `support.manage` | Reply (the user is notified; open → pending) or add an internal note |
| `GET` | `/admin/agents` | Admin · `support.manage` | Admins who can answer tickets (for assignment) |
| `GET` | `/admin/settings` | Admin · `settings.manage` | Platform settings |
| `PATCH` | `/admin/settings` | Admin · `settings.manage` | Change fees, payout %, timeouts, trial/grace, refunds, service areas or templates (logged) |
| `GET` | `/admin/users` | Admin · `admin_users.manage` | Admin accounts |
| `POST` | `/admin/users` | Admin · `admin_users.manage` | Add an admin (they get an email to set a password) |
| `PATCH` | `/admin/users/{id}` | Admin · `admin_users.manage` | Change another admin's role or suspend / restore them |
| `GET` | `/admin/roles` | Admin · `admin_users.manage` | Admin sub-roles with their permissions, and every permission there is |
| `PATCH` | `/admin/roles/{id}` | Admin · `admin_users.manage` | Set a role's permissions (super_admin is locked; dashboard.view is required) |
| `POST` | `/admin/roles/{id}/reset` | Admin · `admin_users.manage` | Put a role back to its default permissions |
| `GET` | `/admin/audit-log` | Admin · `audit_log.view` | Admin actions and money events |

## 5. Real-time events (Socket.IO on port 4000)

The client connects with `io('http://localhost:4000', { auth: { token: accessToken }, transports: ['websocket'] })`
after login and reconnects with the new token after a refresh. Reject the connection when the
token is invalid. Put each socket in rooms by user, vendor, rider and order so events only reach
the right people.

| Direction | Event | Payload | Who / when |
| --- | --- | --- | --- |
| client → server | `order:subscribe` / `order:unsubscribe` | `{ orderId }` | Anyone allowed to see the order (customer, its vendor, its rider, admin) |
| server → client | `order:status` | `{ orderId, status, statusHistory, updatedAt, rider?, delivery? }` | Every status change of a subscribed order |
| server → client | `rider:location` | `{ orderId, riderId, lat, lng, heading, etaMins: [min, max], at }` | Rider position for a subscribed order |
| client → server | `vendor:subscribe` / `vendor:unsubscribe` | `{ vendorId }` | The vendor dashboard is open |
| server → client | `vendor:order:new` | `{ vendorId, orderId, code, total, acceptDeadline }` | A paid order reaches the vendor (plays a sound) |
| client → server | `rider:subscribe` / `rider:unsubscribe` | `{ riderId }` | The rider is online in the app |
| client → server | `rider:location` | `{ riderId, lat, lng, heading }` | Every ~8 s while online. Store it, append to the delivery route, forward to the order room |
| server → client | `rider:job:offer` | a `JobOffer` (see contract) | Dispatch offers a job; 30 s to answer |
| server → client | `chat:message` | `{ id, orderId, senderId, senderRole, senderName, body, createdAt }` | Customer–rider chat on an active delivery |
| client → server | `admin:live-map:subscribe` / `:unsubscribe` | — | Admin with `live_map.view` opens the live map |
| server → client | `admin:live-map` | the same body as `GET /admin/live-map` | Every few seconds while subscribed |

In-app notifications (`/notifications`) are created by the server for the events listed in each
rule below. A `notification:new` push is welcome but not required (the bell polls).

## 6. Rules the server must enforce

These are the behaviours the screens rely on. Each matches a BRD rule and a mock handler.

**Accounts**
- Sign-up is customer, vendor or rider only. Vendors and riders get an empty profile with
  `approvalStatus: "draft"`. Admins are created by `POST /admin/users`.
- Banned or suspended users get 403 `ACCOUNT_BANNED` / `ACCOUNT_SUSPENDED` at login and refresh.

**Catalogue and visibility (BR-SUB-06)**
- A store is public only when `approvalStatus = approved` **and** `subscriptionStatus` is
  `trial`, `active` or `grace` (or `active` with `cancelAtPeriodEnd`). Hidden stores and their
  dishes disappear from `/feed`, `/food-items`, `/vendors` and give 404 on detail pages.
- Dishes with `isHidden` (moderation) or deleted dishes are never public. Sold-out dishes stay
  visible with `isAvailable: false`.
- `distanceM` is from `lat`/`lng` in the query, else the user's default address, else central Lagos.

**Checkout and orders (BRD section 7)**
- Prices are always recomputed on the server (`/checkout/quote`, `/payments/initialize`). Delivery
  fee = `deliveryBaseFee + ceil(km) × deliveryPerKm`, capped at `deliveryMaxFee`. Processing
  fee = `processingFeePct`% of (subtotal + delivery) + `processingFeeFlat` when that is at least ₦2,500,
  capped at `processingFeeCap`. Out of the delivery radius → `OUT_OF_RANGE`.
- **An order is created only by `/payments/verify`** after Paystack confirms (verify is
  idempotent and should also be triggered by the Paystack webhook).
- Paystack split: food subtotal to the vendor's subaccount, delivery fee to KJT Foodie,
  processing fee paid by the customer.
- Status flow: `paid → accepted → preparing → ready_for_pickup → rider_assigned → picked_up →
  delivered`, plus `rejected` and `cancelled`. Only the vendor moves paid → ready; only the
  rider moves to picked_up and delivered (with the code); dispatch assigns riders.
- The customer may cancel only while `paid` (`CANNOT_CANCEL` after that).
- **Accept deadline**: `acceptDeadline = paid time + vendorAcceptTimeoutSec`. When it passes the
  order becomes `rejected` with reason "Not accepted in time" and is refunded in full (a job
  should do this; the mock does it when the vendor's orders are read).
- Rejecting (vendor, before preparing) needs a reason and refunds the customer in full.
- `deliveryCode` is returned only to the customer and admins, never to vendors or riders.
- Every change appends `{ status, at, by, note? }` to `statusHistory` and notifies the customer.

**Dispatch and riders**
- When an order is `ready_for_pickup`, offer it to the nearest online, approved, free rider in
  the same city (`rider:job:offer`, 30 s). Decline or timeout → next rider.
- Accept → `rider_assigned`. Pickup → `picked_up`. Complete with the right 4-digit code →
  `delivered`, rider earns `payoutPct`% of the delivery fee (the % at that moment is stored on
  the delivery). Wrong code → 422 on `code`.
- Rider location is only accepted while online. Admin reassignment is allowed before pickup.
- Monthly payout statements: trips, delivery fees, payout %, amount; `draft → approved → paid`
  (with a transfer reference).

**Vendors, plans and subscriptions (BRD section 4)**
- Onboarding steps save progress (`onboardingStep`) and can be revisited; submit needs every
  required document for the vendor type, a pin, and a resolved bank account. Editing is allowed
  only while `draft` or `rejected`.
- Bank accounts are resolved through Paystack before saving. Changing it later creates a
  `bankChangeRequest` an admin must approve.
- Free trial once per business, only after approval, no card (`TRIAL_USED`).
- Yearly price = 12 × monthly × (1 − `yearlyDiscountPct`/100). Upgrades are paid now (prorated
  against the unused part of the period); downgrades wait for renewal (`scheduledChange`).
  Cancel keeps access until the period ends.
- Plan limits: menu items, photos per item and staff logins (`PLAN_LIMIT`).
- Failed renewal → `grace` for `graceDays`, then `expired` (store hidden). Reminders 7 days and
  1 day before trial end / renewal.

**Refunds (BR-REF)**
- Customer asks on a delivered order (one per order, up to the food subtotal, optional photos).
- Vendor answers within `refundDeadlineHours` (accept full/part or reject with reason), then marks
  paid with a reference; the customer confirms or disputes. Every step goes on `timeline`.
- Missed deadline → `refundMissedAction` (`escalate`, `warn` or `suspend`). Admins can comment
  and escalate but never move vendor money.

**Social and moderation**
- Comments max 500 characters; vendors can only reply to comments on their own dishes; edited
  comments show `editedAt`; deleted ones become "Comment removed".
- Resolving a report (hide, remove, dismiss) settles every open report on the same target.

**Audit log**: every admin decision and every money event writes
`{ actorId, actorName, actorRole, action, targetType, targetId, summary, ip, createdAt }`.
Action names used by the screens: `vendor.approve|reject|suspend|reinstate`,
`rider.approve|…`, `customer.suspended|banned|active`, `order.reassign`, `payment.reconciled`,
`plan.created|updated`, `subscription.extended`, `payout.approved|marked_paid`,
`refund.escalated`, `settings.updated`, `role.updated|reset`, `admin_user.created|updated`,
`ticket.updated`, `comment.hidden|removed`, `food_item.hidden|removed`.

## 7. Uploads

The mocks accept images as data URLs inside JSON. The real backend uses `POST /uploads`
(multipart: `file` + `purpose`) and the frontend then sends the returned `url` in the usual
fields (`photos`, `logo`, `cover`, `documents[].url`, refund `photos`). Accept JPG, PNG and WebP
(and PDF for documents), up to 8 MB; store food photos as WebP, at most 1600 px wide and under
2 MB. Vendor and rider documents are private (signed, short-lived URLs; owner and admins only).

## 8. Seeder

Run with `npm run seed` (wipe and seed) on local and staging. It must be **deterministic** (fixed
random seed, we use `2026` with the `en_NG` Faker locale) so screenshots and tests see the same
data every time. Times are relative to "now" when the seeder runs.

### 8.1 Pictures: real photographs only

- **Every picture must be a real photograph.** No illustrations, cartoons, emoji, icons, AI
  images or generated placeholders (the mocks used SVG placeholders; the backend must not).
- Use `docs/backend/seed-images.json`: 78 photos of the 35 seeded dishes (1–3 each), 9 photos of
  real Nigerian food stalls, suya spots and kitchens for vendor covers, and 1 paperwork photo for
  sample documents. All are from Wikimedia Commons under CC0, public domain, CC BY or CC BY-SA;
  each comes with `credit { author, license, source }`.
- The seeder **downloads each file once and stores it through the upload pipeline** (our own
  storage/CDN), then saves our URL and keeps the credit (for example a `photoCredits` array next
  to `photos`). Don't hot-link Wikimedia from the app; it throttles that. Show the credit on the
  food detail page ("Photo: author, licence").
- Food item `photos`: take the dish's photos in order, up to the vendor's plan limit (Basic 1,
  Pro 3, Premium up to 3 available). Rotate the starting photo between vendors selling the same
  dish so the feed doesn't repeat the same picture side by side.
- Vendor `cover`: one of `vendorCovers`, rotated. Vendor `logo`: a square crop (centre, 400×400)
  of a real photo, the vendor's best-selling dish or its cover. No text logos.
- Category image (if you add one): the first photo of the category's first dish.
- Vendor and rider **documents** (ID, CAC, permits, licence, vehicle papers, guarantor form): use
  the paperwork photo for every document, with a "SAMPLE" label in the document name. **Never seed
  photos of real people's ID cards or certificates.**
- **User avatars**: `null` (the app shows initials). Don't seed photos of strangers' faces.
- Brand files (the KJT Foodie logo, app icons) live in the frontend `public/` folder and are not
  seeded.

### 8.2 Demo accounts (exact)

Every seeded account uses the password `password123`; every OTP is `123456`.

| ID | Email | Phone | Role | Who |
| --- | --- | --- | --- | --- |
| `usr_customer_ada` | `customer@kjtfoodie.test` | `+2348030000001` | customer | Ada Okafor; 2 addresses (Home in Yaba 6.5095, 3.3711 default; Work in Victoria Island 6.4281, 3.4219) |
| `usr_vendor_bisi` | `vendor@kjtfoodie.test` | `+2348030000002` | vendor | Bisi Adeyemi, owner of **Mama Put Kitchen** (`ven_mama_put`, slug `mama-put-kitchen`): restaurant, Yaba Lagos 6.5158, 3.3794, approved, **Pro** plan active monthly (renews in 9 days), rating 4.7 (312), 14 dishes, 2 staff |
| `usr_vendor_expired` | `expired.vendor@kjtfoodie.test` | `+2348030000003` | vendor | Chidi Eze, **Chidi Grills** (`ven_expired`), Lagos, approved, **Basic** plan **expired** (2–20 days ago) |
| `usr_vendor_new` | `new.vendor@kjtfoodie.test` | `+2348030000004` | vendor | Tolu Ogunleye, **Tolu's Pot** (`ven_new`): `approvalStatus: draft`, `onboardingStep: type`, no type, no address, no documents, no bank, no plan, trial unused |
| `rid_tunde` / `usr_rider_tunde` | `rider@kjtfoodie.test` | `+2348030000005` | rider | Tunde Bakare, approved, motorbike, Lagos 6.5122, 3.3801, offline, rating 4.8 |
| `rid_new` / `usr_rider_new` | `new.rider@kjtfoodie.test` | `+2348030000006` | rider | Kemi Adebayo, `draft`, nothing filled in |
| `usr_admin_super_admin` | `super@kjtfoodie.test` | — | admin `super_admin` | Kenneth Taiwo |
| `usr_admin_support` | `support@kjtfoodie.test` | — | admin `support` | Ifeoma Nwosu |
| `usr_admin_finance` | `finance@kjtfoodie.test` | — | admin `finance` | Musa Abdullahi |
| `usr_admin_dispatch` | `dispatch@kjtfoodie.test` | — | admin `dispatch` | Segun Alabi |
| `usr_admin_onboarding` | `onboarding@kjtfoodie.test` | — | admin `onboarding` | Zainab Bello |

Keeping these IDs is optional but makes the frontend tests easier to port.

### 8.3 Reference data

**Settings** (one row, editable via `/admin/settings`; money in kobo):

| Key | Value | Key | Value |
| --- | --- | --- | --- |
| `deliveryBaseFee` | 50000 | `trialDays` | 14 |
| `deliveryPerKm` | 15000 | `graceDays` | 3 |
| `deliveryMaxFee` | 300000 | `yearlyDiscountPct` | 15 |
| `processingFeePct` | 1.5 | `refundDeadlineHours` | 48 |
| `processingFeeFlat` | 10000 | `refundMissedAction` | `escalate` |
| `processingFeeCap` | 200000 | `riderPayoutPct` | 70 |
| `vendorAcceptTimeoutSec` | 300 | `riderOfferTimeoutSec` | 30 |
| `serviceAreas` | Lagos, Abuja, Port Harcourt, Ibadan, Enugu, Kano | `notificationTemplates` | `order_paid` (email), `order_on_the_way` (sms), `vendor_new_order` (sms), `subscription_reminder` (email); text in `src/mocks/utils/settings-defaults.js` |

**Plans**

| ID | Name | Monthly | Menu items | Photos per item | Staff | Search placement | Analytics | Popular |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `plan_basic` | Basic | ₦5,000 (`500000`) | 20 | 1 | 1 | `none` | `basic` | no |
| `plan_pro` | Pro | ₦12,000 (`1200000`) | 100 | 3 | 3 | `occasional` | `full` | yes |
| `plan_premium` | Premium | ₦25,000 (`2500000`) | unlimited (`null`) | 5 | 10 | `priority` | `export` | no |

**Categories** (`id`, name, slug, sortOrder 0–11): `cat-rice` Rice dishes · `cat-swallow` Swallow and
soups · `cat-grills` Grills and suya · `cat-small-chops` Small chops · `cat-pepper-soup` Pepper soup ·
`cat-beans` Beans and plantain · `cat-breakfast` Breakfast · `cat-pastries` Pastries and snacks ·
`cat-drinks` Drinks · `cat-seafood` Seafood · `cat-continental` Continental · `cat-desserts` Desserts.

**Dishes** (name, category, price range in naira; price rounded to ₦50; photos from
`seed-images.json` under the same name): the 35 rows of `DISHES` in
`src/mocks/seed/catalogue-data.js`, for example Party jollof rice (rice, ₦2,500–4,500), Pounded yam
and egusi (swallow, ₦3,000–5,500), Beef suya (grills, ₦2,000–5,000), Puff-puff (small chops,
₦800–1,500), Zobo 1 L (drinks, ₦800–1,500), Red velvet cake slice (desserts, ₦1,500–3,000). Each
dish also gets: portion (1 plate / 1 pack / Serves 1 / Serves 2 / 1 bowl), prepTimeMins 10–30,
`isAvailable` 92% true, `availableDays` all week, and option groups:

| Group | Required | Pick up to | Options (extra ₦) | Added to |
| --- | --- | --- | --- | --- |
| Extra protein | no | 3 | Chicken 1,000 · Beef 700 · Fried fish 1,200 · Boiled egg 300 · Goat meat 1,500 | rice, swallow, continental |
| Portion size | yes | 1 | Regular 0 · Large 1,000 · Family pack 4,000 | rice, grills, small chops, pepper soup |
| Sides | no | 2 | Fried plantain (dodo) 500 · Coleslaw 400 · Moi moi 800 | half of rice, beans, grills |

**Cities** (weight for random picks; areas; centre):

| City | State | Weight | Areas | Centre |
| --- | --- | --- | --- | --- |
| Lagos | Lagos | 5 | Yaba, Lekki Phase 1, Ikeja GRA, Surulere, Victoria Island, Ikoyi, Ajah, Gbagada | 6.5244, 3.3792 |
| Abuja | FCT | 3 | Wuse 2, Garki, Maitama, Gwarinpa, Jabi, Asokoro | 9.0765, 7.3986 |
| Port Harcourt | Rivers | 2 | GRA Phase 2, Rumuola, Trans Amadi, D-Line | 4.8156, 7.0498 |
| Ibadan | Oyo | 1 | Bodija, Ring Road, Dugbe, Challenge | 7.3775, 3.9470 |
| Enugu | Enugu | 1 | Independence Layout, New Haven, GRA | 6.4584, 7.5464 |
| Kano | Kano | 1 | Nassarawa GRA, Sabon Gari, Tarauni | 12.0022, 8.5920 |

Points are random within about 6–8 km of the centre.

**Banks** (`code`, name; for `/banks` use Paystack's list in production): 044 Access Bank ·
058 Guaranty Trust Bank · 011 First Bank of Nigeria · 033 United Bank for Africa · 057 Zenith Bank ·
070 Fidelity Bank · 232 Sterling Bank · 035 Wema Bank · 50211 Kuda Bank · 999992 OPay ·
50515 Moniepoint MFB · 214 First City Monument Bank. Seeded accounts are 10 random digits with
the owner's name in capitals as the account name. On local/staging, `/banks/resolve` should
return the user's name in capitals for any number and "account not found" for numbers ending in
`0000`, so both paths can be tested without Paystack.

**Required documents** (admin-editable):
restaurant: Government ID (NIN, passport or driver's licence), CAC certificate, Food-handling
permit · home cook: Government ID · rider: Government ID, Driver's or rider's licence, Vehicle
papers, Signed guarantor form.

### 8.4 Generated data

| What | How many / how |
| --- | --- |
| Customers | Ada + 70 Nigerian names (Faker `en_NG`), each with one default address in a weighted city; a few suspended (about 1 in 23) and banned (about 1 in 31) |
| Vendors | 3 demo + 45 more: 6 `pending` (submitted in the last 4 days, no plan), 1 `rejected` (reason "The CAC certificate is not readable. Please upload a clearer photo."), 1 `suspended`, the rest approved. 60% restaurants, 40% home cooks. Names like "Mama Nkechi Kitchen", "Suya Spot", "Iya Funke Bukka" (`VENDOR_NAME_PARTS`). Radius 5/8/10/15 km, prep 15–40 min, opening hours 08:00–10:00 to 20:00–22:00, Sunday from 12:00 and sometimes closed |
| Subscriptions | Approved vendors: 60% active, 20% trial (1–13 days left), 10% grace (failed renewal yesterday, 2 days of grace left), 10% expired. Monthly ⅔, yearly ⅓. Invoices: 1–6 past monthly invoices (1 for yearly), the latest `failed` for grace vendors; each invoice has a matching `subscription` payment |
| Dishes | Mama Put sells the first 14 dishes; other approved vendors 5–10 random dishes |
| Riders | Tunde, Kemi + 34 more (18 in Lagos): 4 `pending`, 1 `suspended`, rest approved; motorbike 60%, bicycle 20%, car 20%; 45% of approved riders online; each with guarantor, documents and bank |
| Orders | 360 over the last 90 days (Mama Put weighted ×3, Ada ×2): 20 delivered : 1.2 cancelled : 1 rejected. **Today, Mama Put**: 2 `paid` (1 and 2 min ago), 1 `accepted`, 1 `preparing`, 1 `ready_for_pickup`, 1 `rider_assigned`, plus **Ada's order `picked_up` with a rider** (live tracking demo). 26 more today across other vendors in mixed active states; 24 delivered trips for Tunde in the last 75 days |
| Payments | One per order: card 60% / transfer 30% / USSD 10%; settled after 1.5 days, `settling` before; about 1.5% flagged `amount_mismatch` or `missing_webhook`; refunded when the order was cancelled or rejected |
| Deliveries | One per order that had a rider, with fee, `riderEarning` (70% when delivered) and pickup/drop-off |
| Reviews | About 45% of delivered orders: vendor 5★ 6 : 4★ 3 : 3★ 1 : 2★ 0.5, rider 3–5★, short comments |
| Social | Each customer likes 2–25 dishes and follows 0–6 vendors (counts padded so the feed looks lively); 0–5 comments per dish from `COMMENT_LINES`, 35% with a vendor reply; 9 comment reports and 3 dish reports open |
| Refunds | About 20 on delivered orders (2 of Ada's, 4 of Mama Put's), statuses cycling requested, requested, accepted, paid, confirmed, rejected, disputed, escalated, with matching timelines |
| Payout statements | Last 3 months for each approved rider (Tunde 60–110 trips/month); older months `paid`, last month draft/approved/paid |
| Support tickets | 11 (Ada, Bisi, Tunde, 6 customers, 2 vendors) about real problems ("Payment debited but no order", "My payout is late"…), open/pending/resolved/closed, replies and an internal note from the Support admin |
| Notifications | Created by the flows above (order, refund, subscription, payout) |
| Audit log | 60 entries over the last 30 days across the action names in section 6 |

## 9. Checking your work

- Point the frontend at the backend (section 1) and walk the four journeys: customer orders and
  tracks, vendor accepts and marks ready, rider delivers with the code, admin approves a vendor.
  The Playwright specs in `tests/e2e/` describe them step by step.
- For each feature, the integration tests in `src/**/*.test.jsx` show what the screen sends and
  expects. A mismatch is fixed in the contract first, then on whichever side was wrong.
- When an endpoint is live on staging, tell the frontend team so we delete its mock handler.
