# KJT Foodie — Database Schema

Oct 28, 2026 · @Lorem Backend

## 1. Conventions

KJT Foodie uses one MySQL 8 database (`kjt_foodie`, InnoDB, `utf8mb4_0900_ai_ci`) with about 40 tables managed by Sequelize migrations. Every table follows the rules below.

| Rule | Convention |
| --- | --- |
| Table names | `snake_case`, plural (`food_items`) |
| Column names | `snake_case` in the database, `camelCase` in Sequelize models (`underscored: true`) |
| Primary keys | `id` `CHAR(36)` UUID v7 (time-ordered, so inserts stay fast); lookup/config tables may use `INT` |
| Foreign keys | `<singular>_id` (`vendor_id`), with real FK constraints; `ON DELETE RESTRICT` by default |
| Timestamps | `created_at`, `updated_at` `DATETIME(3)` in UTC on every table; displayed in Africa/Lagos |
| Soft delete | `deleted_at` (Sequelize `paranoid`) on users, vendors, food items, comments; never on money tables |
| Money | `BIGINT` in **kobo**, columns end in `_kobo` (`total_kobo`) |
| Percentages | `DECIMAL(5,2)` (`payout_percent` = 70.00) |
| Coordinates | `DECIMAL(10,7)` `lat`, `lng`; plus a `POINT SRID 4326` column with a spatial index where distance search is needed |
| Status fields | `ENUM` for fixed sets (order status); lookup tables for sets admins change (categories) |
| JSON | `JSON` only for flexible data (metadata, raw webhook payloads), never for data we filter on |
| Human codes | Unique short codes for people to quote: `KJT-4F7Q2A` (orders), `RF-...` (refunds) |
| Money tables | Append-only where possible; corrections are new rows, not edits |

In the tables below, every table also has `id`, `created_at`, `updated_at` unless stated; they are not repeated.

## 2. Entity relationship overview

The tables fall into seven groups; arrows point from the table that holds the foreign key to the one it references.

&#91;embedded content: entity relationships · 7 table groups\]

Key links: `vendors.owner_user_id` → `users`; `subscriptions.vendor_id` and `food_items.vendor_id` → `vendors`; `orders.customer_id` → `users`, `orders.vendor_id` → `vendors`, `order_items.food_item_id` → `food_items`; `deliveries.order_id` → `orders`; `riders.user_id` → `users`.

## 3. Users and access

One `users` table holds every person; their role decides which profile table (vendor, rider) they also have. Admin sub-roles and permissions are data, so new admin roles need no code change.

### `users`

| Column | Type | Notes |
| --- | --- | --- |
| `full_name` | VARCHAR(120) |  |
| `email` | VARCHAR(191) NULL | Unique |
| `phone` | VARCHAR(20) | Unique, E.164 (`+2348031234567`) |
| `password_hash` | VARCHAR(255) NULL | Null for OTP-only accounts |
| `role` | ENUM('customer','vendor','vendor\_staff','rider','admin') |  |
| `admin_role_id` | FK → `roles` NULL | Only for admins |
| `status` | ENUM('active','suspended','banned','pending') |  |
| `avatar_url` | VARCHAR(500) NULL |  |
| `email_verified_at`, `phone_verified_at` | DATETIME NULL |  |
| `last_login_at` | DATETIME NULL |  |
| `perm_version` | INT DEFAULT 1 | Bumped when permissions change |
| `deleted_at` | DATETIME NULL | Soft delete; personal data anonymised on account deletion |

### `roles`, `permissions`, `role_permissions`

| Table | Columns |
| --- | --- |
| `roles` | `name` (Super admin, Support, Finance, Dispatch, Onboarding), `slug` unique, `description`, `is_system` BOOL |
| `permissions` | `key` unique (`refunds.escalate`), `group` (refunds), `description` |
| `role_permissions` | `role_id` FK, `permission_id` FK; PK (`role_id`, `permission_id`) |

### `addresses`

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | FK → `users` |  |
| `label` | VARCHAR(40) | Home, Office |
| `line1`, `line2`, `landmark` | VARCHAR | Landmarks matter for Nigerian deliveries |
| `city`, `state` | VARCHAR(80) |  |
| `lat`, `lng` | DECIMAL(10,7) | From the map pin |
| `is_default` | BOOL |  |

### `refresh_tokens`, `otp_codes`

| Table | Columns |
| --- | --- |
| `refresh_tokens` | `user_id` FK, `token_hash` unique, `family_id`, `expires_at`, `revoked_at` NULL, `replaced_by_id` NULL, `user_agent`, `ip` |
| `otp_codes` | `phone` or `email`, `code_hash`, `purpose` ENUM('login','verify','reset','bank\_change'), `attempts`, `expires_at`, `used_at` NULL |

## 4. Vendors, subscriptions and plans

A vendor is a business owned by one user, with optional staff, verified documents, one active payout account (Paystack subaccount) and one current subscription.

### `vendors`

| Column | Type | Notes |
| --- | --- | --- |
| `owner_user_id` | FK → `users` | Unique |
| `type` | ENUM('restaurant','home\_cook') | Decides required documents |
| `name`, `slug` | VARCHAR | `slug` unique, used in storefront URL |
| `description` | VARCHAR(300) |  |
| `logo_url`, `cover_url` | VARCHAR(500) |  |
| `phone`, `email` | VARCHAR | Business contact |
| `address_line`, `city`, `state` | VARCHAR |  |
| `lat`, `lng`, `location` | DECIMAL / POINT | Spatial index for "near me" |
| `delivery_radius_km` | DECIMAL(5,2) |  |
| `prep_time_minutes` | SMALLINT | Default prep time |
| `cac_number` | VARCHAR(30) NULL | Required for restaurants |
| `approval_status` | ENUM('draft','pending','approved','rejected','suspended') |  |
| `approved_by`, `approved_at`, `rejection_reason` |  |  |
| `is_open` | BOOL | Manual pause |
| `is_visible` | BOOL | False when subscription lapsed (BR-SUB-06) |
| `rating_avg`, `rating_count`, `followers_count` | DECIMAL(3,2), INT, INT | Denormalised counters |
| `refund_rate` | DECIMAL(5,2) | Shown on profile |
| `deleted_at` | DATETIME NULL |  |

### Related vendor tables

| Table | Columns |
| --- | --- |
| `vendor_staff` | `vendor_id` FK, `user_id` FK, `staff_role` ENUM('manager','cashier'), unique (`vendor_id`, `user_id`) |
| `vendor_opening_hours` | `vendor_id` FK, `day_of_week` TINYINT 0–6, `opens_at` TIME, `closes_at` TIME, `is_closed` BOOL |
| `vendor_documents` | `vendor_id` FK, `document_type` (cac\_certificate, government\_id, food\_permit...), `file_url`, `status` ENUM('pending','approved','rejected'), `reviewed_by`, `reviewed_at`, `note` |
| `required_documents` | `vendor_type`, `document_type`, `is_required` (admin-editable list per type) |
| `vendor_payout_accounts` | `vendor_id` FK, `bank_code`, `bank_name`, `account_number` (encrypted), `account_name`, `paystack_subaccount_code`, `status` ENUM('pending','active','replaced'), `approved_by`, `approved_at`; only one `active` per vendor |

### Plans and subscriptions

| Table | Columns |
| --- | --- |
| `plans` | `name` (Basic, Pro, Premium), `slug`, `description`, `max_items`, `max_photos_per_item`, `max_staff`, `featured_level` TINYINT, `analytics_level` ENUM('basic','full','export'), `is_active`, `sort_order` |
| `plan_prices` | `plan_id` FK, `interval` ENUM('monthly','yearly'), `amount_kobo`, `paystack_plan_code`, `is_current` BOOL, `effective_from` |
| `subscriptions` | `vendor_id` FK, `plan_price_id` FK, `status` ENUM('trialing','active','past\_due','grace','expired','cancelled'), `trial_ends_at`, `current_period_start`, `current_period_end`, `grace_ends_at`, `cancel_at_period_end` BOOL, `paystack_subscription_code`, `paystack_customer_code`, `paystack_email_token` |
| `subscription_invoices` | `subscription_id` FK, `amount_kobo`, `period_start`, `period_end`, `status` ENUM('paid','failed','pending'), `paystack_reference`, `paid_at` |
| `subscription_events` | `subscription_id` FK, `type` (created, upgraded, downgraded, renewed, payment\_failed, grace\_started, expired, extended\_by\_admin), `data` JSON, `actor_user_id` NULL |

The trial length, grace period and yearly discount are admin settings (`settings` table, section 8).

## 5. Catalogue and social

Food items belong to a vendor and a category, carry photos and option groups (e.g. "Choose protein"), and collect likes and comments; counters are stored on the item so the feed never counts rows.

### Catalogue

| Table | Columns |
| --- | --- |
| `categories` | `name` (Rice, Soups & Swallow, Grills, Snacks, Drinks...), `slug` unique, `icon`, `sort_order`, `is_active` |
| `food_items` | `vendor_id` FK, `category_id` FK, `name`, `slug`, `description` VARCHAR(500), `price_kobo`, `portion` VARCHAR(60), `prep_time_minutes` NULL, `is_available` BOOL, `is_hidden_by_admin` BOOL, `hidden_reason`, `likes_count`, `comments_count`, `orders_count`, `rating_avg`, `deleted_at` |
| `food_item_photos` | `food_item_id` FK, `url`, `public_id` (Cloudinary), `sort_order`; count limited by plan |
| `food_item_option_groups` | `food_item_id` FK, `name` ("Choose protein"), `min_select`, `max_select`, `sort_order` |
| `food_item_options` | `option_group_id` FK, `name` ("Chicken"), `price_kobo` (extra), `is_available` |
| `food_item_availability` | `food_item_id` FK, `day_of_week`, `from_time`, `to_time` (scheduled availability, FR-FOOD-03) |

### Social

| Table | Columns |
| --- | --- |
| `likes` | `user_id` FK, `food_item_id` FK; unique (`user_id`, `food_item_id`) |
| `comments` | `food_item_id` FK, `user_id` FK, `parent_id` FK → `comments` NULL (vendor replies), `body` VARCHAR(500), `is_edited`, `status` ENUM('visible','hidden','removed'), `deleted_at` |
| `follows` | `user_id` FK, `vendor_id` FK; unique pair |
| `reports` | `reporter_id` FK, `target_type` ENUM('comment','food\_item','vendor','user'), `target_id`, `reason`, `status` ENUM('open','actioned','dismissed'), `handled_by`, `handled_at` |
| `reviews` | `order_id` FK unique per target, `customer_id` FK, `target_type` ENUM('vendor','rider'), `vendor_id` NULL, `rider_id` NULL, `rating` TINYINT 1–5, `comment` VARCHAR(500), `vendor_reply` NULL |

Only customers with a delivered order can review (enforced in the service; `order_id` makes it verifiable).

## 6. Orders, payments and refunds

An order copies prices and names at checkout (so later menu edits never change history), keeps every status change in `order_status_history`, and links to one Paystack payment that records the split.

### `orders`

| Column | Type | Notes |
| --- | --- | --- |
| `code` | VARCHAR(12) | Unique, `KJT-4F7Q2A` |
| `customer_id` | FK → `users` |  |
| `vendor_id` | FK → `vendors` | One vendor per order (FR-ORD-01) |
| `status` | ENUM('pending\_payment','paid','accepted','rejected','preparing','ready','rider\_assigned','picked\_up','delivered','cancelled','failed') |  |
| `subtotal_kobo` | BIGINT | Food + options |
| `delivery_fee_kobo` | BIGINT | Distance-based |
| `processing_fee_kobo` | BIGINT | Paystack fee passed to customer |
| `total_kobo` | BIGINT | Sum of the three |
| `distance_km` | DECIMAL(6,2) | Vendor → drop-off |
| `delivery_address` | JSON | Snapshot of the address (line, landmark, lat, lng) |
| `delivery_lat`, `delivery_lng` | DECIMAL(10,7) | Copied for queries |
| `customer_note` | VARCHAR(300) NULL |  |
| `delivery_code_hash` | VARCHAR(255) | 4-digit code given to customer |
| `accept_by` | DATETIME | Auto-reject deadline |
| `estimated_ready_at`, `estimated_delivery_at` | DATETIME NULL |  |
| `accepted_at`, `ready_at`, `picked_up_at`, `delivered_at`, `cancelled_at` | DATETIME NULL |  |
| `cancel_reason`, `cancelled_by` | NULL |  |

### Order detail tables

| Table | Columns |
| --- | --- |
| `order_items` | `order_id` FK, `food_item_id` FK, `name_snapshot`, `unit_price_kobo`, `quantity`, `options` JSON (chosen options with names and prices), `line_total_kobo` |
| `order_status_history` | `order_id` FK, `from_status`, `to_status`, `actor_user_id` NULL (null = system), `note`, `created_at` |

### Payments

| Table | Columns |
| --- | --- |
| `payments` | `order_id` FK unique, `reference` unique, `paystack_access_code`, `amount_kobo`, `vendor_share_kobo`, `platform_share_kobo`, `paystack_fee_kobo`, `subaccount_code`, `channel` (card, bank, ussd, bank\_transfer), `status` ENUM('initialized','success','failed','abandoned','reversed'), `paid_at`, `settlement_status` ENUM('pending','settled'), `settled_at` NULL |
| `payment_events` | `provider` ('paystack'), `event_id` unique, `event_type` (charge.success...), `reference`, `payload` JSON, `signature_valid` BOOL, `processed_at` NULL, `error` NULL |

### Refunds

| Table | Columns |
| --- | --- |
| `refunds` | `code` unique (`RF-...`), `order_id` FK, `customer_id` FK, `vendor_id` FK, `type` ENUM('food','delivery\_fee','full'), `reason`, `requested_amount_kobo`, `approved_amount_kobo` NULL, `status` ENUM('requested','accepted','partially\_accepted','rejected','paid','confirmed','disputed','escalated','closed'), `respond_by` DATETIME, `paid_method` ENUM('paystack\_refund','bank\_transfer') NULL, `paid_reference` NULL, `paid_at` NULL, `confirmed_at` NULL |
| `refund_attachments` | `refund_id` FK, `url`, `uploaded_by` |
| `refund_events` | `refund_id` FK, `actor_user_id`, `action` (requested, accepted, rejected, marked\_paid, confirmed, disputed, escalated, admin\_comment, deadline\_missed), `amount_kobo` NULL, `note`; append-only audit trail (BR-REF-04) |

## 7. Riders, deliveries, GPS and payouts

Each paid order gets one delivery; offers to riders are logged; the GPS trail is sampled every 30 s; each completed delivery records the rider's earning at the payout % in force at that moment, and month-end statements total them.

| Table | Columns |
| --- | --- |
| `riders` | `user_id` FK unique, `vehicle_type` ENUM('bike','motorbike','car'), `plate_number`, `licence_number`, `guarantor_name`, `guarantor_phone`, `approval_status` ENUM('pending','approved','rejected','suspended'), `is_online` BOOL, `last_lat`, `last_lng`, `last_seen_at`, `payout_percent_override` DECIMAL(5,2) NULL, `rating_avg`, `trips_count`, bank details (`bank_code`, `account_number` encrypted, `account_name`) |
| `rider_documents` | `rider_id` FK, `document_type` (licence, government\_id, guarantor\_form), `file_url`, `status`, `reviewed_by`, `reviewed_at` |
| `deliveries` | `order_id` FK unique, `rider_id` FK NULL, `status` ENUM('searching','assigned','to\_vendor','at\_vendor','picked\_up','delivered','failed','cancelled'), `assigned_by` NULL (null = auto, else dispatcher user), `pickup_lat/lng`, `dropoff_lat/lng`, `distance_km`, `delivery_fee_kobo`, `assigned_at`, `picked_up_at`, `delivered_at`, `failure_reason` |
| `delivery_offers` | `delivery_id` FK, `rider_id` FK, `offered_at`, `expires_at`, `response` ENUM('pending','accepted','declined','expired'), `responded_at`, `distance_to_pickup_km` |
| `delivery_locations` | `delivery_id` FK, `rider_id` FK, `lat`, `lng`, `heading`, `speed`, `accuracy`, `recorded_at`; no `updated_at`; older than 30 days moved to `delivery_locations_archive` |
| `rider_earnings` | `rider_id` FK, `delivery_id` FK unique, `delivery_fee_kobo`, `payout_percent` (copied at completion), `amount_kobo`, `status` ENUM('pending','in\_statement','void'), `statement_id` NULL, `void_reason` NULL (admin override for failed deliveries) |
| `rider_payout_statements` | `rider_id` FK, `period_month` DATE (first day of month), `deliveries_count`, `gross_fees_kobo`, `amount_kobo`, `status` ENUM('draft','approved','paid'), `approved_by`, `approved_at`, `paid_reference`, `paid_at`; unique (`rider_id`, `period_month`) |

The global payout % lives in `settings` (`rider.payout_percent`); `riders.payout_percent_override` supports per-rider rates if the business turns them on. Each `rider_earnings` row copies the % used, so a later change never alters past earnings (BR-PAY-06).

## 8. Support, notifications, settings and audit

These tables hold everything admins configure (fees, percentages, deadlines) and everything they must be able to look back at.

| Table | Columns |
| --- | --- |
| `support_tickets` | `code` unique, `opened_by` FK, `order_id` FK NULL, `subject`, `category` (order, payment, refund, account, other), `priority` ENUM('low','normal','high'), `status` ENUM('open','pending','resolved','closed'), `assigned_to` NULL |
| `support_messages` | `ticket_id` FK, `sender_id` FK, `body`, `attachments` JSON, `is_internal_note` BOOL |
| `chat_messages` | `order_id` FK, `sender_id` FK, `body`, `read_at` (customer–rider chat during delivery) |
| `notifications` | `user_id` FK, `type` (order.accepted, subscription.expiring...), `title`, `body`, `data` JSON (link target), `read_at` NULL |
| `notification_preferences` | `user_id` FK, `channel` ENUM('email','sms','push'), `type_group`, `enabled` |
| `push_subscriptions` | `user_id` FK, `endpoint` / FCM token, `device`, `last_used_at` |
| `notification_templates` | `key`, `channel`, `subject`, `body` (with `{{placeholders}}`), editable by admin |
| `settings` | `key` unique, `value` JSON, `description`, `updated_by` |
| `service_areas` | `name` (city), `state`, `is_active`, optional `polygon` (GEOMETRY) |
| `audit_logs` | `actor_user_id` NULL, `actor_role`, `action` (vendor.approved, plan.price\_changed, refund.escalated...), `entity_type`, `entity_id`, `before` JSON, `after` JSON, `ip`, `user_agent`, `request_id`, `created_at`; append-only, no `updated_at` |

### Admin-configured settings (seeded keys)

| Key | Example value | Used by |
| --- | --- | --- |
| `delivery.base_fee_kobo` | 50000 | Checkout |
| `delivery.per_km_kobo` | 15000 | Checkout |
| `delivery.max_distance_km` | 15 | Checkout, search |
| `rider.payout_percent` | 70.00 | Rider earnings |
| `rider.offer_timeout_seconds` | 30 | Dispatch |
| `order.accept_timeout_minutes` | 5 | Auto-reject |
| `subscription.trial_days` | 14 | Onboarding |
| `subscription.grace_days` | 3 | Billing |
| `subscription.yearly_discount_percent` | 16.67 | Plans |
| `refund.vendor_response_hours` | 48 | Refunds |
| `refund.missed_deadline_action` | "escalate" | Refunds (escalate, warn, suspend) |
| `payment.processing_fee_rule` | `{ "percent": 1.5, "flat_kobo": 10000, "cap_kobo": 200000 }` | Checkout; mirrors Paystack's fee so the customer covers it |

All values above are placeholders for admin to set; changes are written to `audit_logs`.

## 9. Indexes, Sequelize models and migrations

### Key indexes

Every column used by a list filter or sort (Backend Architecture, section 5) is indexed. The most important:

| Table | Index | Serves |
| --- | --- | --- |
| `orders` | (`vendor_id`, `status`, `created_at`) | Vendor live order queue and history |
| `orders` | (`customer_id`, `created_at`) | Customer order history |
| `orders` | (`status`, `created_at`) | Admin order list |
| `orders` | `code` unique | Lookup by order number |
| `food_items` | (`vendor_id`, `is_available`, `deleted_at`) | Storefront menu |
| `food_items` | (`category_id`, `created_at`); FULLTEXT (`name`, `description`) | Feed and search |
| `vendors` | SPATIAL (`location`); (`approval_status`, `is_visible`) | "Near me", public listing |
| `likes`, `follows` | unique pair | Toggle like/follow |
| `comments` | (`food_item_id`, `created_at`) | Comment threads (cursor) |
| `payments` | `reference` unique; (`status`, `paid_at`) | Webhooks, reconciliation |
| `payment_events` | `event_id` unique | Webhook deduplication |
| `deliveries` | (`rider_id`, `status`) | Rider active job |
| `delivery_locations` | (`delivery_id`, `recorded_at`) | Route replay |
| `rider_earnings` | (`rider_id`, `status`, `created_at`) | Monthly statements |
| `subscriptions` | (`status`, `current_period_end`); (`status`, `grace_ends_at`) | Renewal and expiry jobs |
| `refunds` | (`vendor_id`, `status`); (`status`, `respond_by`) | Vendor queue, deadline job |
| `audit_logs` | (`entity_type`, `entity_id`, `created_at`); (`actor_user_id`, `created_at`) | Audit search |
| `notifications` | (`user_id`, `read_at`, `created_at`) | Bell counter |

### Sequelize model pattern

```js
// db/models/order.js
export default (sequelize, DataTypes) => {
  const Order = sequelize.define('Order', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => uuidv7() },
    code: { type: DataTypes.STRING(12), allowNull: false, unique: true },
    status: { type: DataTypes.ENUM(...ORDER_STATUSES), allowNull: false, defaultValue: 'pending_payment' },
    subtotalKobo: { type: DataTypes.BIGINT, allowNull: false },
    deliveryFeeKobo: { type: DataTypes.BIGINT, allowNull: false },
    processingFeeKobo: { type: DataTypes.BIGINT, allowNull: false },
    totalKobo: { type: DataTypes.BIGINT, allowNull: false },
    deliveryAddress: { type: DataTypes.JSON, allowNull: false },
    // ...
  }, {
    tableName: 'orders',
    underscored: true,
    scopes: {
      forCustomer: (customerId) => ({ where: { customerId } }),
      forVendor: (vendorId) => ({ where: { vendorId } }),
      active: { where: { status: ACTIVE_ORDER_STATUSES } },
    },
  });

  Order.associate = (m) => {
    Order.belongsTo(m.User, { as: 'customer', foreignKey: 'customerId' });
    Order.belongsTo(m.Vendor, { as: 'vendor' });
    Order.hasMany(m.OrderItem, { as: 'items' });
    Order.hasMany(m.OrderStatusHistory, { as: 'history' });
    Order.hasOne(m.Payment, { as: 'payment' });
    Order.hasOne(m.Delivery, { as: 'delivery' });
    Order.hasMany(m.Refund, { as: 'refunds' });
  };
  return Order;
};
```

- `BIGINT` comes back from MySQL as a string; set `dialectOptions: { supportBigNumbers: true, bigNumberStrings: false }` and keep kobo amounts below `Number.MAX_SAFE_INTEGER` (true for any realistic order).
- Money-changing service methods run in `sequelize.transaction()` with row locks (`lock: t.LOCK.UPDATE`) on the order or subscription row.
- Denormalised counters (`likes_count`, `rating_avg`) are updated inside the same transaction as the source row, and recalculated nightly as a safety net.

### Migrations and seeders

- One migration per change, named `YYYYMMDDHHmmss-create-orders.js`; never edit a migration that has run in staging or production.
- Every migration has a working `down`.
- Migration order follows dependencies: users/roles → vendors → plans/subscriptions → catalogue → social → orders/payments → riders/deliveries → refunds → support/notifications → settings/audit.
- Seeders: roles and permissions, the super admin, plans and prices, categories, settings keys, service areas (all Nigerian states), notification templates. A separate `demo` seeder creates fake vendors, food, customers and riders for staging — the same shapes the frontend's MSW mock data uses.
