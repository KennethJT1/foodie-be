// Demo accounts (handoff 8.2), Ada's two addresses and ~70 customers (handoff 8.4). Vendor
// profiles are created by the vendors step.
import { ensureAdminRoles, hashPassword } from '../../../core/auth/index.js';
import { weighted } from '../../../core/utils/random.js';
import { models } from '../../index.js';
import { CITIES } from '../data/cities.js';

const { User, Rider, Address } = models;

export const DEMO_PASSWORD = 'password123';
const DAY = 24 * 60 * 60 * 1000;

const PREFIXES = [
  '803',
  '806',
  '813',
  '816',
  '703',
  '706',
  '810',
  '814',
  '903',
  '905',
  '802',
  '808',
  '701',
  '708',
  '812',
];

const DEMO_USERS = [
  ['usr_customer_ada', 'customer', 'Ada', 'Okafor', 'customer@kjtfoodie.test', '+2348030000001'],
  ['usr_vendor_bisi', 'vendor', 'Bisi', 'Adeyemi', 'vendor@kjtfoodie.test', '+2348030000002'],
  ['usr_vendor_expired', 'vendor', 'Chidi', 'Eze', 'expired.vendor@kjtfoodie.test', '+2348030000003'],
  ['usr_vendor_new', 'vendor', 'Tolu', 'Ogunleye', 'new.vendor@kjtfoodie.test', '+2348030000004'],
  ['usr_rider_tunde', 'rider', 'Tunde', 'Bakare', 'rider@kjtfoodie.test', '+2348030000005'],
  ['usr_rider_new', 'rider', 'Kemi', 'Adebayo', 'new.rider@kjtfoodie.test', '+2348030000006'],
  ['usr_admin_super_admin', 'admin', 'Kenneth', 'Taiwo', 'super@kjtfoodie.test', null, 'super_admin'],
  ['usr_admin_support', 'admin', 'Ifeoma', 'Nwosu', 'support@kjtfoodie.test', null, 'support'],
  ['usr_admin_finance', 'admin', 'Musa', 'Abdullahi', 'finance@kjtfoodie.test', null, 'finance'],
  ['usr_admin_dispatch', 'admin', 'Segun', 'Alabi', 'dispatch@kjtfoodie.test', null, 'dispatch'],
  ['usr_admin_onboarding', 'admin', 'Zainab', 'Bello', 'onboarding@kjtfoodie.test', null, 'onboarding'],
];

// Vendor profiles come from the vendors step; phase 11 moves the riders to their own step
const DEMO_RIDERS = [
  { id: 'rid_tunde', userId: 'usr_rider_tunde', approvalStatus: 'approved', isOnline: false },
  { id: 'rid_new', userId: 'usr_rider_new' },
];

/** Shared helpers for later steps: a weighted city and a point within `km` of its centre. */
export const pickCity = (faker) =>
  weighted(
    faker,
    CITIES.map((c) => [c, c.weight]),
  );
export const jitter = (faker, centre, km = 6) => ({
  lat: Number((centre.lat + faker.number.float({ min: -1, max: 1 }) * (km / 111)).toFixed(7)),
  lng: Number((centre.lng + faker.number.float({ min: -1, max: 1 }) * (km / 111)).toFixed(7)),
});

const makeAddress = (faker, city, label = 'Home') => ({
  label,
  line1: `${faker.number.int({ min: 1, max: 120 })} ${faker.location.street()}`,
  area: faker.helpers.arrayElement(city.areas),
  city: city.city,
  state: city.state,
  ...jitter(faker, city),
});

export const users = async ({ transaction, faker, now }) => {
  // Admins reference the roles table, which the wipe emptied
  await ensureAdminRoles({ transaction });
  // One hash for every demo account: they all share the demo password
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const verifiedAt = new Date(now - 200 * DAY);

  await User.bulkCreate(
    DEMO_USERS.map(([id, role, firstName, lastName, email, phone, adminRole]) => ({
      id,
      role,
      adminRole,
      firstName,
      lastName,
      email,
      phone,
      passwordHash,
      status: 'active',
      phoneVerifiedAt: phone ? verifiedAt : null,
      emailVerifiedAt: verifiedAt,
      createdAt: new Date(now - 400 * DAY),
    })),
    { transaction },
  );
  await Rider.bulkCreate(DEMO_RIDERS, { transaction });

  const lagos = CITIES[0];
  await Address.bulkCreate(
    [
      {
        id: 'adr_ada_home',
        ...makeAddress(faker, lagos, 'Home'),
        area: 'Yaba',
        lat: 6.5095,
        lng: 3.3711,
        isDefault: true,
      },
      {
        id: 'adr_ada_work',
        ...makeAddress(faker, lagos, 'Work'),
        area: 'Victoria Island',
        lat: 6.4281,
        lng: 3.4219,
        isDefault: false,
      },
    ].map((a) => ({ ...a, userId: 'usr_customer_ada' })),
    { transaction },
  );

  // 70 generated customers: one default address each; about 1 in 23 suspended, 1 in 31 banned
  const emails = new Set(DEMO_USERS.map((u) => u[4]));
  const phones = new Set(DEMO_USERS.map((u) => u[5]));
  const customers = [];
  const addresses = [];
  for (let i = 0; i < 70; i += 1) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    let email = faker.internet.email({ firstName, lastName }).toLowerCase();
    if (emails.has(email)) email = email.replace('@', `${i}@`);
    emails.add(email);
    let phone;
    do phone = `+234${faker.helpers.arrayElement(PREFIXES)}${faker.string.numeric(7)}`;
    while (phones.has(phone));
    phones.add(phone);

    const id = `usr_customer_${String(i + 1).padStart(3, '0')}`;
    const status = i % 31 === 11 ? 'banned' : i % 23 === 7 ? 'suspended' : 'active';
    const createdAt = faker.date.past({ years: 1, refDate: now });
    customers.push({
      id,
      role: 'customer',
      firstName,
      lastName,
      email,
      phone,
      passwordHash,
      status,
      createdAt,
      phoneVerifiedAt: createdAt,
    });
    addresses.push({
      id: `adr_customer_${String(i + 1).padStart(3, '0')}`,
      userId: id,
      isDefault: true,
      ...makeAddress(faker, pickCity(faker)),
    });
  }
  await User.bulkCreate(customers, { transaction });
  await Address.bulkCreate(addresses, { transaction });
};
