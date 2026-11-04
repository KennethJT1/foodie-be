// Admin vendor review (FR-VEN-02, BR-PAY-02). Reference behaviour: foodie-fe
// src/mocks/handlers/admin.js (vendorRow, vendorDetail, decisionHandlers, bank-change).
import { Op } from 'sequelize';
import { logger } from '../../config/logger.js';
import { audit } from '../../core/audit/index.js';
import { BadRequestError, NotFoundError } from '../../core/errors/index.js';
import { buildListQuery, paginate } from '../../core/query/index.js';
import { lockForUpdate, models, withTransaction } from '../../db/index.js';
import { paystack, paystackMode } from '../../integrations/paystack/paystack.client.js';
import { notify } from '../notifications/notifications.service.js';
import { decide, decisionMessage, toDocumentDto } from '../onboarding/onboarding.shared.js';
import { activeBankAccount } from './onboarding.service.js';
import { toAddressDto, toAdminVendorRow, toBankChangeDto, toBankDto } from './vendors.presenter.js';

const { Vendor, VendorDocument, BankChangeRequest, VendorBankAccount, User, Upload } = models;

// Extra pieces of the admin detail that later phases own (subscription: 12, menu: 13, orders: 15,
// refunds: 19). Each is `async (vendor) => partial detail`; phases register theirs here.
export const DETAIL_EXTENSIONS = [];

const ownerInclude = { model: User, as: 'owner', attributes: ['id', 'firstName', 'lastName', 'email', 'phone'] };
// Phases add includes the row needs (the plan name in phase 12)
export const ROW_INCLUDES = [ownerInclude];

// GET /admin/vendors (handoff section 3): search name, owner name, owner phone, city
const listConfig = () => ({
  searchFields: ['name', 'city', '$owner.first_name$', '$owner.last_name$', '$owner.phone$'],
  filters: {
    approvalStatus: 'approvalStatus',
    subscriptionStatus: 'subscriptionStatus',
    type: 'type',
    city: 'city',
  },
  defaultSort: '-createdAt',
  sortable: {
    createdAt: 'createdAt',
    submittedAt: 'submittedAt',
    approvedAt: 'approvedAt',
    name: 'name',
    city: 'city',
    rating: 'rating',
    approvalStatus: 'approvalStatus',
    subscriptionStatus: 'subscriptionStatus',
  },
  include: ROW_INCLUDES,
});

/** GET /admin/vendors: everything but drafts. */
export const listVendors = async (query) => {
  const listQuery = buildListQuery(query, listConfig());
  // Not a scope: a scope would drop the client's own approvalStatus filter
  listQuery.where = { [Op.and]: [listQuery.where, { approvalStatus: { [Op.ne]: 'draft' } }] };
  const { data, meta } = await paginate(Vendor, listQuery);
  return { data: data.map(toAdminVendorRow), meta };
};

const lockVendor = (id, transaction) =>
  lockForUpdate(Vendor, id, transaction, { message: "We couldn't find that vendor." });

/** Vendor detail with documents, full bank account, plan and 30-day numbers (mock `vendorDetail`). */
export const vendorDetail = async (vendorOrId, { transaction } = {}) => {
  const id = typeof vendorOrId === 'string' ? vendorOrId : vendorOrId.id;
  const vendor = await Vendor.findByPk(id, { include: ROW_INCLUDES, transaction });
  if (!vendor) throw new NotFoundError("We couldn't find that vendor.");
  const [documents, bank, bankChange] = await Promise.all([
    VendorDocument.findAll({
      where: { vendorId: id },
      include: [{ model: Upload, as: 'upload' }],
      order: [['createdAt', 'ASC']],
      transaction,
    }),
    activeBankAccount(id, { transaction }),
    BankChangeRequest.findOne({ where: { vendorId: id }, order: [['createdAt', 'DESC']], transaction }),
  ]);
  const extensions = await Promise.all(DETAIL_EXTENSIONS.map((extend) => extend(vendor, { transaction })));

  return Object.assign(
    {
      ...toAdminVendorRow(vendor),
      description: vendor.description,
      phone: vendor.phone,
      email: vendor.owner?.email ?? null,
      address: toAddressDto(vendor),
      lat: vendor.lat,
      lng: vendor.lng,
      deliveryRadiusKm: vendor.deliveryRadiusKm,
      prepTimeMins: vendor.prepTimeMins,
      isPaused: vendor.isPaused,
      rejectionReason: vendor.rejectionReason,
      suspensionReason: vendor.suspensionReason,
      approvedAt: vendor.approvedAt ? vendor.approvedAt.toISOString() : null,
      documents: documents.map(toDocumentDto),
      bank: toBankDto(bank),
      bankChangeRequest: toBankChangeDto(bankChange),
      subscription: null,
      followersCount: vendor.followersCount,
      itemCount: 0,
      stats: { orders30d: 0, gmv30d: 0, openRefunds: 0 },
    },
    ...extensions,
  );
};

/**
 * Creates the Paystack split subaccount for the vendor's active account if it has none. Best effort:
 * a Paystack failure is logged and the approval still stands; checkout (phase 15) calls this again
 * before it needs the code.
 */
export const ensureSubaccount = async (vendorId) => {
  if (!paystackMode.live()) return null;
  const account = await activeBankAccount(vendorId);
  if (!account || account.paystackSubaccountCode) return account?.paystackSubaccountCode ?? null;
  try {
    const vendor = await Vendor.findByPk(vendorId, { include: [ownerInclude] });
    const code = await paystack.createSubaccount({
      businessName: vendor.name,
      bankCode: account.bankCode,
      accountNumber: account.accountNumber,
      // KJT Foodie's share is set per transaction (delivery + processing fee), not as a percentage
      percentageCharge: 0,
      email: vendor.owner?.email ?? undefined,
    });
    await account.update({ paystackSubaccountCode: code });
    return code;
  } catch (err) {
    logger.error({ err, vendorId }, 'Could not create the Paystack subaccount');
    return null;
  }
};

/** POST /admin/vendors/{id}/approve|reject|suspend|reinstate */
export const decideVendor = async (actor, id, action, body, req) => {
  const vendor = await withTransaction(async (transaction) => {
    const v = await lockVendor(id, transaction);
    const { changes, reason } = decide(action, v, body);
    await v.update(changes, { transaction });
    const summary = {
      approve: `Approved ${v.name}`,
      reject: `Rejected ${v.name}: ${reason}`,
      suspend: `Suspended ${v.name}: ${reason}`,
      reinstate: `Reinstated ${v.name}`,
    }[action];
    await audit.log(
      { actor, action: `vendor.${action}`, targetType: 'vendor', targetId: v.id, summary, req },
      { transaction },
    );
    await notify(
      v.ownerUserId,
      { type: 'system', ...decisionMessage(action, 'vendor', reason), link: '/vendor/status' },
      { transaction },
    );
    return v;
  });
  if (action === 'approve') await ensureSubaccount(vendor.id);
  return vendorDetail(vendor.id);
};

/** POST /admin/vendors/{id}/bank-change/{decision} (BR-PAY-02) */
export const decideBankChange = async (actor, id, decision, req) => {
  if (!['approve', 'reject'].includes(decision)) throw new BadRequestError();
  const vendor = await withTransaction(async (transaction) => {
    const v = await lockVendor(id, transaction);
    const change = await BankChangeRequest.findOne({
      where: { vendorId: v.id, status: 'pending' },
      order: [['createdAt', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!change) throw new NotFoundError('There is no bank change to review.');

    const status = decision === 'approve' ? 'approved' : 'rejected';
    if (status === 'approved') {
      // The old account (and its subaccount code) is kept for history
      await VendorBankAccount.update(
        { status: 'replaced' },
        { where: { vendorId: v.id, status: 'active' }, transaction },
      );
      const { bankCode, bankName, accountNumber, accountName } = change;
      await VendorBankAccount.create(
        { vendorId: v.id, bankCode, bankName, accountNumber, accountName, status: 'active' },
        { transaction },
      );
    }
    await change.update({ status, decidedBy: actor.id, decidedAt: new Date() }, { transaction });
    await audit.log(
      {
        actor,
        action: `vendor.bank_change_${status}`,
        targetType: 'vendor',
        targetId: v.id,
        summary: `${status} bank change for ${v.name}`,
        req,
      },
      { transaction },
    );
    await notify(
      v.ownerUserId,
      {
        type: 'system',
        title: status === 'approved' ? 'Your new bank account is approved' : 'Your bank change was not approved',
        body: `${change.bankName} · ${change.accountName}`,
        link: '/vendor/settings',
      },
      { transaction },
    );
    return v;
  });
  if (decision === 'approve' && vendor.approvalStatus === 'approved') await ensureSubaccount(vendor.id);
  return vendorDetail(vendor.id);
};
