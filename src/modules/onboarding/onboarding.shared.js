// What vendor (phase 10) and rider (phase 11) onboarding and their admin reviews have in common:
// forward-only wizard steps, documents from POST /uploads, resolved bank accounts and the
// approve / reject / suspend / reinstate decisions.
import { adminsWithPermission } from '../../core/auth/index.js';
import { ConflictError, ValidationError } from '../../core/errors/index.js';
import { models } from '../../db/index.js';
import { resolveAccount } from '../banks/banks.service.js';
import { notify } from '../notifications/notifications.service.js';
import { uploadUrl } from '../uploads/uploads.service.js';

/** Applications can be edited only before they are sent, or after a rejection. */
export const EDITABLE = ['draft', 'rejected'];

export const assertEditable = (profile) => {
  if (!EDITABLE.includes(profile.approvalStatus)) {
    throw new ConflictError('ALREADY_SUBMITTED', 'Your details are with our team. Contact support to change them.');
  }
};

/**
 * The saved step after `step` was saved: the step after it when that is further than where the
 * applicant had got to, otherwise unchanged (going back to edit never loses progress).
 * `steps` ends with `review`; `submitted` never moves.
 */
export const advanceStep = (steps, current, step) => {
  if (current === 'submitted') return current;
  const next = steps[steps.indexOf(step) + 1];
  return steps.indexOf(next) > steps.indexOf(current) ? next : current;
};

/** The caller's own upload for that URL and purpose, or a 422 on `url`. */
export const ownUpload = async (user, url, purpose, { transaction, field = 'url' } = {}) => {
  const upload = url && (await models.Upload.findOne({ where: { url, userId: user.id, purpose }, transaction }));
  if (!upload) throw new ValidationError({ [field]: 'Upload the file again, then try once more' });
  return upload;
};

/** `{ id, type, label, url, uploadedAt }`; private files get a fresh signed link. */
export const toDocumentDto = (doc) => ({
  id: doc.id,
  type: doc.type,
  label: doc.label,
  url: uploadUrl(doc.upload),
  uploadedAt: doc.updatedAt.toISOString(),
});

/** Required documents with no upload yet. */
export const missingDocuments = (required, documents) =>
  required.filter((r) => !documents.some((d) => d.type === r.type));

/** `fieldErrors` for the documents step: one entry per missing document type. */
export const missingDocumentErrors = (required, documents, describe) =>
  Object.fromEntries(missingDocuments(required, documents).map((d) => [d.type, describe(d)]));

/** Resolves the account through Paystack (or the local stand-in) before it is saved. */
export const resolveBank = (user, body) => {
  const fieldErrors = {};
  if (!body.bankCode) fieldErrors.bankCode = 'Pick your bank';
  if (!/^\d{10}$/.test(String(body.accountNumber ?? '')))
    fieldErrors.accountNumber = 'Enter the 10-digit account number';
  if (Object.keys(fieldErrors).length) throw new ValidationError(fieldErrors);
  return resolveAccount(user, { bankCode: String(body.bankCode), accountNumber: String(body.accountNumber) });
};

/** Tells every admin who can decide (`vendors.approve` / `riders.approve`) about an application. */
export const notifyReviewers = async (permission, payload, { transaction } = {}) => {
  const admins = await adminsWithPermission(permission, { transaction });
  await Promise.all(admins.map((admin) => notify(admin.id, payload, { transaction })));
};

/**
 * Admin decisions on an application (mock `decisionHandlers`). Each returns the fields to set and
 * what the owner is told; a wrong current status is 409 INVALID_STATUS.
 */
export const DECISIONS = {
  approve: {
    from: 'pending',
    wrongStatus: 'Only pending applications can be approved.',
    apply: () => ({ approvalStatus: 'approved', approvedAt: new Date(), rejectionReason: null }),
  },
  reject: {
    from: 'pending',
    wrongStatus: 'Only pending applications can be rejected.',
    needsReason: true,
    apply: (reason) => ({ approvalStatus: 'rejected', rejectionReason: reason }),
  },
  suspend: {
    from: 'approved',
    wrongStatus: 'Only approved accounts can be suspended.',
    needsReason: true,
    apply: (reason) => ({ approvalStatus: 'suspended', suspensionReason: reason }),
  },
  reinstate: {
    from: 'suspended',
    wrongStatus: 'This account is not suspended.',
    apply: () => ({ approvalStatus: 'approved', suspensionReason: null }),
  },
};

/** Checks the decision fits the profile's status and returns `{ changes, reason }`. */
export const decide = (action, profile, body = {}) => {
  const decision = DECISIONS[action];
  if (profile.approvalStatus !== decision.from) throw new ConflictError('INVALID_STATUS', decision.wrongStatus);
  const reason = String(body.reason ?? '').trim();
  if (decision.needsReason && !reason) throw new ValidationError({ reason: 'Give a reason' });
  if (reason.length > 500) throw new ValidationError({ reason: 'Keep it under 500 characters' });
  return { changes: decision.apply(reason), reason };
};

/** What the owner is told after each decision (`label` is vendor or rider). */
export const decisionMessage = (action, label, reason) =>
  ({
    approve:
      label === 'vendor'
        ? { title: 'Your store is approved', body: 'Pick a plan and start your free trial to go live.' }
        : { title: "You're approved", body: 'Go online to start getting delivery jobs.' },
    reject: { title: "We couldn't approve your application yet", body: reason },
    suspend: { title: 'Your account is suspended', body: reason },
    reinstate: { title: 'Your account is active again', body: 'Welcome back.' },
  })[action];
