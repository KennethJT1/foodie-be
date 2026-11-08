# KJT Foodie: switching the frontend to the real backend API

2026-11-08 · From the backend team

The backend now serves every endpoint in `docs/api/openapi.yaml` (162 operations) plus the
Socket.IO events. The app can run on real data by changing configuration; no screens need
rewriting.

**Keep the mocks.** Do not delete `src/mocks/`. Mock mode stays as the offline and test mode:
`VITE_USE_MOCKS=true` keeps working exactly as today (Vitest, the Playwright journeys, working
without a backend). Only local development and deployed environments switch to the real API.

What we need from you:

1. Add the real-API settings and the Vite proxy below.
2. Check the differences in [Where the backend differs from the mocks](#5-where-the-backend-differs-from-the-mocks).
3. Walk the four journeys against the real API and send us anything that doesn't match.

## 1. Turning the real API on

The app already reads everything from `src/lib/env.js`; only the values change. Keep one env
file per mode (for example `.env.development.local` for the real API and `.env.mock` for mocks)
so switching back is one line.

| Variable | Real API (local) | Mocks (unchanged) |
| --- | --- | --- |
| `VITE_USE_MOCKS` | `false` | `true` |
| `VITE_API_URL` | `/api/v1` (through the proxy below) | `/api/v1` |
| `VITE_SOCKET_URL` | `http://localhost:4000` | ignored |
| `VITE_PAYSTACK_PUBLIC_KEY` | empty locally (see Payments below) | any value |

Add a dev proxy to `vite.config.js` so API calls are same-origin and the refresh cookie works
without CORS cookie settings:

```js
server: {
  port: 5173,
  proxy: { '/api': 'http://localhost:4000' },
},
```

- Socket.IO connects straight to `http://localhost:4000` (path `/socket.io`, websocket
  transport), not through the proxy.
- The backend allows CORS from `http://localhost:5173`, `5174` and `4173` (dev server,
  Playwright, `vite preview`). Any other origin must be added to the backend's `CORS_ORIGINS`.
- Deployed builds: set `VITE_API_URL=https://<api host>/api/v1` and
  `VITE_SOCKET_URL=https://<api host>`. The backend then needs your origin in `CORS_ORIGINS`
  and, because the frontend and API are on different sites, `COOKIE_SAME_SITE=none` and
  `COOKIE_SECURE=true`. Tell us the host and we'll set them.
- Production builds with `VITE_USE_MOCKS=false` tree-shake `src/mocks` away, so keeping the
  folder costs nothing.

### Payments

`startPayment()` already shows the simulated Paystack sheet when there is no public key. The
backend does the same thing without its Paystack secret key: it returns a fake `accessCode` and
treats `POST /payments/verify` as a successful card payment. So:

| Frontend `VITE_PAYSTACK_PUBLIC_KEY` | Backend `PAYSTACK_SECRET_KEY` | Result |
| --- | --- | --- |
| empty | empty | Simulated sheet; the order is created on verify. **Use this locally.** |
| test public key | test secret key | Real Paystack test popup and test cards. |
| set on one side only | | Broken: the popup gets a fake access code. Don't do this. |

## 2. Running the backend locally

Requirements: Node 20+, MySQL 8, Redis 7. Full steps are in the backend `README.md`.

```bash
cp .env.example .env          # fill in DB_*, REDIS_URL, JWT secrets
npm ci
npm run db:migrate
npm run seed                  # wipes and loads the demo world (never on production)
npm run dev                   # API + Socket.IO on http://localhost:4000
npm run dev:worker            # second terminal: background jobs
```

Run the worker as well as the API. Without it these never happen:

- a paid order that the vendor doesn't accept in 5 minutes is rejected and refunded;
- a rider's job offer expires after 30 seconds and moves to the next rider;
- SMS and email are sent;
- a refund's missed deadline is acted on.

`npm run scheduler` registers the hourly and monthly jobs (renewals, settlement, payout
statements). Run it once; it exits.

`npm run seed` rebuilds the same demo world every time, with times relative to now. Run it again
whenever you want today's live orders back.

## 3. Demo accounts and IDs

Every seeded account uses password `password123`. Every OTP is `123456` (outside production).

| Login | Role | Who |
| --- | --- | --- |
| `customer@kjtfoodie.test` | customer | Ada Okafor, live order on its way with a rider |
| `vendor@kjtfoodie.test` | vendor | Bisi Adeyemi, Mama Put Kitchen (today's live queue) |
| `expired.vendor@kjtfoodie.test` | vendor | Chidi Grills, plan expired |
| `new.vendor@kjtfoodie.test` | vendor | Tolu's Pot, onboarding not started |
| `rider@kjtfoodie.test` | rider | Tunde Bakare, approved, offline, 24 trips |
| `new.rider@kjtfoodie.test` | rider | Kemi Adebayo, onboarding not started |
| `super@kjtfoodie.test` | admin | Super admin |
| `support@kjtfoodie.test` | admin | Support |
| `finance@kjtfoodie.test` | admin | Finance |
| `dispatch@kjtfoodie.test` | admin | Dispatch |
| `onboarding@kjtfoodie.test` | admin | Onboarding |

**IDs are UUIDs, not the mock's readable strings.** `usr_customer_ada`, `ven_mama_put` and the
like don't exist in the real API. Generated rows get UUID v7; the fixed demo rows get stable UUIDs
that don't change between reseeds:

| Demo row | Mock ID | Real ID |
| --- | --- | --- |
| Ada (customer) | `usr_customer_ada` | `0c0a0515-0455-570e-83ce-74f917871add` |
| Bisi (vendor user) | `usr_vendor_bisi` | `5aac0f78-bfee-5921-982e-afb195638291` |
| Mama Put Kitchen | `ven_mama_put` | `0ecd0425-3297-5758-908c-bbd6d300acfe` |
| Tunde (rider profile) | `rid_tunde` | `e0d63026-c8f8-5408-b070-2ec7df8511da` |
| Basic plan | `plan_basic` | `e2940a83-9a3a-5562-bbd1-34439452af37` |
| Pro plan | `plan_pro` | `d389d116-d68d-5332-b354-9b998abbd1e3` |
| Premium plan | `plan_premium` | `aa87cd0b-96d5-5361-8a79-dde94af97ff6` |

Don't hard-code any of these in app code; read IDs from responses. Slugs (`mama-put-kitchen`)
are unchanged.

## 4. Auth and real time

Auth works as the contract says and `api-client.js` already handles it:

- `POST /auth/login` returns `{ accessToken, user }` and sets the refresh token as an httpOnly
  cookie `kjt_refresh`. The access token lasts 15 minutes.
- On 401 the client calls `POST /auth/refresh` once and retries; a failed refresh ends the
  session.
- Banned or suspended accounts get 403 `ACCOUNT_BANNED` / `ACCOUNT_SUSPENDED` on every request,
  not just at login.

Socket.IO: connect with `io(VITE_SOCKET_URL, { auth: { token: accessToken }, transports: ['websocket'] })`.
`src/lib/socket.js` already does this.

- A missing, invalid or expired token is refused with `connect_error`, whose message is
  `UNAUTHENTICATED`, `ACCOUNT_BANNED` or `ACCOUNT_SUSPENDED`. After a token refresh, reconnect
  with the new token.
- The server does not disconnect a connected socket when its token expires.
- Every socket joins its own user room automatically. Other rooms are joined on request, after
  an access check:

| Client emits | Who may join | Server then emits |
| --- | --- | --- |
| `order:subscribe` / `order:unsubscribe` `{ orderId }` | the customer, the order's vendor, its rider, admins with `orders.view` | `order:status`, `rider:location`, `chat:message` |
| `vendor:subscribe` / `vendor:unsubscribe` `{ vendorId }` | the store's owner | `vendor:order:new` |
| `rider:subscribe` / `rider:unsubscribe` `{ riderId }` | that rider | `rider:job:offer` |
| `admin:live-map:subscribe` / `:unsubscribe` | admins with `live_map.view` | `admin:live-map` now, then every 5 s |
| `rider:location` `{ riderId, lat, lng, heading }` | the rider, while online | forwarded to the order room during a delivery |

- **Acknowledgements (new, optional).** Every subscribe and `rider:location` accepts an ack
  callback: `{ ok: true }` or `{ ok: false, error: { code, message } }`. A room you may not join
  answers `NOT_FOUND`, like REST; the live map answers `FORBIDDEN`. Ignoring the ack is fine.
- `order:status` is `{ orderId, status, statusHistory, updatedAt, rider?, delivery? }`, sent after
  each committed change. `rider` and `delivery` are present once a rider is assigned.
- `notification:new` (a Notification) is pushed for every new in-app notification, so the bell
  can update without polling.
- `chat:message` reaches the order room and both people in the chat.
- `rider:location` sends `heading` as a whole number of degrees, or `null`.

## 5. Where the backend differs from the mocks

The contract (`openapi.yaml`) won wherever it and the mock disagreed. These are the differences
the UI is most likely to notice:

**Nothing moves by itself.** The mock simulates the world: it advances orders, moves riders, sends
a new demo order every minute and replies in chat. The real API only changes when someone acts:

- the vendor accepts, prepares and marks ready;
- dispatch offers the job to the nearest free online rider (`rider:job:offer`, 30 seconds);
- the rider accepts, picks up and completes with the customer's 4-digit code.

To demo the whole flow, use a vendor, a rider and a customer in three browser profiles. Make the
rider go online first (`POST /rider/status`).

| Area | Mock | Real API |
| --- | --- | --- |
| Notification `type` | also `delivery`, `chat`, `support`, `moderation`, `vendor`, `rider` | only the contract enum: `order`, `refund`, `social`, `review`, `subscription`, `payout`, `system`. Delivery and chat notices are `order`; support and onboarding are `system` |
| `Review.reply` | `{ body, createdAt }` | a string or `null`, plus a new `repliedAt` field |
| Duplicate sign-up | 422 | 409 `CONFLICT` with `fieldErrors.phone` / `fieldErrors.email` |
| Bad `targetType` on a review | 400 | 422 with `fieldErrors.targetType` |
| 409 codes the contract left blank | no code | `INVALID_STATUS` (wrong state), `ALREADY_SUBMITTED` (already reviewed, already requested a refund, already replied), `OFFER_GONE` (job taken or expired) |
| Unaccepted order | rejected on the next read | rejected and refunded by the worker at `acceptDeadline` (and on vendor reads) |
| Attached files | any URL | must be the user's own upload from `POST /uploads` with the right `purpose` (for example `refund_photo`), otherwise 422 on that field |
| Refund `comments` | always present | only returned to admins (internal notes) |
| Staff | — | staff are records counted against the plan; they can't log in yet |
| Order detail | `delivery`, `refund` mocked | real `delivery` (with its `route`) and `refund` |

## 6. Checklist

- [ ] Real-API env file and Vite proxy added; mock mode still works with `VITE_USE_MOCKS=true`.
- [ ] No hard-coded demo IDs in app code.
- [ ] Notification icons handle the seven contract types.
- [ ] Review replies read `reply` as a string.
- [ ] Journey 1, customer: log in as Ada, order, pay (simulated sheet), track live, chat with the rider, rate, ask for a refund.
- [ ] Journey 2, vendor: log in as Bisi, hear the new order, accept, prepare, mark ready, answer a refund.
- [ ] Journey 3, rider: log in as Tunde, go online, accept the offer, pick up, complete with the customer's code.
- [ ] Journey 4, admin: log in as onboarding, approve a pending vendor; as dispatch, watch the live map.

The Playwright specs in `tests/e2e/` rely on mock-only hooks (`window.__kjtMocks.configureSimulation`
and `deliveryCode`), so they stay on mock mode, as `playwright.config.js` already sets. Walk the
journeys by hand on the real API. If you want automated real-API runs, we can add a test-only
endpoint for the delivery code.

**Reporting mismatches:** for anything that doesn't match, send the endpoint, the request, what came
back and what the screen expected. We fix the contract first, then whichever side was wrong.
Reference docs: `docs/api/openapi.yaml` (shapes), `docs/05-backend-handoff.md` (rules and seed
data), `docs/postman/kjt-foodie-api.postman_collection.json` (every endpoint, runnable).
