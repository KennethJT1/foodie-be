// Vendor onboarding wizard (FR-VEN-01, FR-VEN-02): type → business → location → documents → bank
// → review → submitted. Reference behaviour: foodie-fe src/mocks/handlers/onboarding.js.
import { Op } from 'sequelize';
import { NotFoundError, ValidationError } from '../../core/errors/index.js';
import { normalisePhone, slugify } from '../../core/utils/index.js';
import { lockForUpdate, models, withTransaction } from '../../db/index.js';
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
import { requiredDocuments } from '../settings/settings.service.js';
import { toOnboardingDto } from './vendors.presenter.js';

const { Vendor, VendorDocument, VendorBankAccount, VendorOpeningHour, ServiceArea, Upload } = models;

export const STEPS = ['type', 'business', 'location', 'documents', 'bank', 'review'];
const VENDOR_TYPES = ['restaurant', 'home_cook'];

/** The signed-in owner's store (404 if the profile is missing). */
export const ownVendor = async (user, { transaction, lock = false } = {}) => {
  const vendor = await Vendor.findOne({
    where: { ownerUserId: user.id },
    transaction,
    ...(lock && { lock: transaction.LOCK.UPDATE }),
  });
  if (!vendor) throw new NotFoundError();
  return vendor;
};

const documentsOf = (vendorId, transaction) =>
  VendorDocument.findAll({
    where: { vendorId },
    include: [{ model: Upload, as: 'upload' }],
    order: [['createdAt', 'ASC']],
    transaction,
  });

export const activeBankAccount = (vendorId, { transaction } = {}) =>
  VendorBankAccount.findOne({ where: { vendorId, status: 'active' }, transaction });

const requiredFor = (vendor, transaction) =>
  vendor.type ? requiredDocuments(vendor.type, { transaction }) : Promise.resolve([]);

const present = async (vendor, transaction) => {
  const [documents, bank, required] = await Promise.all([
    documentsOf(vendor.id, transaction),
    activeBankAccount(vendor.id, { transaction }),
    requiredFor(vendor, transaction),
  ]);
  return toOnboardingDto(vendor, { documents, bank, requiredDocuments: required });
};

/** GET /vendor/onboarding */
export const getOnboarding = async (user) => present(await ownVendor(user));

const text = (value) => String(value ?? '').trim();

/** A logo / cover URL: unchanged, cleared, or one of the owner's own uploads for that purpose. */
const imageField = async (user, value, current, purpose, field, transaction) => {
  if (value === undefined || value === current) return current ?? null;
  if (value === null || value === '') return null;
  return (await ownUpload(user, value, purpose, { transaction, field })).url;
};

/** Each step validates its fields and returns the changes to save, or throws 422. */
const STEP_HANDLERS = {
  async type(user, vendor, body, transaction) {
    if (!VENDOR_TYPES.includes(body.type)) throw new ValidationError({ type: 'Pick what kind of vendor you are' });
    // Documents for the other type no longer count
    const wanted = (await requiredDocuments(body.type, { transaction })).map((d) => d.type);
    await VendorDocument.destroy({ where: { vendorId: vendor.id, type: { [Op.notIn]: wanted } }, transaction });
    return { type: body.type };
  },

  async business(user, vendor, body, transaction) {
    const errors = {};
    const name = text(body.name);
    const slug = slugify(name);
    if (name.length < 2 || !slug) errors.name = 'Enter your business name';
    else if (name.length > 120) errors.name = 'Keep it under 120 characters';
    else if (await Vendor.findOne({ where: { slug, id: { [Op.ne]: vendor.id } }, paranoid: false, transaction }))
      errors.name = 'Another store already uses that name. Try adding your area.';
    const description = text(body.description);
    if (description.length > 300) errors.description = 'Keep it under 300 characters';
    const phone = normalisePhone(body.phone);
    if (!phone) errors.phone = 'Enter a valid Nigerian phone number';
    if (Object.keys(errors).length) throw new ValidationError(errors);

    return {
      name,
      slug,
      description,
      phone,
      logoUrl: await imageField(user, body.logo, vendor.logoUrl, 'vendor_logo', 'logo', transaction),
      coverUrl: await imageField(user, body.cover, vendor.coverUrl, 'vendor_cover', 'cover', transaction),
    };
  },

  async location(user, vendor, body, transaction) {
    const errors = {};
    const a = body.address && typeof body.address === 'object' ? body.address : {};
    const line1 = text(a.line1);
    const area = text(a.area);
    if (!line1) errors['address.line1'] = 'Enter the street address';
    else if (line1.length > 200) errors['address.line1'] = 'Keep it under 200 characters';
    if (!area) errors['address.area'] = 'Enter the area';
    else if (area.length > 100) errors['address.area'] = 'Keep it under 100 characters';
    // Only cities we serve; the stored name is the service area's own spelling
    const city =
      text(a.city) && (await ServiceArea.findOne({ where: { name: text(a.city), isActive: true }, transaction }));
    if (!city) errors['address.city'] = 'Pick a city';
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const hasPin = body.lat != null && body.lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    if (!hasPin) errors.pin = 'Drop a pin where riders pick up food';
    const radius = Number(body.deliveryRadiusKm);
    if (!(radius >= 1 && radius <= 30)) errors.deliveryRadiusKm = 'Pick a delivery radius';
    const prep = Number(body.prepTimeMins);
    if (!(Number.isInteger(prep) && prep >= 5 && prep <= 120)) errors.prepTimeMins = 'Pick a usual preparation time';
    if (Object.keys(errors).length) throw new ValidationError(errors);

    return {
      addressLine1: line1,
      area,
      city: city.name,
      state: text(a.state) || city.state || '',
      lat,
      lng,
      deliveryRadiusKm: radius,
      prepTimeMins: prep,
    };
  },

  async documents(user, vendor, body, transaction) {
    const [required, documents] = await Promise.all([
      requiredFor(vendor, transaction),
      documentsOf(vendor.id, transaction),
    ]);
    const errors = missingDocumentErrors(required, documents, (d) => `Upload your ${d.label.split(' (')[0]}`);
    if (Object.keys(errors).length) throw new ValidationError(errors);
    return {};
  },

  async bank(user, vendor, body, transaction) {
    const account = await resolveBank(user, body);
    // Before approval there is no subaccount yet, so the account is simply replaced
    const current = await activeBankAccount(vendor.id, { transaction });
    if (current) await current.update(account, { transaction });
    else await VendorBankAccount.create({ vendorId: vendor.id, ...account }, { transaction });
    return {};
  },
};

/** PATCH /vendor/onboarding: saves one step; saved progress only moves forward. */
export const saveStep = async (user, body) =>
  withTransaction(async (transaction) => {
    const vendor = await ownVendor(user, { transaction, lock: true });
    assertEditable(vendor);
    const { step } = body;
    if (!Object.hasOwn(STEP_HANDLERS, step)) throw new ValidationError({ step: 'Unknown step' });
    if (step !== 'type' && !vendor.type) throw new ValidationError({ type: 'Pick what kind of vendor you are first' });

    const changes = await STEP_HANDLERS[step](user, vendor, body, transaction);
    await vendor.update(
      { ...changes, onboardingStep: advanceStep(STEPS, vendor.onboardingStep, step) },
      { transaction },
    );
    return present(vendor, transaction);
  });

/** Monday–Saturday 09:00–21:00, Sunday 12:00–21:00; owners change them in store settings. */
const DEFAULT_HOURS = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day,
  opensAt: day === 0 ? '12:00' : '09:00',
  closesAt: '21:00',
  isClosed: false,
}));

/** POST /vendor/onboarding/submit: status pending; reviewers are told (FR-VEN-02). */
export const submit = async (user) =>
  withTransaction(async (transaction) => {
    const vendor = await ownVendor(user, { transaction, lock: true });
    assertEditable(vendor);
    const [required, documents, bank] = await Promise.all([
      requiredFor(vendor, transaction),
      documentsOf(vendor.id, transaction),
      activeBankAccount(vendor.id, { transaction }),
    ]);
    const unfinished = {
      ...(!vendor.type && { type: 'Pick what kind of vendor you are' }),
      ...(!vendor.slug && { business: 'Add your business details' }),
      ...(vendor.lat == null && { location: 'Add your address and drop a pin' }),
      ...(missingDocuments(required, documents).length && { documents: 'Upload every required document' }),
      ...(!bank && { bank: 'Add the bank account for your payouts' }),
    };
    if (Object.keys(unfinished).length) {
      throw new ValidationError(unfinished, 'Some steps are not finished yet. Check each step and try again.');
    }

    await vendor.update(
      { approvalStatus: 'pending', rejectionReason: null, submittedAt: new Date(), onboardingStep: 'submitted' },
      { transaction },
    );
    if (!(await VendorOpeningHour.count({ where: { vendorId: vendor.id }, transaction }))) {
      await VendorOpeningHour.bulkCreate(
        DEFAULT_HOURS.map((h) => ({ ...h, vendorId: vendor.id })),
        { transaction },
      );
    }
    await notifyReviewers(
      'vendors.approve',
      {
        type: 'system',
        title: 'New vendor to review',
        body: `${vendor.name} sent their documents for approval.`,
        link: `/admin/vendors/${vendor.id}`,
      },
      { transaction },
    );
    return present(vendor, transaction);
  });

/** POST /vendor/documents: one per type; a new upload replaces the old one. */
export const attachDocument = async (user, { type, url }) =>
  withTransaction(async (transaction) => {
    const vendor = await ownVendor(user, { transaction, lock: true });
    assertEditable(vendor);
    const required = (await requiredFor(vendor, transaction)).find((d) => d.type === type);
    if (!required) throw new ValidationError({ type: 'Pick which document this is' });
    if (!url) throw new ValidationError({ url: 'Add a photo or scan of the document' });
    const upload = await ownUpload(user, url, 'vendor_document', { transaction });

    const existing = await VendorDocument.findOne({ where: { vendorId: vendor.id, type }, transaction });
    const doc = existing
      ? await existing.update({ label: required.label, uploadId: upload.id }, { transaction })
      : await VendorDocument.create(
          { vendorId: vendor.id, type, label: required.label, uploadId: upload.id },
          { transaction },
        );
    doc.upload = upload;
    return toDocumentDto(doc);
  });

/** DELETE /vendor/documents/{id}: only before submitting. */
export const removeDocument = async (user, id) =>
  withTransaction(async (transaction) => {
    const vendor = await ownVendor(user, { transaction, lock: true });
    assertEditable(vendor);
    const doc = await lockForUpdate(VendorDocument, id, transaction, { where: { vendorId: vendor.id } });
    await doc.destroy({ transaction });
  });
