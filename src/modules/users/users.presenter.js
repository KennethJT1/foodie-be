import { permissionsFor } from '../../core/auth/index.js';
import { models } from '../../db/index.js';

const { Vendor, Rider } = models;

/**
 * The `User` the API returns (contract schema User): never the password hash; fresh
 * `permissions` for admins, `vendor { ... }` for vendors, `rider { ... }` for riders, because the
 * frontend's route guards read them after every approval, plan or online change.
 */
export const toUserDto = async (user) => {
  const dto = {
    id: user.id,
    role: user.role,
    ...(user.role === 'admin' && { adminRole: user.adminRole }),
    permissions: await permissionsFor(user),
    firstName: user.firstName,
    lastName: user.lastName,
    name: user.name,
    email: user.email ?? null,
    phone: user.phone ?? null,
    avatar: user.avatarUrl ?? null,
    status: user.status,
    phoneVerified: Boolean(user.phoneVerifiedAt),
    createdAt: user.createdAt.toISOString(),
  };

  if (user.role === 'vendor') {
    const v = user.vendor ?? (await Vendor.findOne({ where: { ownerUserId: user.id } }));
    dto.vendor = v && {
      id: v.id,
      name: v.name,
      slug: v.slug,
      approvalStatus: v.approvalStatus,
      subscriptionStatus: v.subscriptionStatus,
      planId: v.planId,
      onboardingStep: v.onboardingStep,
      logo: v.logoUrl,
    };
  }
  if (user.role === 'rider') {
    const r = user.rider ?? (await Rider.findOne({ where: { userId: user.id } }));
    dto.rider = r && { id: r.id, approvalStatus: r.approvalStatus, isOnline: r.isOnline };
  }
  return dto;
};
