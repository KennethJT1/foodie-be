# KJT Foodie — Business Requirements Document

Oct 28, 2026 · @Lorem Backend

## 1. Executive summary

KJT Foodie is a web-based, multi-vendor food marketplace for Nigeria. Vendors pay a monthly or yearly subscription to list their food, customers browse, like, comment and order, and the platform's own riders deliver with live GPS tracking.

The platform earns **only from vendor subscriptions** and from the delivery fees that fund its riders. Paystack splits each customer payment at checkout: the food amount goes to the vendor's Paystack subaccount and is settled to their registered bank account on Paystack's schedule (usually the next business day). Refunds are settled between vendor and customer, but every refund must be recorded on the platform for audit.

Four roles each get their own dashboard: Admin, Vendor, Customer and Rider.

| Item | Value |
| --- | --- |
| Document type | Business Requirements Document (BRD) |
| Version | 0.1 (draft for review) |
| Launch market | Nigeria, NGN, all cities |
| First release | Responsive web app (mobile apps later) |
| Payment gateway | Paystack (split payments to vendor subaccounts) |

## 2. Objectives, scope and assumptions

### Business objectives

1. Give food vendors an online storefront and delivery service for a fixed monthly or yearly fee, with no per-order commission.
2. Let customers discover food, engage with it socially (likes, comments) and order with live delivery tracking.
3. Give the business full visibility of vendors, orders, payments, riders and refunds from one admin dashboard.
4. Generate recurring revenue from vendor subscriptions.

### In scope (release 1)

- Responsive web app for customers, vendors, riders and admin
- Vendor onboarding, verification and subscription billing (trial, tiers, monthly/yearly)
- Menu and food posting with photos, prices and availability
- Social features: like, comment, follow vendors
- Cart, checkout and online payment (card, bank transfer, USSD)
- Direct settlement of food payments to the vendor's bank account
- Platform-employed rider management, order assignment and live GPS tracking
- Refund recording and audit trail
- Notifications (in-app, email, SMS)
- Dashboards and reports for all four roles

### Out of scope (release 1)

- Native Android and iOS apps
- Cash on delivery and in-app wallets
- Countries and currencies other than Nigeria/NGN
- Third-party logistics companies and vendor-owned riders
- Loyalty points, coupons and promo campaigns (candidate for release 2)

### Assumptions

- Every vendor has a Nigerian bank account and can complete the gateway's subaccount verification (BVN/NUBAN).
- Riders use a smartphone browser with location turned on while on duty.
- Paystack split payments send the food amount to each vendor's subaccount and the delivery fee to KJT Foodie.

## 3. Stakeholders and user roles

| Role | Who they are | Main goals | Pays / earns |
| --- | --- | --- | --- |
| Admin (Super admin, Support, Finance, Dispatch) | Platform operators | Approve vendors and riders, oversee orders, manage subscriptions, resolve disputes, audit payments | Receives subscription and delivery-fee revenue |
| Vendor | Restaurants, home cooks, caterers | Post food, receive and fulfil orders, get paid, grow followers | Pays subscription; receives food payments directly |
| Customer | People ordering food | Discover food, like/comment, order, track delivery, request refunds | Pays food price + delivery fee |
| Rider | Riders employed or contracted by the platform | Accept delivery jobs, navigate, confirm pickup and drop-off | Paid monthly by the platform: an admin-set % of the delivery fees on their completed deliveries |

Admin is split into sub-roles with role-based permissions, so a support agent cannot, for example, change subscription prices.

## 4. Business model: vendor subscriptions

Vendor subscriptions are the platform's only source of profit. Admin sets all plan prices, the yearly discount and the trial length in the admin dashboard; the tier limits below are a proposed starting point.

| Feature | Basic | Pro | Premium |
| --- | --- | --- | --- |
| Monthly price (NGN) | Set by admin | Set by admin | Set by admin |
| Yearly price (NGN) | 12 × monthly, minus an admin-set discount | Same rule | Same rule |
| Menu items | Up to 20 | Up to 100 | Unlimited |
| Photos per item | 1 | 3 | 5 |
| Featured placement in search | No | Occasional | Priority |
| Analytics on vendor dashboard | Basic sales | Full sales + engagement | Full + export |
| Staff logins per vendor | 1 | 3 | 10 |

### Rules

- **BR-SUB-01** New vendors get a free trial (length set by admin, e.g. 14 days) once per business, after admin approval.
- **BR-SUB-02** Subscriptions renew automatically on the gateway's recurring billing; the vendor can cancel any time and keeps access until the period ends.
- **BR-SUB-03** Vendors can upgrade at any time (prorated) and downgrade at the next renewal.
- **BR-SUB-04** Reminders go out 7 days and 1 day before renewal or trial end.
- **BR-SUB-05** If payment fails, a grace period (proposed 3 days) applies with daily retries.
- **BR-SUB-06** When the trial or grace period ends unpaid, the vendor's storefront and menu are **hidden from customers**. Orders already in progress are completed. Data is kept so the vendor can reactivate.
- **BR-SUB-07** Admin can create, edit and retire plans, set prices and discounts, and grant complimentary extensions, all logged.

## 5. Payments and money flow

Paystack splits each customer payment at checkout: the food amount goes to the vendor's subaccount and the delivery fee to KJT Foodie. KJT Foodie never holds vendor money.

### Rules

- **BR-PAY-01** Customers pay by debit/credit card, bank transfer or USSD through Paystack. No cash on delivery in release 1.
- **BR-PAY-02** Each vendor registers and verifies one settlement bank account during onboarding; it becomes the vendor's Paystack subaccount. Changing it requires re-verification and an admin approval, and is logged.
- **BR-PAY-03** At checkout Paystack splits the payment: 100% of the food subtotal to the vendor's subaccount, the delivery fee to KJT Foodie's account. The Paystack transaction fee is paid by the customer: it is added to the order total and shown at checkout.
- **BR-PAY-04** Paystack settles each vendor's subaccount to their bank account on the next business day (T+1). The vendor sees each payment on their dashboard at once, marked "settling" until Paystack pays it out. *If the vendor rejects the order or does not accept in time, the customer is refunded in full: the vendor refunds the food amount and the platform refunds the delivery fee.*
- **BR-PAY-05** Vendor subscription payments go to the platform's account and are billed through the gateway's recurring-billing feature.
- **BR-PAY-06** Riders are paid monthly by the platform from delivery-fee revenue. Admin sets a rider payout percentage (e.g. 70%); for each completed delivery the rider earns that % of the delivery fee. At month end the system totals each rider's earnings into a payout statement; Finance approves it, pays by bank transfer and marks it paid with a reference. A changed % applies only to deliveries after the change, and every change is logged. Cancelled or failed deliveries earn nothing unless admin overrides.
- **BR-PAY-07** The delivery fee is calculated by distance from vendor to customer (base fee + rate per km, set by admin).
- **BR-PAY-08** Every transaction (order payment, split, subscription charge, refund) is stored with its gateway reference and reconciled daily against gateway webhooks, including each vendor's settlement status.

### Refunds

- **BR-REF-01** Refunds for food are agreed and paid between the vendor and the customer; KJT Foodie does not hold or return food money.
- **BR-REF-02** A customer raises a refund request on the order in the app, with a reason and optional photos.
- **BR-REF-03** The vendor accepts (full or partial amount) or rejects it, with a reason, within a response deadline set by admin. If the deadline passes, the system takes the action admin has configured (e.g. escalate to admin, warn or suspend the vendor). If accepted, the vendor pays the refund (e.g. through the gateway's refund API from their subaccount, or by bank transfer) and marks it paid with a reference.
- **BR-REF-04** The customer confirms receipt or disputes it. Every step is time-stamped and visible to admin for audit.
- **BR-REF-05** Admin can view, comment on and escalate any refund but cannot move vendor funds. Vendors with repeated unresolved refunds can be flagged or suspended.
- **BR-REF-06** If the order is cancelled before the rider picks it up because the vendor cannot fulfil it, the delivery fee is refunded by the platform.

## 6. Functional requirements

Priority: **M** = must have for launch, **S** = should have, **C** = could have.

### 6.1 Accounts and access

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-ACC-01 | Sign up and log in with phone number (OTP) or email + password | M |
| FR-ACC-02 | Separate sign-up flows for customer, vendor and rider; admins are created by a super admin | M |
| FR-ACC-03 | Role-based permissions for admin sub-roles | M |
| FR-ACC-04 | Password reset, profile edit, saved delivery addresses | M |
| FR-ACC-05 | Sign in with Google | M |

### 6.2 Vendor onboarding and storefront

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-VEN-01 | Vendor picks a type (registered restaurant or home cook) and submits that type's documents. Both: name, address, government ID, bank details. Registered restaurants also: CAC certificate and food-handling permit. Home cooks: no CAC required. Admin can edit the required list per type | M |
| FR-VEN-02 | Admin reviews, approves or rejects with a reason; vendor is notified | M |
| FR-VEN-03 | Vendor sets opening hours, delivery radius, preparation time and can pause orders | M |
| FR-VEN-04 | Storefront page with logo, cover photo, description, rating, followers | M |

### 6.3 Food posting and catalogue

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-FOOD-01 | Vendor posts food items with name, photos, description, price, category, portion size, prep time | M |
| FR-FOOD-02 | Add-ons and variants (e.g. extra protein, size) with prices | M |
| FR-FOOD-03 | Mark items available/sold out; schedule availability by day | M |
| FR-FOOD-04 | Item count and photo limits enforced by subscription tier | M |
| FR-FOOD-05 | Admin can hide or remove items that break content rules | M |

### 6.4 Discovery and social

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-SOC-01 | Home feed of food posts near the customer, newest and most popular | M |
| FR-SOC-02 | Search and filter by food name, vendor, cuisine, price, distance, rating | M |
| FR-SOC-03 | Like a food post; show like counts | M |
| FR-SOC-04 | Comment on a food post; vendor can reply; users can report comments | M |
| FR-SOC-05 | Follow a vendor and get notified of new posts | M |
| FR-SOC-06 | Rate and review vendor and rider after delivery (verified orders only) | M |
| FR-SOC-07 | Share a food post link to WhatsApp and other apps | S |
| FR-SOC-08 | Admin moderation queue for reported comments and posts | M |

### 6.5 Cart, checkout and orders

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-ORD-01 | Cart holds items from **one vendor per order** | M |
| FR-ORD-02 | Checkout shows food subtotal, delivery fee, payment processing fee, total and estimated delivery time | M |
| FR-ORD-03 | Pay by card, bank transfer or USSD; order is created only after the gateway confirms payment | M |
| FR-ORD-04 | Customer can add delivery notes and choose a saved address or drop a pin on the map | M |
| FR-ORD-05 | Customer can cancel before the vendor accepts | M |
| FR-ORD-06 | Order history with receipts and reorder | M |
| FR-ORD-07 | Scheduled orders for a later time | M |

### 6.6 Riders and dispatch

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-RID-01 | Rider registers with ID, driver's licence, vehicle type and plate, guarantor; admin approves | M |
| FR-RID-02 | Rider sets status online/offline; location is shared only while online | M |
| FR-RID-03 | System offers each ready order to the nearest available rider; rider accepts or declines within a time limit, then it goes to the next | M |
| FR-RID-04 | Dispatch admin can assign or reassign a rider manually | M |
| FR-RID-05 | Rider sees pickup and drop-off on a map with directions | M |
| FR-RID-06 | Rider confirms pickup and delivery; delivery confirmed with a 4-digit code from the customer | M |
| FR-RID-07 | Rider sees completed trips, earnings so far this month at the current payout %, and past monthly payout statements | M |

### 6.7 GPS tracking

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-GPS-01 | Rider's location updates every 5–10 seconds while on a delivery | M |
| FR-GPS-02 | Customer sees the rider moving on a live map with ETA after pickup | M |
| FR-GPS-03 | Vendor sees the rider's approach for pickup | M |
| FR-GPS-04 | Admin sees all online riders and active deliveries on one live map | M |
| FR-GPS-05 | Route history stored per delivery for disputes | M |

### 6.8 Notifications

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-NOT-01 | In-app and email notifications for every order status change | M |
| FR-NOT-02 | SMS for OTP, new orders to vendors and delivery codes | M |
| FR-NOT-03 | Subscription reminders, payment failures and expiry notices to vendors | M |
| FR-NOT-04 | Browser push notifications | M |
| FR-NOT-05 | WhatsApp notifications | C |

### 6.9 Support and disputes

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-SUP-01 | Customers, vendors and riders can open a support ticket linked to an order | M |
| FR-SUP-02 | Admin support inbox with status, assignee and notes | M |
| FR-SUP-03 | In-app chat between customer and rider during delivery | M |

## 7. Order and delivery lifecycle

An order exists only after the gateway confirms payment, and closes only when the customer gives the rider their delivery code.

&#91;embedded content: order lifecycle · 7 steps, 1 decision\]

| Status | Set by | What happens | Who is notified |
| --- | --- | --- | --- |
| Paid | System (gateway webhook) | Payment split: food to vendor's subaccount, delivery fee to KJT Foodie | Customer, vendor |
| Accepted / Rejected | Vendor (within a time limit, proposed 5 min; no answer = auto-reject) | Rejected or no answer: vendor refunds food, platform refunds delivery fee | Customer |
| Preparing | Vendor | Countdown from the vendor's prep time | Customer |
| Ready for pickup | Vendor | Order offered to the nearest online rider; if declined or no answer in 30 s, the next rider; dispatch admin can assign manually | Riders, customer |
| Rider assigned | Rider accepts | Rider heads to vendor; vendor sees rider approaching | Vendor, customer |
| Picked up | Rider | Live GPS map and ETA open for the customer | Customer |
| Delivered | Rider enters customer's 4-digit code | Trip added to rider earnings; customer asked to rate vendor and rider | All |
| Refund requested | Customer (after delivery or failed delivery) | Follows the refund rules in section 5 | Vendor, admin |

## 8. Dashboards and reports

Each role sees only its own data; admin sees everything.

### Admin dashboard

- **Overview:** today's orders, active deliveries, GMV (total food sales through the platform), subscription revenue (MRR/ARR), delivery-fee revenue, new sign-ups
- **Vendors:** approval queue, list with status (trial, active, grace, expired, suspended), plan, sales, rating, refund rate
- **Customers:** list, order history, reports and bans
- **Riders:** approval queue, online/offline, live map, trips and earnings per rider, ratings, month-end payout statements to approve and mark paid, payroll export
- **Orders:** every order with live status, filters, and manual rider reassignment
- **Payments:** all transactions with gateway references, split amounts, vendor settlement status, daily reconciliation, failed payments
- **Subscriptions:** plans and pricing, renewals due, failed renewals, churn
- **Refunds and disputes:** every refund request with its full timeline (audit log), escalations
- **Moderation:** reported posts and comments
- **Settings:** delivery-fee formula, rider payout %, service areas, admin users and permissions, notification templates
- **Audit log:** who changed what and when, for every admin action

### Vendor dashboard

- Live order queue with sound alert: accept/reject, mark preparing, mark ready
- Menu management and availability
- Sales and payouts received (per order, per day, per month), downloadable
- Engagement: likes, comments, followers, top items, ratings
- Refund requests to accept/reject and mark as paid
- Subscription: current plan, renewal date, upgrade/downgrade, invoices
- Store settings: hours, delivery radius, bank account (change needs approval)

### Customer dashboard

- Active order with live rider map and status
- Order history, receipts, reorder
- Liked posts, followed vendors, comments
- Refund requests and their status
- Addresses, payment history, profile

### Rider dashboard

- Online/offline toggle
- Incoming job offers with pickup, drop-off, distance and fee
- Active delivery with map directions, call/chat customer, confirm pickup and delivery code
- Trip history and earnings summary (daily, weekly, monthly)
- Ratings received

## 9. Non-functional requirements

| ID | Area | Requirement |
| --- | --- | --- |
| NFR-01 | Devices | Responsive web; works on low-end Android phones over 3G; installable as a PWA |
| NFR-02 | Performance | Pages load in under 3 s on 3G; rider location reaches the customer map within 10 s |
| NFR-03 | Availability | 99.5% uptime; orders and payments survive a server restart (no lost orders) |
| NFR-04 | Scale | Launch target 500 vendors, 20,000 customers, 200 riders, 2,000 orders/day; can grow 10× |
| NFR-05 | Security | HTTPS everywhere; no card data stored (gateway handles it); hashed passwords; OTP for sensitive changes |
| NFR-06 | Payments integrity | Payment confirmed only by verified gateway webhooks; idempotent order creation |
| NFR-07 | Audit | Every money event, refund step and admin action logged, read-only, kept 7 years |
| NFR-08 | Privacy | Complies with the Nigeria Data Protection Act 2023; rider location collected only while on duty; customer can delete account |
| NFR-09 | Usability | Order in 3 taps from a food post; English first, Pidgin/Yoruba/Hausa/Igbo later |
| NFR-10 | Maps | Google Maps (or equivalent) for maps, geocoding, directions and ETA |

## 10. Compliance

- Business registration of the platform with CAC; vendor CAC number collected where applicable
- NDPA 2023 data-protection compliance and a privacy policy
- Terms of service for customers, vendors and riders, including the rule that refunds are between vendor and customer
- Food-safety disclaimer; vendors confirm they hold required health/food-handling permits
- Rider employment or contractor agreements and insurance

## 11. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Vendors refuse or delay refunds, since the platform holds no money | Customer trust drops | Admin-set refund deadline with automatic action when missed, public refund rate on vendor profile, suspension for repeat offenders |
| Vendors are paid on Paystack's schedule (usually next business day), not instantly | Vendors expect same-minute payouts | State the settlement time at onboarding; show "settling" status on the vendor dashboard |
| Delivery-fee revenue does not cover rider costs | Platform loses money on delivery | Distance-based fees, minimum order value, monitor cost per trip |
| Riders' phone browsers stop sharing GPS when the screen locks | Tracking gaps | Keep-awake prompt on web; native rider app in phase 2 |
| Fake vendors or unsafe food | Brand and legal damage | KYC on onboarding, reviews, reporting, admin takedown |
| Low vendor take-up of paid plans | Revenue shortfall | Free trial, clear tier value, yearly discount |

## 12. Success measures (KPIs)

- Active paying vendors and trial-to-paid conversion rate
- Monthly recurring subscription revenue and vendor churn
- Orders per day and repeat-customer rate
- Average delivery time and on-time delivery rate
- Refund request rate and median refund resolution time
- Rider utilisation (trips per online hour) and cost per delivery vs delivery fee

## 13. Release phasing

1. **Phase 1 (MVP):** all "M" requirements, launch in all Nigerian cities
2. **Phase 2:** "S" requirements, native rider app for reliable GPS
3. **Phase 3:** native customer and vendor apps, promotions and coupons, WhatsApp notifications, scheduled orders

## 14. Decisions and open questions

### Decided

| Topic | Decision |
| --- | --- |
| App name | KJT Foodie |
| Payment gateway | Paystack |
| Vendor settlement | Paystack split payments: food amount to the vendor's subaccount, settled to the vendor's bank account on the next business day (T+1); KJT Foodie never holds vendor money |
| Transfer fees | None today, as split payments need no transfers. If same-day transfers are added later, the vendor pays the fee (deducted from the payout) |
| Gateway fee on orders | Paid by the customer, shown at checkout |
| Subscription prices, yearly discount, trial length | Set by admin |
| Delivery fee formula and rider payout % | Set by admin |
| Refund deadline and action when missed | Set by admin |
| Launch area | All cities in Nigeria |
| Vendor documents | Confirmed as listed in FR-VEN-01 |
| Branding | Proposed in section 15 |

### Still open

None. All questions raised so far are decided.

## 15. Brand (proposed)

KJT Foodie should feel warm, local and fast: food colours that suit Nigerian dishes, with a clean, simple layout that loads well on budget phones.

| Element | Proposal |
| --- | --- |
| Name | KJT Foodie |
| Tagline | "Good food, delivered fast" |
| Logo | Wordmark "KJT Foodie" with a map-pin icon whose head is a plate with fork and spoon, showing food plus live delivery tracking |
| Primary colour | Jollof orange `#E85D04`: buttons, links, logo |
| Secondary colour | Naija green `#1B7F3B`: success states, "Delivered", vendor badges |
| Accent colour | Plantain yellow `#FFB703`: ratings, likes, highlights |
| Text colour | Charcoal `#1F2937` |
| Background | Warm white `#FFF8F0` (cards in white `#FFFFFF`) |
| Fonts | Poppins for headings, Inter for body text (both free Google Fonts) |
| Domain | kjtfoodie.com or kjtfoodie.ng (check availability before buying) |

A designer should test the colours for readable contrast before the design is finalised.
