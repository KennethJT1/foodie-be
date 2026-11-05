// Fixed seed IDs as real UUIDs. Each demo row keeps a readable key (`usr_customer_ada`) that maps to
// the same name-based UUID (v5) on every reseed, so demo accounts, docs and Postman stay stable.
// Rows the app creates get UUID v7 (src/db/id.js).
import { v5 as uuidv5 } from 'uuid';

const NAMESPACE = '6f0e2b9c-4a51-4c8e-9d1a-6b3f7e2c5a10';

export const seedId = (key) => uuidv5(key, NAMESPACE);

// The demo rows the seed, the tests and the docs refer to by name (handoff 8.2)
export const SEED_IDS = Object.freeze({
  ada: seedId('usr_customer_ada'),
  adaHome: seedId('adr_ada_home'),
  adaWork: seedId('adr_ada_work'),
  bisi: seedId('usr_vendor_bisi'),
  chidi: seedId('usr_vendor_expired'),
  tolu: seedId('usr_vendor_new'),
  tundeUser: seedId('usr_rider_tunde'),
  kemiUser: seedId('usr_rider_new'),
  superAdmin: seedId('usr_admin_super_admin'),
  support: seedId('usr_admin_support'),
  finance: seedId('usr_admin_finance'),
  dispatch: seedId('usr_admin_dispatch'),
  onboarding: seedId('usr_admin_onboarding'),
  mamaPut: seedId('ven_mama_put'),
  chidiGrills: seedId('ven_expired'),
  toluPot: seedId('ven_new'),
  tunde: seedId('rid_tunde'),
  kemi: seedId('rid_new'),
  planBasic: seedId('plan_basic'),
  planPro: seedId('plan_pro'),
  planPremium: seedId('plan_premium'),
});

/** Category ID from its slug (`rice` → the UUID of `cat-rice`). */
export const categoryId = (slug) => seedId(`cat-${slug}`);
