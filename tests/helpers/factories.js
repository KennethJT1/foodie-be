import { ensureAdminRoles, hashPassword, signAccessToken } from '../../src/core/auth/index.js';
import { models } from '../../src/db/index.js';
import { categoryId, SEED_IDS } from '../../src/db/seed/ids.js';

const { User, Vendor, Rider } = models;

export const PASSWORD = 'password123';
let hash;
let n = 0;

/** Creates a user (+ vendor / rider profile for those roles). Defaults are a unique customer. */
export const createUser = async ({ vendor, rider, ...overrides } = {}) => {
  hash ??= await hashPassword(PASSWORD);
  if (overrides.role === 'admin') await ensureAdminRoles();
  n += 1;
  const user = await User.create({
    role: 'customer',
    firstName: 'Test',
    lastName: `User${n}`,
    email: `user${n}.${Date.now()}@kjtfoodie.test`,
    phone: `+234803${String(Date.now() + n).slice(-7)}`,
    passwordHash: hash,
    ...overrides,
  });
  if (user.role === 'vendor') await Vendor.create({ ownerUserId: user.id, ...vendor });
  if (user.role === 'rider') await Rider.create({ userId: user.id, ...rider });
  return user;
};

/** `Authorization` header value for a user. */
export const bearer = (user) => `Bearer ${signAccessToken(user)}`;

/** An `uploads` row as POST /uploads would leave it (no Cloudinary call); returns the row. */
export const createUpload = async (user, purpose) => {
  n += 1;
  const isPrivate = purpose.endsWith('_document');
  return models.Upload.create({
    userId: user.id,
    purpose,
    publicId: `test/${purpose}/${n}`,
    resourceType: 'image',
    isPrivate,
    format: 'webp',
    url: `https://res.cloudinary.com/test/image/${isPrivate ? 'private' : 'upload'}/${purpose}-${n}-${Date.now()}.webp`,
    width: 800,
    height: 600,
    bytes: 1000,
  });
};

/**
 * A public store (approved, live plan, a Yaba pin, open every day all day) with its owner.
 * `vendor` overrides vendor columns.
 */
export const createPublicVendor = async ({ vendor, ...user } = {}) => {
  const owner = await createUser({ role: 'vendor', ...user });
  const row = await models.Vendor.findOne({ where: { ownerUserId: owner.id } });
  n += 1;
  await row.update({
    name: `Store ${n}`,
    slug: `store-${n}-${Date.now()}`,
    type: 'restaurant',
    approvalStatus: 'approved',
    subscriptionStatus: 'active',
    planId: SEED_IDS.planPro,
    addressLine1: '1 Herbert Macaulay Way',
    area: 'Yaba',
    city: 'Lagos',
    state: 'Lagos',
    lat: 6.5158,
    lng: 3.3794,
    deliveryRadiusKm: 10,
    ...vendor,
  });
  await models.VendorOpeningHour.bulkCreate(
    [0, 1, 2, 3, 4, 5, 6].map((day) => ({ vendorId: row.id, day, opensAt: '00:00', closesAt: '23:59' })),
  );
  return { owner, vendor: row };
};

/** A dish on `vendor`'s menu (category must exist: seed CATEGORIES first). */
export const createFoodItem = (vendor, overrides = {}) => {
  n += 1;
  return models.FoodItem.create({
    vendorId: vendor.id,
    categoryId: categoryId('rice'),
    name: `Dish ${n}`,
    slug: `dish-${n}`,
    description: 'Tasty',
    price: 250000,
    photos: [`https://res.cloudinary.com/test/image/upload/dish-${n}.webp`],
    optionGroups: [],
    ...overrides,
  });
};

/**
 * An order row written straight to the database (no checkout), for tests that only need one in a
 * given state. With `rider` and a ridden status it also gets a delivery; `deliveredAt` dates it.
 */
export const createOrderRow = async ({
  customer,
  vendor,
  rider,
  status = 'delivered',
  deliveryFee = 150000,
  deliveredAt = new Date(),
  address = {
    label: 'Home',
    line1: '5 Commercial Avenue',
    area: 'Yaba',
    city: 'Lagos',
    state: 'Lagos',
    lat: 6.5095,
    lng: 3.3711,
  },
} = {}) => {
  n += 1;
  const at = deliveredAt.toISOString();
  const order = await models.Order.create({
    code: `T${String(Date.now() + n).slice(-5)}`,
    customerId: customer.id,
    vendorId: vendor.id,
    riderId: rider?.id ?? null,
    status,
    customerName: customer.name,
    customerPhone: customer.phone,
    vendorName: vendor.name,
    vendorSlug: vendor.slug,
    subtotal: 500000,
    deliveryFee,
    processingFee: 10000,
    total: 500000 + deliveryFee + 10000,
    address,
    deliveryCode: '4321',
    distanceM: 2500,
    etaMinMins: 25,
    etaMaxMins: 35,
    acceptDeadline: new Date(deliveredAt.getTime() - 60 * 60 * 1000),
    statusHistory: [{ status: 'paid', at, by: 'system' }, ...(status === 'paid' ? [] : [{ status, at, by: 'rider' }])],
    paymentReference: `KJT_TEST_${Date.now()}_${n}`,
  });
  if (rider && ['rider_assigned', 'picked_up', 'delivered'].includes(status)) {
    const delivered = status === 'delivered';
    order.delivery = await models.Delivery.create({
      orderId: order.id,
      riderId: rider.id,
      status: { rider_assigned: 'assigned', picked_up: 'picked_up', delivered: 'delivered' }[status],
      fee: deliveryFee,
      payoutPct: 70,
      riderEarning: delivered ? Math.round(deliveryFee * 0.7) : 0,
      distanceM: 2500,
      pickup: { name: vendor.name, phone: null, address: 'Yaba', lat: vendor.lat, lng: vendor.lng },
      dropoff: {
        name: customer.name,
        phone: null,
        address: address.line1,
        note: '',
        lat: address.lat,
        lng: address.lng,
      },
      route: [],
      assignedAt: deliveredAt,
      pickedUpAt: status === 'rider_assigned' ? null : deliveredAt,
      deliveredAt: delivered ? deliveredAt : null,
    });
  }
  return order;
};
