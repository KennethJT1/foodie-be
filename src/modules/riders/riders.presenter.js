import { toDocumentDto } from '../onboarding/onboarding.shared.js';

const iso = (date) => (date ? date.toISOString() : null);

export const toGuarantorDto = (r) =>
  r.guarantorName
    ? {
        name: r.guarantorName,
        phone: r.guarantorPhone,
        relationship: r.guarantorRelationship,
        address: r.guarantorAddress,
      }
    : null;

/** Full payout account (the rider during onboarding, admins). */
export const toBankDto = (account) =>
  account && {
    bankCode: account.bankCode,
    bankName: account.bankName,
    accountNumber: account.accountNumber,
    accountName: account.accountName,
    verified: true,
  };

/** RiderOnboarding (contract `GET /rider/onboarding`; mock `serializeOnboarding`). */
export const toOnboardingDto = (r, { documents, bank, requiredDocuments }) => ({
  step: r.onboardingStep,
  approvalStatus: r.approvalStatus,
  rejectionReason: r.rejectionReason,
  submittedAt: iso(r.submittedAt),
  vehicleType: r.vehicleType,
  plateNumber: r.plateNumber,
  licenceNumber: r.licenceNumber,
  guarantor: toGuarantorDto(r),
  documents: documents.map(toDocumentDto),
  requiredDocuments,
  bank: toBankDto(bank),
});

/** RiderProfile for GET /rider/me: the payout account shows only its last 4 digits. */
export const toProfileDto = (r, { bank, payoutPct }) => ({
  id: r.id,
  name: r.user.name,
  phone: r.user.phone,
  approvalStatus: r.approvalStatus,
  rejectionReason: r.rejectionReason,
  isOnline: r.isOnline,
  vehicleType: r.vehicleType,
  plateNumber: r.plateNumber,
  rating: r.rating,
  ratingCount: r.ratingCount,
  tripsCount: r.tripsCount,
  city: r.city,
  lat: r.lat,
  lng: r.lng,
  payoutPct,
  bank: bank && {
    bankName: bank.bankName,
    accountName: bank.accountName,
    accountNumberLast4: bank.accountNumber.slice(-4),
  },
});

/** A row of GET /admin/riders (mock `riderRow`); `user` is included. */
export const toAdminRiderRow = (r) => ({
  id: r.id,
  name: r.user?.name ?? '',
  phone: r.user?.phone ?? '',
  city: r.city,
  vehicleType: r.vehicleType,
  plateNumber: r.plateNumber,
  approvalStatus: r.approvalStatus,
  isOnline: r.isOnline,
  // Riders on a delivery (phase 17 sets this from active deliveries)
  isBusy: false,
  rating: r.rating,
  ratingCount: r.ratingCount,
  tripsCount: r.tripsCount,
  lastSeenAt: iso(r.lastSeenAt),
  submittedAt: iso(r.submittedAt),
  createdAt: r.createdAt.toISOString(),
  lat: r.lat,
  lng: r.lng,
});
