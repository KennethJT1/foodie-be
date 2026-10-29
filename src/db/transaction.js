import { NotFoundError } from '../core/errors/index.js';
import { sequelize } from './sequelize.js';

/**
 * Runs `fn(transaction)` in a transaction: commits when it resolves, rolls back when it throws.
 * Pass `{ transaction }` from a caller that already has one to join it instead of nesting, so
 * services can call each other inside one unit of work.
 */
export const withTransaction = (fn, { transaction } = {}) =>
  transaction ? fn(transaction) : sequelize.transaction((t) => fn(t));

/**
 * Row-lock pattern for state machines and money: read the row with SELECT ... FOR UPDATE
 * inside the transaction, check its state, then change it. Concurrent callers wait on the lock
 * and see the committed state, so two requests can't both accept the same order.
 *
 *   await withTransaction(async (transaction) => {
 *     const order = await lockForUpdate(Order, id, transaction, { where: { vendorId } });
 *     if (order.status !== 'paid') throw new ConflictError('INVALID_STATUS');
 *     await order.update({ status: 'accepted' }, { transaction });
 *   });
 *
 * `where` scopes the lookup (ownership); a missing or not-yours row is a 404 either way.
 */
export const lockForUpdate = async (Model, id, transaction, { where = {}, message } = {}) => {
  if (!transaction) throw new Error('lockForUpdate needs a transaction');
  const row = await Model.findOne({ where: { ...where, id }, transaction, lock: transaction.LOCK.UPDATE });
  if (!row) throw new NotFoundError(message);
  return row;
};
