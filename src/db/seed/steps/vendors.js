// Mama Put Kitchen, Chidi Grills and Tolu's Pot (handoff 8.2) and 45 more vendors (handoff 8.4):
// storefront, documents (sample paperwork photo), settlement account and opening hours.
// Logos (square crops of a dish photo) and covers (real food stalls) are seed photos; dishes come
// from the catalogue step, subscriptions from the subscriptions step.
import { seedId } from '../ids.js';
import { hashPassword } from '../../../core/auth/index.js';
import { slugify } from '../../../core/utils/index.js';
import { models, newId } from '../../index.js';
import { CITIES } from '../data/cities.js';
import { SEED_IMAGES } from '../data/images.js';
import { mediaUrl, sampleDocumentUpload } from '../media.js';
import { BANKS, REQUIRED_DOCUMENTS } from '../data/reference.js';
import { VENDOR_DESCRIPTIONS, VENDOR_NAME_PARTS } from '../data/vendors.js';
import { DEMO_PASSWORD, jitter, pickCity } from './users.js';

const { User, Vendor, VendorDocument, VendorOpeningHour, VendorBankAccount, Upload } = models;
const DAY = 24 * 60 * 60 * 1000;
const LOGO_SOURCES = Object.values(SEED_IMAGES.dishes).map((photos) => photos[0].url);
const COVER_SOURCES = SEED_IMAGES.vendorCovers.map((p) => p.url);

export const REJECTION_REASON = 'The CAC certificate is not readable. Please upload a clearer photo.';

/** Ten random digits in the owner's name (handoff 8.3: name in capitals). */
export const makeBankAccount = (faker, ownerName) => {
  const bank = faker.helpers.arrayElement(BANKS);
  return {
    bankCode: bank.code,
    bankName: bank.name,
    accountNumber: faker.string.numeric(10),
    accountName: ownerName.toUpperCase(),
  };
};

/** Mock OPENING_HOURS: opens 08:00–10:00, closes 20:00–22:00, Sunday from 12:00, sometimes closed. */
const openingHours = (faker) =>
  [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    opensAt: day === 0 ? '12:00' : faker.helpers.arrayElement(['08:00', '09:00', '10:00']),
    closesAt: faker.helpers.arrayElement(['20:00', '21:00', '22:00']),
    isClosed: day === 0 && faker.datatype.boolean(0.3),
  }));

const vendorNamer = (faker) => {
  const used = new Set(['Mama Put Kitchen', 'Chidi Grills', 'Tolu’s Pot']);
  const { prefixes, people, suffixes, brands } = VENDOR_NAME_PARTS;
  return () => {
    let name;
    do {
      name = faker.datatype.boolean(0.35)
        ? faker.helpers.arrayElement(brands)
        : `${faker.helpers.arrayElement(prefixes)} ${faker.helpers.arrayElement(people)} ${faker.helpers.arrayElement(suffixes)}`;
    } while (used.has(name));
    used.add(name);
    return name;
  };
};

const SUBSCRIPTION_MIX = [
  { weight: 6, value: 'active' },
  { weight: 2, value: 'trial' },
  { weight: 1, value: 'grace' },
  { weight: 1, value: 'expired' },
];

export const vendors = async ({ transaction, faker, now }) => {
  const lagos = CITIES[0];
  const nextName = vendorNamer(faker);
  const owners = [];
  const rows = [];
  const documents = [];
  const uploads = [];
  const accounts = [];
  const hours = [];

  // A full storefront; `overrides` pins the demo vendors' handoff values
  let variant = 0;
  const makeVendor = ({ id, owner, name, type, city = pickCity(faker), point, area, ...overrides }) => {
    // Rotated by position (not faker), so photos never change the generated data
    variant += 1;
    const vendorName = name ?? nextName();
    const vendorType = type ?? (faker.datatype.boolean(0.6) ? 'restaurant' : 'home_cook');
    const createdAt = faker.date.past({ years: 1, refDate: now - 20 * DAY });
    const approvalStatus = overrides.approvalStatus ?? 'approved';
    const vendor = {
      id: id ?? newId(),
      ownerUserId: owner.id,
      name: vendorName,
      slug: slugify(vendorName),
      type: vendorType,
      description: faker.helpers.arrayElement(VENDOR_DESCRIPTIONS),
      logoUrl: mediaUrl('vendor_logo', LOGO_SOURCES[(variant * 7) % LOGO_SOURCES.length]),
      coverUrl: mediaUrl('vendor_cover', COVER_SOURCES[variant % COVER_SOURCES.length]),
      phone: `+234${faker.helpers.arrayElement(['803', '806', '813', '816', '703', '706', '810', '814', '903', '905'])}${faker.string.numeric(7)}`,
      addressLine1: `${faker.number.int({ min: 1, max: 99 })} ${faker.location.street()}`,
      area: area ?? faker.helpers.arrayElement(city.areas),
      city: city.city,
      state: city.state,
      ...(point ?? jitter(faker, city, 8)),
      deliveryRadiusKm: faker.helpers.arrayElement([5, 8, 10, 15]),
      prepTimeMins: faker.helpers.arrayElement([15, 20, 25, 30, 40]),
      approvalStatus,
      onboardingStep: 'submitted',
      submittedAt: createdAt,
      // Suspended stores were approved first
      approvedAt: ['approved', 'suspended'].includes(approvalStatus) ? new Date(createdAt.getTime() + 2 * DAY) : null,
      rating: Number(faker.number.float({ min: 3.6, max: 4.9 }).toFixed(1)),
      ratingCount: faker.number.int({ min: 4, max: 400 }),
      refundRate: Number(faker.number.float({ min: 0, max: 6 }).toFixed(1)),
      planId: faker.helpers.arrayElement([
        seedId('plan_basic'),
        seedId('plan_pro'),
        seedId('plan_pro'),
        seedId('plan_premium'),
      ]),
      subscriptionStatus: faker.helpers.weightedArrayElement(SUBSCRIPTION_MIX),
      trialUsed: true,
      createdAt,
      ...overrides,
    };
    rows.push(vendor);

    accounts.push({ vendorId: vendor.id, ...makeBankAccount(faker, `${owner.firstName} ${owner.lastName}`) });
    for (const [sortOrder, doc] of REQUIRED_DOCUMENTS[vendorType].entries()) {
      const uploadId = newId();
      uploads.push({ ...sampleDocumentUpload(uploadId, owner.id, 'vendor_document'), createdAt });
      documents.push({
        vendorId: vendor.id,
        type: doc.type,
        label: `${doc.label} — SAMPLE`,
        uploadId,
        createdAt: new Date(createdAt.getTime() + sortOrder * 1000),
        updatedAt: createdAt,
      });
    }
    hours.push(...openingHours(faker).map((h) => ({ ...h, vendorId: vendor.id })));
    return vendor;
  };

  makeVendor({
    id: seedId('ven_mama_put'),
    owner: { id: seedId('usr_vendor_bisi'), firstName: 'Bisi', lastName: 'Adeyemi' },
    name: 'Mama Put Kitchen',
    type: 'restaurant',
    city: lagos,
    area: 'Yaba',
    point: { lat: 6.5158, lng: 3.3794 },
    planId: seedId('plan_pro'),
    subscriptionStatus: 'active',
    rating: 4.7,
    ratingCount: 312,
    refundRate: 1.2,
  });
  makeVendor({
    id: seedId('ven_expired'),
    owner: { id: seedId('usr_vendor_expired'), firstName: 'Chidi', lastName: 'Eze' },
    name: 'Chidi Grills',
    type: 'restaurant',
    city: lagos,
    planId: seedId('plan_basic'),
    subscriptionStatus: 'expired',
  });
  // Tolu has only signed up: no type, address, documents, bank or plan
  rows.push({
    id: seedId('ven_new'),
    ownerUserId: seedId('usr_vendor_new'),
    name: 'Tolu’s Pot',
    onboardingStep: 'type',
  });

  // 45 more: 6 pending (sent in the last 4 days), 1 rejected, 1 suspended, the rest approved
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const emails = new Set();
  for (let i = 0; i < 45; i += 1) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    let email = `${slugify(`${firstName}.${lastName}`).replace(/-/g, '.')}@vendors.kjtfoodie.test`;
    if (emails.has(email)) email = email.replace('@', `${i}@`);
    emails.add(email);
    const createdAt = faker.date.past({ years: 1, refDate: now - 20 * DAY });
    const owner = {
      id: seedId(`usr_vendor_${String(i + 1).padStart(3, '0')}`),
      role: 'vendor',
      firstName,
      lastName,
      email,
      // 0809… is not used by generated customers, so owners never clash with them
      phone: `+234809${String(1000000 + i * 7919).slice(-7)}`,
      passwordHash,
      status: 'active',
      phoneVerifiedAt: createdAt,
      createdAt,
    };
    owners.push(owner);

    const status = i < 6 ? 'pending' : i === 6 ? 'rejected' : i === 7 ? 'suspended' : 'approved';
    const overrides = { id: seedId(`ven_${String(i + 1).padStart(3, '0')}`), owner, approvalStatus: status };
    if (status === 'pending') {
      Object.assign(overrides, {
        subscriptionStatus: 'none',
        planId: null,
        trialUsed: false,
        submittedAt: faker.date.recent({ days: 4, refDate: now }),
      });
    }
    if (status === 'rejected') {
      Object.assign(overrides, {
        rejectionReason: REJECTION_REASON,
        subscriptionStatus: 'none',
        planId: null,
        trialUsed: false,
      });
    }
    if (status === 'suspended') {
      overrides.suspensionReason = 'Several customers reported food that did not match the photos.';
    }
    makeVendor(overrides);
  }

  await User.bulkCreate(owners, { transaction });
  await Vendor.bulkCreate(rows, { transaction });
  await Upload.bulkCreate(uploads, { transaction });
  await VendorDocument.bulkCreate(documents, { transaction });
  await VendorBankAccount.bulkCreate(accounts, { transaction });
  await VendorOpeningHour.bulkCreate(hours, { transaction });
};
