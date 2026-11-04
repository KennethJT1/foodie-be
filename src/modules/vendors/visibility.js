// BR-SUB-06: a store is public only when approved with a live plan (trial, active or grace; an
// active plan cancelled at period end stays active until it ends). Every public read (feed, food
// items, vendors, storefronts) filters with these.

export const PUBLIC_SUBSCRIPTION_STATUSES = ['trial', 'active', 'grace'];

export const isVendorPublic = (vendor) =>
  Boolean(vendor) &&
  vendor.approvalStatus === 'approved' &&
  PUBLIC_SUBSCRIPTION_STATUSES.includes(vendor.subscriptionStatus);

/** `where` for Vendor queries (or an include) that must return only public stores. */
export const publicVendorWhere = () => ({
  approvalStatus: 'approved',
  subscriptionStatus: PUBLIC_SUBSCRIPTION_STATUSES,
});
