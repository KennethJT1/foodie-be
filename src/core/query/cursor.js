import { parsePaging } from './buildListQuery.js';

// Cursor lists (feed, comments): `cursor` is the offset of the next row, as a string, the same as
// the frontend mock. The client treats it as opaque, so it can change later without breaking it.
export const FEED_DEFAULT_LIMIT = 10;
export const FEED_MAX_LIMIT = 50;

/** `cursor` + `limit` → `{ offset, limit }`; a bad cursor starts from the top. */
export const parseCursor = (query, { defaultLimit = FEED_DEFAULT_LIMIT, maxLimit = FEED_MAX_LIMIT } = {}) => {
  const raw = typeof query?.cursor === 'string' ? query.cursor : '';
  const offset = /^\d+$/.test(raw) ? Number(raw) : 0;
  return { offset, limit: parsePaging(query, { defaultLimit, maxLimit }).limit };
};

export const cursorMeta = ({ offset, limit, total }) => ({
  nextCursor: offset + limit < total ? String(offset + limit) : null,
  limit,
  total,
});

/**
 * Runs a cursor list over a model. `findOptions` holds where / order / include (from
 * buildListQuery or hand-written, e.g. the feed's ranking). Returns `{ data, meta }`.
 */
export const cursorPaginate = async (Model, findOptions, query, limits) => {
  const { offset, limit } = parseCursor(query, limits);
  const { where, include, order, ...rest } = findOptions;

  const total = await Model.count({ where, include, distinct: true, col: 'id', ...rest });
  const data = offset >= total ? [] : await Model.findAll({ where, include, order, offset, limit, ...rest });
  return { data, meta: cursorMeta({ offset, limit, total }) };
};
