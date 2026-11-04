// Rider onboarding wizard: vehicle → guarantor → documents → bank → review → submitted, and the
// rider's own profile. Reference behaviour: foodie-fe src/mocks/handlers/riders.js.
import { NotFoundError, ValidationError } from '../../core/errors/index.js';
import { normalisePhone } from '../../core/utils/index.js';
import { lockForUpdate, models, withTransaction } from '../../db/index.js';
import { VEHICLE_TYPES } from '../../db/models/rider.model.js';
import {
  advanceStep,
  assertEditable,
  missingDocumentErrors,
  missingDocuments,
  notifyReviewers,
  ownUpload,
  resolveBank,
  toDocumentDto,
} from '../onboarding/onboarding.shared.js';
import { getSettings, requiredDocuments } from '../settings/settings.service.js';
import { toOnboardingDto, toProfileDto } from './riders.presenter.js';

const { Rider, RiderDocument, RiderBankAccount, Upload, User } = models;

export const STEPS = ['vehicle', 'guarantor', 'documents', 'bank', 'review'];

/** The signed-in rider's profile (404 if missing). */
export const ownRider = async (user, { transaction, lock = false } = {}) => {
  const rider = await Rider.findOne({
    where: { userId: user.id },
    transaction,
    ...(lock && { lock: transaction.LOCK.UPDATE }),
  });
  if (!rider) throw new NotFoundError();
  return rider;
};

export const documentsOf = (riderId, { transaction } = {}) =>
  RiderDocument.findAll({
    where: { riderId },
    include: [{ model: Upload, as: 'upload' }],
    order: [['createdAt', 'ASC']],
    transaction,
  });

export const bankAccountOf = (riderId, { transaction } = {}) =>
  RiderBankAccount.findOne({ where: { riderId }, transaction });

const present = async (rider, transaction) => {
  const [documents, bank, required] = await Promise.all([
    documentsOf(rider.id, { transaction }),
    bankAccountOf(rider.id, { transaction }),
    requiredDocuments('rider', { transaction }),
  ]);
  return toOnboardingDto(rider, { documents, bank, requiredDocuments: required });
};

/** GET /rider/onboarding */
export const getOnboarding = async (user) => present(await ownRider(user));

/** GET /rider/me: profile, online state, rating and the payout account's last 4 digits. */
export const getProfile = async (user) => {
  const rider = await Rider.findOne({ where: { userId: user.id }, include: [{ model: User, as: 'user' }] });
  if (!rider) throw new NotFoundError();
  const [bank, settings] = await Promise.all([bankAccountOf(rider.id), getSettings()]);
  return toProfileDto(rider, { bank, payoutPct: settings.riderPayoutPct });
};

const text = (value) => String(value ?? '').trim();

/** Each step validates its fields and returns the changes to save, or throws 422. */
const STEP_HANDLERS = {
  vehicle(user, rider, body) {
    const errors = {};
    const { vehicleType } = body;
    if (!VEHICLE_TYPES.includes(vehicleType)) errors.vehicleType = 'Pick your vehicle';
    const plateNumber = text(body.plateNumber).toUpperCase();
    // Bicycles have no plate
    if (vehicleType !== 'bicycle' && plateNumber.length < 5) errors.plateNumber = 'Enter the plate number';
    else if (plateNumber.length > 20) errors.plateNumber = 'Keep it under 20 characters';
    const licenceNumber = text(body.licenceNumber).toUpperCase();
    if (licenceNumber.length < 6) errors.licenceNumber = "Enter your driver's or rider's licence number";
    else if (licenceNumber.length > 30) errors.licenceNumber = 'Keep it under 30 characters';
    if (Object.keys(errors).length) throw new ValidationError(errors);
    return { vehicleType, plateNumber: vehicleType === 'bicycle' ? '' : plateNumber, licenceNumber };
  },

  guarantor(user, rider, body) {
    const g = body.guarantor && typeof body.guarantor === 'object' ? body.guarantor : {};
    const errors = {};
    const name = text(g.name);
    const phone = normalisePhone(g.phone);
    const relationship = text(g.relationship);
    const address = text(g.address);
    if (name.length < 3) errors['guarantor.name'] = "Enter your guarantor's full name";
    else if (name.length > 120) errors['guarantor.name'] = 'Keep it under 120 characters';
    if (!phone) errors['guarantor.phone'] = 'Enter a valid Nigerian phone number';
    else if (phone === user.phone) errors['guarantor.phone'] = "Your guarantor can't use your own number";
    if (!relationship) errors['guarantor.relationship'] = 'How do you know them?';
    else if (relationship.length > 60) errors['guarantor.relationship'] = 'Keep it under 60 characters';
    if (address.length < 5) errors['guarantor.address'] = 'Enter their home address';
    else if (address.length > 300) errors['guarantor.address'] = 'Keep it under 300 characters';
    if (Object.keys(errors).length) throw new ValidationError(errors);
    return {
      guarantorName: name,
      guarantorPhone: phone,
      guarantorRelationship: relationship,
      guarantorAddress: address,
    };
  },

  async documents(user, rider, body, transaction) {
    const [required, documents] = await Promise.all([
      requiredDocuments('rider', { transaction }),
      documentsOf(rider.id, { transaction }),
    ]);
    const errors = missingDocumentErrors(required, documents, (d) => `Upload your ${d.label.toLowerCase()}`);
    if (Object.keys(errors).length) throw new ValidationError(errors);
    return {};
  },

  async bank(user, rider, body, transaction) {
    const account = await resolveBank(user, body);
    const current = await bankAccountOf(rider.id, { transaction });
    if (current) await current.update(account, { transaction });
    else await RiderBankAccount.create({ riderId: rider.id, ...account }, { transaction });
    return {};
  },
};

/** PATCH /rider/onboarding: saves one step; saved progress only moves forward. */
export const saveStep = async (user, body) =>
  withTransaction(async (transaction) => {
    const rider = await ownRider(user, { transaction, lock: true });
    assertEditable(rider);
    if (!Object.hasOwn(STEP_HANDLERS, body.step)) throw new ValidationError({ step: 'Unknown step' });
    const changes = await STEP_HANDLERS[body.step](user, rider, body, transaction);
    await rider.update(
      { ...changes, onboardingStep: advanceStep(STEPS, rider.onboardingStep, body.step) },
      { transaction },
    );
    return present(rider, transaction);
  });

/** POST /rider/onboarding/submit: status pending; reviewers are told. */
export const submit = async (user) =>
  withTransaction(async (transaction) => {
    const rider = await ownRider(user, { transaction, lock: true });
    assertEditable(rider);
    const [required, documents, bank] = await Promise.all([
      requiredDocuments('rider', { transaction }),
      documentsOf(rider.id, { transaction }),
      bankAccountOf(rider.id, { transaction }),
    ]);
    const unfinished = {
      ...(!rider.vehicleType && { vehicle: 'Add your vehicle and licence' }),
      ...(!rider.guarantorName && { guarantor: 'Add your guarantor' }),
      ...(missingDocuments(required, documents).length && { documents: 'Upload every required document' }),
      ...(!bank && { bank: 'Add the bank account for your payouts' }),
    };
    if (Object.keys(unfinished).length) {
      throw new ValidationError(unfinished, 'Some steps are not finished yet. Check each step and try again.');
    }

    await rider.update(
      { approvalStatus: 'pending', rejectionReason: null, submittedAt: new Date(), onboardingStep: 'submitted' },
      { transaction },
    );
    await notifyReviewers(
      'riders.approve',
      {
        type: 'system',
        title: 'New rider to review',
        body: `${user.name} sent their documents for approval.`,
        link: `/admin/riders/${rider.id}`,
      },
      { transaction },
    );
    return present(rider, transaction);
  });

/** POST /rider/documents: one per type; a new upload replaces the old one. */
export const attachDocument = async (user, { type, url }) =>
  withTransaction(async (transaction) => {
    const rider = await ownRider(user, { transaction, lock: true });
    assertEditable(rider);
    const required = (await requiredDocuments('rider', { transaction })).find((d) => d.type === type);
    if (!required) throw new ValidationError({ type: 'Pick which document this is' });
    const upload = await ownUpload(user, url, 'rider_document', { transaction });

    const existing = await RiderDocument.findOne({ where: { riderId: rider.id, type }, transaction });
    const doc = existing
      ? await existing.update({ label: required.label, uploadId: upload.id }, { transaction })
      : await RiderDocument.create(
          { riderId: rider.id, type, label: required.label, uploadId: upload.id },
          { transaction },
        );
    doc.upload = upload;
    return toDocumentDto(doc);
  });

/** DELETE /rider/documents/{id}: only before submitting. */
export const removeDocument = async (user, id) =>
  withTransaction(async (transaction) => {
    const rider = await ownRider(user, { transaction, lock: true });
    assertEditable(rider);
    const doc = await lockForUpdate(RiderDocument, id, transaction, { where: { riderId: rider.id } });
    await doc.destroy({ transaction });
  });
