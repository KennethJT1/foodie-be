import { Op } from 'sequelize';
import { isLagosDay, lagosDayEnd, lagosDayStart } from '../utils/dates.js';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

/** First usable string for a query param (`?a=1&a=2` arrives as an array; objects are ignored). */
const param = (query, name) => {
  const raw = query?.[name];
  const value = Array.isArray(raw) ? raw.filter((v) => typeof v === 'string').join(',') : raw;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
};

/** `page` ≥ 1 and `limit` 1..max, falling back to the defaults for anything unusable. */
export const parsePaging = (query, { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {}) => ({
  page: Math.max(Math.floor(Number(param(query, 'page'))) || 1, 1),
  limit: clamp(Math.floor(Number(param(query, 'limit'))) || defaultLimit, 1, maxLimit),
});

// `%`, `_` and `\` are LIKE wildcards; a search for "50%" means the text "50%"
const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

const PARSERS = {
  string: (v) => v,
  integer: (v) => (/^-?\d+$/.test(v) ? Number(v) : undefined),
  number: (v) => (v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined),
  boolean: (v) => ({ true: true, false: false })[v.toLowerCase()],
};

const OPERATORS = {
  eq: (values) => (values.length === 1 ? values[0] : { [Op.in]: values }),
  gte: ([value]) => ({ [Op.gte]: value }),
  lte: ([value]) => ({ [Op.lte]: value }),
  gt: ([value]) => ({ [Op.gt]: value }),
  lt: ([value]) => ({ [Op.lt]: value }),
  prefix: (values) =>
    values.length === 1
      ? { [Op.like]: `${escapeLike(values[0])}%` }
      : { [Op.or]: values.map((v) => ({ [Op.like]: `${escapeLike(v)}%` })) },
};

/** A filter config entry → { field, op, type } (a plain string is an exact-match field). */
const normaliseFilter = (name, spec) => {
  if (typeof spec === 'function') return { custom: spec };
  const { field = name, op = 'eq', type = 'string' } = typeof spec === 'string' ? { field: spec } : spec;
  if (!OPERATORS[op]) throw new Error(`Unknown filter op "${op}" for ${name}`);
  if (!PARSERS[type]) throw new Error(`Unknown filter type "${type}" for ${name}`);
  return { field, op, type };
};

/** `-rating,name` → [['rating', 'DESC'], ['name', 'ASC']], keeping only whitelisted keys. */
const parseSort = (sort, sortable) =>
  (sort ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
    .map((key) => (key.startsWith('-') ? [key.slice(1), 'DESC'] : [key, 'ASC']))
    .filter(([key]) => Object.hasOwn(sortable, key))
    .flatMap(([key, direction]) => {
      const target = sortable[key];
      // A function returning an order item, several columns ([['firstName'], ['lastName']]),
      // a nested path (['vendor', 'name']) or a column name
      if (typeof target === 'function') return [target(direction)];
      if (Array.isArray(target) && Array.isArray(target[0])) return target.map((path) => [...path, direction]);
      return [Array.isArray(target) ? [...target, direction] : [target, direction]];
    });

/** `YYYY-MM-DD` (a whole Lagos day) or a full ISO timestamp → Date; anything else → undefined. */
const parseDate = (value, edge) => {
  if (!value) return undefined;
  if (isLagosDay(value)) return edge === 'start' ? lagosDayStart(value) : lagosDayEnd(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/**
 * Turns list query params (05-backend-handoff.md, section 3) into Sequelize find options.
 *
 * @param {object} query  req.query
 * @param {object} config
 * @param {string[]} [config.searchFields]  attributes or `$assoc.column$` paths searched by `search`.
 *   `$assoc.column$` must point at a belongsTo / hasOne include: with `limit`, Sequelize moves the main
 *   query into a subquery when a hasMany is included, and the joined column is then out of reach.
 *   To search or filter on hasMany rows, use a custom filter with an `id IN (SELECT ...)` subquery.
 * @param {Record<string, string | object | Function>} [config.filters]  param name → attribute,
 *   `{ field, op: 'eq'|'gte'|'lte'|'gt'|'lt'|'prefix', type: 'string'|'integer'|'number'|'boolean' }`,
 *   or `(values, query) => where | undefined` for custom filters (geo)
 * @param {string} [config.dateField]  attribute `from` / `to` apply to (default createdAt)
 * @param {string} [config.defaultSort]  used when `sort` has no whitelisted key
 * @param {Record<string, string | string[] | string[][] | Function>} [config.sortable]  API sort key →
 *   attribute, nested path, several columns, or a function
 * @param {object[]} [config.include]  Sequelize includes (needed for `$assoc.column$` search/sort)
 * @param {object} [options]
 * @param {object} [options.scope]  where conditions that always apply (who may see what); any client
 *   filter on the same attribute is dropped, so the scope always wins
 */
export const buildListQuery = (query, config = {}, { scope, defaultLimit, maxLimit } = {}) => {
  const {
    searchFields = [],
    filters = {},
    dateField = 'createdAt',
    defaultSort = '-createdAt',
    sortable = {},
    include,
  } = config;
  const scopedFields = new Set(Object.keys(scope ?? {}));
  const conditions = [];

  const search = param(query, 'search');
  if (search && searchFields.length) {
    const pattern = `%${escapeLike(search)}%`;
    // The database collation (utf8mb4_0900_ai_ci) makes LIKE case- and accent-insensitive
    conditions.push({ [Op.or]: searchFields.map((field) => ({ [field]: { [Op.like]: pattern } })) });
  }

  for (const [name, spec] of Object.entries(filters)) {
    const raw = param(query, name);
    if (raw === undefined) continue;
    const filter = normaliseFilter(name, spec);

    if (filter.custom) {
      const where = filter.custom(
        raw.split(',').map((v) => v.trim()),
        query,
      );
      if (where) conditions.push(where);
      continue;
    }
    if (scopedFields.has(filter.field)) continue;

    const values = raw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .map(PARSERS[filter.type])
      .filter((v) => v !== undefined);
    if (values.length) conditions.push({ [filter.field]: OPERATORS[filter.op](values) });
  }

  const from = parseDate(param(query, 'from'), 'start');
  const to = parseDate(param(query, 'to'), 'end');
  if (from || to) {
    conditions.push({ [dateField]: { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) } });
  }

  if (scope && scopedFields.size) conditions.push(scope);

  let order = parseSort(param(query, 'sort'), sortable);
  if (!order.length) order = parseSort(defaultSort, { ...sortableFrom(defaultSort), ...sortable });
  // Tie-breaker so rows never swap between pages when the sort values are equal
  order.push(['id', 'ASC']);

  return {
    where: conditions.length ? { [Op.and]: conditions } : {},
    order,
    ...(include && { include }),
    ...parsePaging(query, { defaultLimit, maxLimit }),
  };
};

// The default sort is trusted config, so its plain keys need not be in the whitelist
const sortableFrom = (sort) =>
  Object.fromEntries(
    sort
      .split(',')
      .map((key) => key.trim().replace(/^-/, ''))
      .filter(Boolean)
      .map((key) => [key, key]),
  );
