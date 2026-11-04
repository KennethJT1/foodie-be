// Store settings (FR-VEN-03), bank changes (BR-PAY-02) and staff logins (plan limit).
// Reference: foodie-fe src/mocks/handlers/vendor-store.js.
import { audit } from '../../core/audit/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors/index.js';
import { models, withTransaction } from '../../db/index.js';
import { notifyReviewers, resolveBank } from '../onboarding/onboarding.shared.js';
import { planLimitsFor } from '../subscriptions/plans.service.js';
import { activeBankAccount, imageField, ownVendor } from '../vendors/onboarding.service.js';
import { toAddressDto, toBankChangeDto, toOpeningHoursDto } from '../vendors/vendors.presenter.js';

const { BankChangeRequest, User, VendorOpeningHour, VendorStaff } = models;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Store settings; the bank account shows only its last 4 digits. */
const present = async (vendor, transaction) => {
  const [hours, bank, change] = await Promise.all([
    VendorOpeningHour.findAll({ where: { vendorId: vendor.id }, transaction }),
    activeBankAccount(vendor.id, { transaction }),
    BankChangeRequest.findOne({ where: { vendorId: vendor.id }, order: [['createdAt', 'DESC']], transaction }),
  ]);
  return {
    id: vendor.id,
    name: vendor.name,
    slug: vendor.slug,
    description: vendor.description,
    logo: vendor.logoUrl,
    cover: vendor.coverUrl,
    phone: vendor.phone,
    address: toAddressDto(vendor),
    isPaused: vendor.isPaused,
    deliveryRadiusKm: vendor.deliveryRadiusKm,
    prepTimeMins: vendor.prepTimeMins,
    openingHours: toOpeningHoursDto(hours),
    bank: bank && {
      bankName: bank.bankName,
      accountName: bank.accountName,
      accountNumberLast4: bank.accountNumber.slice(-4),
    },
    bankChangeRequest: toBankChangeDto(change),
  };
};

/** GET /vendor/store */
export const getStore = async (user) => present(await ownVendor(user));

/** Seven days, Sunday first; open before close unless closed. */
const readHours = (hours) => {
  if (!Array.isArray(hours) || hours.length !== 7) return { error: 'Set hours for every day' };
  for (const h of hours) {
    if (h?.closed) continue;
    if (!TIME.test(h?.open ?? '') || !TIME.test(h?.close ?? '')) return { error: 'Enter opening and closing times' };
    if (h.open >= h.close) return { error: 'Closing time must be after opening time' };
  }
  return {
    hours: hours.map((h, day) => ({
      day,
      opensAt: TIME.test(h.open ?? '') ? h.open : '09:00',
      closesAt: TIME.test(h.close ?? '') ? h.close : '21:00',
      isClosed: Boolean(h.closed),
    })),
  };
};

/** PATCH /vendor/store: hours, pause, delivery radius, prep time, description, logo, cover. */
export const updateStore = async (user, body) =>
  withTransaction(async (transaction) => {
    const vendor = await ownVendor(user, { transaction, lock: true });
    const errors = {};
    const patch = {};
    let hours;
    if (body.openingHours !== undefined) {
      const read = readHours(body.openingHours);
      if (read.error) errors.openingHours = read.error;
      else hours = read.hours;
    }
    if (body.deliveryRadiusKm !== undefined) {
      const r = body.deliveryRadiusKm;
      if (!(typeof r === 'number' && r >= 1 && r <= 30)) errors.deliveryRadiusKm = 'Pick a delivery radius';
      else patch.deliveryRadiusKm = r;
    }
    if (body.prepTimeMins !== undefined) {
      const m = body.prepTimeMins;
      if (!(Number.isInteger(m) && m >= 5 && m <= 120)) errors.prepTimeMins = 'Pick a usual preparation time';
      else patch.prepTimeMins = m;
    }
    if (body.description !== undefined) {
      const d = String(body.description ?? '').trim();
      if (d.length > 300) errors.description = 'Keep it under 300 characters';
      else patch.description = d;
    }
    if (body.isPaused !== undefined) {
      if (typeof body.isPaused !== 'boolean') errors.isPaused = 'Choose paused or taking orders';
      else patch.isPaused = body.isPaused;
    }
    if (Object.keys(errors).length) throw new ValidationError(errors);
    patch.logoUrl = await imageField(user, body.logo, vendor.logoUrl, 'vendor_logo', 'logo', transaction);
    patch.coverUrl = await imageField(user, body.cover, vendor.coverUrl, 'vendor_cover', 'cover', transaction);

    await vendor.update(patch, { transaction });
    if (hours) {
      await VendorOpeningHour.destroy({ where: { vendorId: vendor.id }, transaction });
      await VendorOpeningHour.bulkCreate(
        hours.map((h) => ({ ...h, vendorId: vendor.id })),
        { transaction },
      );
    }
    return present(vendor, transaction);
  });

/** POST /vendor/bank-change: resolved now, approved by an admin (BR-PAY-02). */
export const requestBankChange = async (user, body, req) =>
  withTransaction(async (transaction) => {
    const vendor = await ownVendor(user, { transaction, lock: true });
    if (await BankChangeRequest.findOne({ where: { vendorId: vendor.id, status: 'pending' }, transaction })) {
      throw new ConflictError('CONFLICT', 'You already have a bank change waiting for approval.');
    }
    const account = await resolveBank(user, body);
    const current = await activeBankAccount(vendor.id, { transaction });
    if (current && current.bankCode === account.bankCode && current.accountNumber === account.accountNumber) {
      throw new ValidationError({ accountNumber: 'This is already your settlement account' });
    }
    await BankChangeRequest.create({ vendorId: vendor.id, ...account }, { transaction });
    await audit.log(
      {
        actor: user,
        action: 'vendor.bank_change_requested',
        targetType: 'vendor',
        targetId: vendor.id,
        summary: `${vendor.name} asked to change their bank account`,
        req,
      },
      { transaction },
    );
    await notifyReviewers(
      'vendors.approve',
      {
        type: 'system',
        title: 'Bank change to review',
        body: `${vendor.name} wants to change their settlement account.`,
        link: `/admin/vendors/${vendor.id}`,
      },
      { transaction },
    );
    return present(vendor, transaction);
  });

// ── Staff ────────────────────────────────────────────────────────────────────

const toStaffDto = (s) => ({
  id: s.id,
  name: s.name,
  email: s.email,
  phone: s.phone ?? '',
  role: s.role,
  createdAt: s.createdAt.toISOString(),
});

/** GET /vendor/staff: { staff, limit, planName } */
export const listStaff = async (user) => {
  const vendor = await ownVendor(user);
  const [staff, limits] = await Promise.all([
    VendorStaff.findAll({ where: { vendorId: vendor.id }, order: [['createdAt', 'ASC']] }),
    planLimitsFor(vendor),
  ]);
  return { staff: staff.map(toStaffDto), limit: limits.staff, planName: limits.planName };
};

/** POST /vendor/staff: within the plan's staff limit (409 PLAN_LIMIT). */
export const addStaff = async (user, { name, email, phone, role }) =>
  withTransaction(async (transaction) => {
    const vendor = await ownVendor(user, { transaction, lock: true });
    const limits = await planLimitsFor(vendor, { transaction });
    const count = await VendorStaff.count({ where: { vendorId: vendor.id }, transaction });
    if (count >= limits.staff) {
      throw new ConflictError(
        'PLAN_LIMIT',
        `Your ${limits.planName} plan allows ${limits.staff} staff login${limits.staff === 1 ? '' : 's'}. Upgrade to add more.`,
      );
    }
    const taken =
      (await VendorStaff.findOne({ where: { email }, transaction })) ||
      (await User.findOne({ where: { email }, paranoid: false, transaction }));
    if (taken) throw new ValidationError({ email: 'That email already has an account' });
    const member = await VendorStaff.create(
      { vendorId: vendor.id, name, email, phone: phone || null, role },
      { transaction },
    );
    return toStaffDto(member);
  });

/** DELETE /vendor/staff/{id} */
export const removeStaff = async (user, id) => {
  const vendor = await ownVendor(user);
  const member = await VendorStaff.findOne({ where: { id, vendorId: vendor.id } });
  if (!member) throw new NotFoundError("We couldn't find that staff member.");
  await member.destroy();
};
