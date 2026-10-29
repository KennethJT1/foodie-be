import { NotFoundError } from '../../core/errors/index.js';
import { models, withTransaction } from '../../db/index.js';

const { Address } = models;

const NOT_FOUND = "We couldn't find that address.";

export const toAddressDto = (a) => ({
  id: a.id,
  label: a.label,
  line1: a.line1,
  area: a.area,
  city: a.city,
  state: a.state,
  lat: a.lat,
  lng: a.lng,
  directions: a.directions ?? '',
  isDefault: a.isDefault,
});

const mine = (userId, transaction) =>
  Address.findAll({
    where: { userId },
    order: [
      ['isDefault', 'DESC'],
      ['createdAt', 'ASC'],
      ['id', 'ASC'],
    ],
    transaction,
  });

const findMine = async (userId, id, transaction) => {
  const address = await Address.findOne({ where: { id, userId }, transaction, lock: transaction?.LOCK.UPDATE });
  if (!address) throw new NotFoundError(NOT_FOUND);
  return address;
};

const makeDefault = async (userId, id, transaction) => {
  await Address.update({ isDefault: false }, { where: { userId }, transaction });
  await Address.update({ isDefault: true }, { where: { userId, id }, transaction });
};

/** GET /addresses: default first. */
export const listAddresses = async (userId) => (await mine(userId)).map(toAddressDto);

/** POST /addresses: the first address becomes the default. */
export const createAddress = (userId, { isDefault, ...fields }) =>
  withTransaction(async (transaction) => {
    const isFirst = (await Address.count({ where: { userId }, transaction })) === 0;
    const address = await Address.create({ ...fields, userId, isDefault: false }, { transaction });
    if (isFirst || isDefault) await makeDefault(userId, address.id, transaction);
    await address.reload({ transaction });
    return toAddressDto(address);
  });

export const updateAddress = (userId, id, { isDefault, ...fields }) =>
  withTransaction(async (transaction) => {
    const address = await findMine(userId, id, transaction);
    await address.update(fields, { transaction });
    if (isDefault) await makeDefault(userId, id, transaction);
    await address.reload({ transaction });
    return toAddressDto(address);
  });

export const setDefaultAddress = (userId, id) =>
  withTransaction(async (transaction) => {
    const address = await findMine(userId, id, transaction);
    await makeDefault(userId, id, transaction);
    await address.reload({ transaction });
    return toAddressDto(address);
  });

/** DELETE /addresses/{id}: if it was the default, the oldest remaining one takes over. */
export const deleteAddress = (userId, id) =>
  withTransaction(async (transaction) => {
    const address = await findMine(userId, id, transaction);
    await address.destroy({ transaction });
    if (address.isDefault) {
      const [next] = await mine(userId, transaction);
      if (next) await makeDefault(userId, next.id, transaction);
    }
    return { id, deleted: true };
  });
