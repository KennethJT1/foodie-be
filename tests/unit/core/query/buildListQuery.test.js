import { describe, expect, it } from '@jest/globals';
import { Op } from 'sequelize';
import { buildListQuery, parsePaging } from '../../../../src/core/query/buildListQuery.js';

const config = {
  searchFields: ['name', '$vendor.name$'],
  filters: {
    status: 'status',
    vendorId: 'vendorId',
    customerId: 'customerId',
    available: { field: 'isAvailable', type: 'boolean' },
    minPrice: { field: 'priceKobo', op: 'gte', type: 'integer' },
    maxPrice: { field: 'priceKobo', op: 'lte', type: 'integer' },
    minRating: { field: 'rating', op: 'gte', type: 'number' },
    action: { field: 'action', op: 'prefix' },
  },
  dateField: 'createdAt',
  defaultSort: '-likesCount',
  sortable: { createdAt: 'createdAt', price: 'priceKobo', rating: 'rating', vendorName: ['vendor', 'name'] },
};

const conditions = (query, options) => buildListQuery(query, config, options).where[Op.and] ?? [];

describe('paging', () => {
  it.each([
    [{}, { page: 1, limit: 20 }],
    [
      { page: '3', limit: '50' },
      { page: 3, limit: 50 },
    ],
    [{ limit: '500' }, { page: 1, limit: 100 }],
    [{ limit: '-5' }, { page: 1, limit: 1 }],
    [{ limit: '0' }, { page: 1, limit: 20 }],
    [{ page: '0' }, { page: 1, limit: 20 }],
    [{ page: '-2' }, { page: 1, limit: 20 }],
    [
      { page: 'two', limit: 'lots' },
      { page: 1, limit: 20 },
    ],
    [
      { page: '2.7', limit: '10.9' },
      { page: 2, limit: 10 },
    ],
  ])('%p → %p', (query, expected) => {
    expect(parsePaging(query)).toEqual(expected);
  });

  it('allows a different default and max', () => {
    expect(parsePaging({}, { defaultLimit: 10 }).limit).toBe(10);
    expect(parsePaging({ limit: '80' }, { maxLimit: 50 }).limit).toBe(50);
  });
});

describe('search', () => {
  it('ORs a contains match over every search field', () => {
    expect(conditions({ search: ' jollof ' })).toEqual([
      { [Op.or]: [{ name: { [Op.like]: '%jollof%' } }, { '$vendor.name$': { [Op.like]: '%jollof%' } }] },
    ]);
  });

  it('escapes LIKE wildcards', () => {
    const [where] = conditions({ search: '50%_off\\' });
    expect(where[Op.or][0].name[Op.like]).toBe('%50\\%\\_off\\\\%');
  });

  it('is ignored without search fields', () => {
    expect(buildListQuery({ search: 'rice' }, {}).where).toEqual({});
  });
});

describe('filters', () => {
  it('exact match for one value', () => {
    expect(conditions({ status: 'paid' })).toEqual([{ status: 'paid' }]);
  });

  it('comma = any of', () => {
    expect(conditions({ status: 'paid,accepted, preparing' })).toEqual([
      { status: { [Op.in]: ['paid', 'accepted', 'preparing'] } },
    ]);
  });

  it('repeated params count as a comma list', () => {
    expect(conditions({ status: ['paid', 'accepted'] })).toEqual([{ status: { [Op.in]: ['paid', 'accepted'] } }]);
  });

  it('booleans accept only true / false', () => {
    expect(conditions({ available: 'true' })).toEqual([{ isAvailable: true }]);
    expect(conditions({ available: 'FALSE' })).toEqual([{ isAvailable: false }]);
    expect(conditions({ available: 'yes' })).toEqual([]);
  });

  it('ranges', () => {
    expect(conditions({ minPrice: '100000', maxPrice: '500000', minRating: '4.5' })).toEqual([
      { priceKobo: { [Op.gte]: 100000 } },
      { priceKobo: { [Op.lte]: 500000 } },
      { rating: { [Op.gte]: 4.5 } },
    ]);
  });

  it('ignores numbers that do not parse', () => {
    expect(conditions({ minPrice: '12.5', minRating: 'high' })).toEqual([]);
  });

  it('prefix match', () => {
    expect(conditions({ action: 'vendor.' })).toEqual([{ action: { [Op.like]: 'vendor.%' } }]);
    expect(conditions({ action: 'vendor.,rider.' })).toEqual([
      { action: { [Op.or]: [{ [Op.like]: 'vendor.%' }, { [Op.like]: 'rider.%' }] } },
    ]);
  });

  it('custom filters get the values and the whole query', () => {
    const near = (values, query) => ({ near: [values[0], query.lat, query.lng] });
    const { where } = buildListQuery(
      { maxDistanceKm: '5', lat: '6.5', lng: '3.3' },
      { filters: { maxDistanceKm: near } },
    );
    expect(where[Op.and]).toEqual([{ near: ['5', '6.5', '3.3'] }]);
  });

  it('custom filters may add nothing', () => {
    expect(buildListQuery({ x: '1' }, { filters: { x: () => undefined } }).where).toEqual({});
  });

  it('ignores unknown and empty params', () => {
    expect(conditions({ hacker: '1', status: '', vendorId: '  ', page: '2', foo: { bar: 1 } })).toEqual([]);
    expect(buildListQuery({ status: 'paid' }, { ...config, filters: {} }).where).toEqual({});
  });

  it('rejects config mistakes loudly', () => {
    expect(() => buildListQuery({ x: '1' }, { filters: { x: { op: 'between' } } })).toThrow('Unknown filter op');
    expect(() => buildListQuery({ x: '1' }, { filters: { x: { type: 'date' } } })).toThrow('Unknown filter type');
  });
});

describe('from / to', () => {
  it('YYYY-MM-DD covers the whole Lagos day, inclusive', () => {
    expect(conditions({ from: '2026-10-01', to: '2026-10-28' })).toEqual([
      {
        createdAt: {
          [Op.gte]: new Date('2026-09-30T23:00:00.000Z'),
          [Op.lte]: new Date('2026-10-28T22:59:59.999Z'),
        },
      },
    ]);
  });

  it('accepts one side only and full timestamps', () => {
    expect(conditions({ from: '2026-10-28T10:00:00.000Z' })).toEqual([
      { createdAt: { [Op.gte]: new Date('2026-10-28T10:00:00.000Z') } },
    ]);
  });

  it('uses the configured date field', () => {
    const { where } = buildListQuery({ to: '2026-10-28' }, { dateField: 'deliveredAt' });
    expect(Object.keys(where[Op.and][0])).toEqual(['deliveredAt']);
  });

  it('ignores invalid dates', () => {
    expect(conditions({ from: 'yesterday', to: '2026-13-45' })).toEqual([]);
  });
});

describe('sort', () => {
  const order = (query) => buildListQuery(query, config).order;

  it('maps whitelisted keys, - = descending, comma for several', () => {
    expect(order({ sort: '-rating,price' })).toEqual([
      ['rating', 'DESC'],
      ['priceKobo', 'ASC'],
      ['id', 'ASC'],
    ]);
  });

  it('supports nested paths', () => {
    expect(order({ sort: 'vendorName' })).toEqual([
      ['vendor', 'name', 'ASC'],
      ['id', 'ASC'],
    ]);
  });

  it('drops keys not in the whitelist', () => {
    expect(order({ sort: 'passwordHash,-rating' })).toEqual([
      ['rating', 'DESC'],
      ['id', 'ASC'],
    ]);
  });

  it('falls back to the default sort', () => {
    expect(order({})).toEqual([
      ['likesCount', 'DESC'],
      ['id', 'ASC'],
    ]);
    expect(order({ sort: 'nope' })).toEqual([
      ['likesCount', 'DESC'],
      ['id', 'ASC'],
    ]);
  });

  it('the default sort uses the whitelist mapping when there is one', () => {
    const { order: o } = buildListQuery({}, { defaultSort: 'price', sortable: { price: 'priceKobo' } });
    expect(o).toEqual([
      ['priceKobo', 'ASC'],
      ['id', 'ASC'],
    ]);
  });

  it('defaults to -createdAt', () => {
    expect(buildListQuery({}, {}).order).toEqual([
      ['createdAt', 'DESC'],
      ['id', 'ASC'],
    ]);
  });
});

describe('scope', () => {
  it('always applies', () => {
    expect(conditions({}, { scope: { customerId: 'usr_ada' } })).toEqual([{ customerId: 'usr_ada' }]);
  });

  it('wins over a client filter on the same field', () => {
    expect(
      conditions({ customerId: 'usr_someone_else', status: 'paid' }, { scope: { customerId: 'usr_ada' } }),
    ).toEqual([{ status: 'paid' }, { customerId: 'usr_ada' }]);
  });

  it('is ANDed with search, so search cannot widen it', () => {
    const where = conditions({ search: 'x' }, { scope: { vendorId: 'ven_mama_put' } });
    expect(where).toHaveLength(2);
    expect(where[1]).toEqual({ vendorId: 'ven_mama_put' });
  });
});

it('passes include through', () => {
  const include = [{ association: 'vendor' }];
  expect(buildListQuery({}, { include }).include).toBe(include);
});

it('a sort key can cover several columns', () => {
  const { order } = buildListQuery({ sort: '-name' }, { sortable: { name: [['firstName'], ['lastName']] } });
  expect(order).toEqual([
    ['firstName', 'DESC'],
    ['lastName', 'DESC'],
    ['id', 'ASC'],
  ]);
});
