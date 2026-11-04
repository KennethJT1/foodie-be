import { toDocumentDto } from '../onboarding/onboarding.shared.js';

const iso = (date) => (date ? date.toISOString() : null);

export const toAddressDto = (v) =>
  v.addressLine1 ? { line1: v.addressLine1, area: v.area, city: v.city, state: v.state ?? '' } : null;

/** Full account for the owner during onboarding and for admins (`verified`: it was resolved). */
export const toBankDto = (account) =>
  account && {
    bankCode: account.bankCode,
    bankName: account.bankName,
    accountNumber: account.accountNumber,
    accountName: account.accountName,
    verified: true,
  };

export const toBankChangeDto = (request) =>
  request && {
    id: request.id,
    bankCode: request.bankCode,
    bankName: request.bankName,
    accountNumber: request.accountNumber,
    accountName: request.accountName,
    status: request.status,
    requestedAt: request.createdAt.toISOString(),
    decidedAt: iso(request.decidedAt),
  };

export const toOpeningHoursDto = (hours) =>
  [...hours]
    .sort((a, b) => a.day - b.day)
    .map((h) => ({ day: h.day, open: h.opensAt, close: h.closesAt, closed: h.isClosed }));

/** VendorOnboarding (contract). `documents` carry their upload; `bank` is the active account. */
export const toOnboardingDto = (v, { documents, bank, requiredDocuments }) => ({
  step: v.onboardingStep,
  approvalStatus: v.approvalStatus,
  rejectionReason: v.rejectionReason,
  submittedAt: iso(v.submittedAt),
  approvedAt: iso(v.approvedAt),
  type: v.type,
  name: v.name,
  slug: v.slug,
  description: v.description,
  phone: v.phone,
  logo: v.logoUrl,
  cover: v.coverUrl,
  address: toAddressDto(v),
  lat: v.lat,
  lng: v.lng,
  deliveryRadiusKm: v.deliveryRadiusKm,
  prepTimeMins: v.prepTimeMins,
  documents: documents.map(toDocumentDto),
  requiredDocuments,
  bank: toBankDto(bank),
});

/** A row of GET /admin/vendors (mock `vendorRow`); `owner` and `plan` are included. */
export const toAdminVendorRow = (v) => ({
  id: v.id,
  name: v.name || 'Unnamed store',
  slug: v.slug,
  logo: v.logoUrl,
  type: v.type,
  city: v.city,
  ownerName: v.owner?.name ?? '',
  ownerPhone: v.owner?.phone ?? '',
  approvalStatus: v.approvalStatus,
  subscriptionStatus: v.subscriptionStatus,
  planName: v.plan?.name ?? null,
  rating: v.rating,
  ratingCount: v.ratingCount,
  refundRate: v.refundRate,
  submittedAt: iso(v.submittedAt),
  createdAt: v.createdAt.toISOString(),
});
