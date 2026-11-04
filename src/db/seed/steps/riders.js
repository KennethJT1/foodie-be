// Tunde and Kemi (handoff 8.2) and 34 more riders (handoff 8.4): 18 in Lagos, 4 pending,
// 1 suspended, the rest approved (45% of them online); each with guarantor, documents and bank.
import { hashPassword } from '../../../core/auth/index.js';
import { slugify } from '../../../core/utils/index.js';
import { models, newId } from '../../index.js';
import { CITIES } from '../data/cities.js';
import { sampleDocumentUpload } from '../media.js';
import { REQUIRED_DOCUMENTS } from '../data/reference.js';
import { DEMO_PASSWORD, jitter, pickCity } from './users.js';
import { makeBankAccount } from './vendors.js';

const { User, Rider, RiderDocument, RiderBankAccount, Upload } = models;

const PLATE_PREFIXES = ['LSR', 'KJA', 'ABJ', 'EKY', 'APP', 'GGE'];
const RELATIONSHIPS = ['Uncle', 'Pastor', 'Employer', 'Aunt', 'Brother'];

export const riders = async ({ transaction, faker, now }) => {
  const lagos = CITIES[0];
  const users = [];
  const rows = [];
  const documents = [];
  const uploads = [];
  const accounts = [];

  const makeRider = ({ id, user, city, approvalStatus = 'approved', ...overrides }) => {
    const createdAt = user.createdAt ?? new Date(now - 300 * 24 * 60 * 60 * 1000);
    const vehicleType = faker.helpers.arrayElement(['motorcycle', 'motorcycle', 'motorcycle', 'bicycle', 'car']);
    rows.push({
      id,
      userId: user.id,
      approvalStatus,
      onboardingStep: 'submitted',
      vehicleType,
      plateNumber:
        vehicleType === 'bicycle'
          ? ''
          : `${faker.helpers.arrayElement(PLATE_PREFIXES)}-${faker.string.numeric(3)}${faker.string.alpha({ length: 2, casing: 'upper' })}`,
      licenceNumber: faker.string.alphanumeric({ length: 11, casing: 'upper' }),
      guarantorName: faker.person.fullName(),
      guarantorPhone: `+234${faker.helpers.arrayElement(['803', '806', '813', '816', '703', '706'])}${faker.string.numeric(7)}`,
      guarantorRelationship: faker.helpers.arrayElement(RELATIONSHIPS),
      guarantorAddress: `${faker.location.street()}, ${city.city}`,
      isOnline: approvalStatus === 'approved' && faker.datatype.boolean(0.45),
      lastSeenAt: new Date(now - faker.number.int({ min: 0, max: 600_000 })),
      city: city.city,
      ...jitter(faker, city, 7),
      rating: Number(faker.number.float({ min: 3.9, max: 5 }).toFixed(1)),
      ratingCount: faker.number.int({ min: 5, max: 300 }),
      submittedAt: createdAt,
      approvedAt: ['approved', 'suspended'].includes(approvalStatus) ? createdAt : null,
      createdAt,
      ...overrides,
    });
    accounts.push({ riderId: id, ...makeBankAccount(faker, `${user.firstName} ${user.lastName}`) });
    for (const [i, doc] of REQUIRED_DOCUMENTS.rider.entries()) {
      const uploadId = newId();
      uploads.push({ ...sampleDocumentUpload(uploadId, user.id, 'rider_document'), createdAt });
      documents.push({
        riderId: id,
        type: doc.type,
        label: `${doc.label} — SAMPLE`,
        uploadId,
        createdAt: new Date(createdAt.getTime() + i * 1000),
        updatedAt: createdAt,
      });
    }
  };

  makeRider({
    id: 'rid_tunde',
    user: { id: 'usr_rider_tunde', firstName: 'Tunde', lastName: 'Bakare' },
    city: lagos,
    vehicleType: 'motorcycle',
    isOnline: false,
    lat: 6.5122,
    lng: 3.3801,
    rating: 4.8,
  });
  // Kemi has only signed up
  rows.push({ id: 'rid_new', userId: 'usr_rider_new' });

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (let i = 0; i < 34; i += 1) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const createdAt = faker.date.past({ years: 1, refDate: now });
    const user = {
      id: `usr_rider_${String(i + 1).padStart(3, '0')}`,
      role: 'rider',
      firstName,
      lastName,
      email: `${slugify(`${firstName}.${lastName}`).replace(/-/g, '.')}${i}@riders.kjtfoodie.test`,
      // 0807… is not used by generated customers or vendor owners
      phone: `+234807${String(1000000 + i * 7919).slice(-7)}`,
      passwordHash,
      status: 'active',
      phoneVerifiedAt: createdAt,
      createdAt,
    };
    users.push(user);
    makeRider({
      id: `rid_${String(i + 1).padStart(3, '0')}`,
      user,
      city: i < 18 ? lagos : pickCity(faker),
      approvalStatus: i < 4 ? 'pending' : i === 4 ? 'suspended' : 'approved',
      ...(i === 4 && { suspensionReason: 'Repeated late deliveries reported by customers.' }),
    });
  }

  await User.bulkCreate(users, { transaction });
  await Rider.bulkCreate(rows, { transaction });
  await Upload.bulkCreate(uploads, { transaction });
  await RiderDocument.bulkCreate(documents, { transaction });
  await RiderBankAccount.bulkCreate(accounts, { transaction });
};
