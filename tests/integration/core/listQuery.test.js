import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import path from 'node:path';
import { buildListQuery, cursorPaginate, paginate } from '../../../src/core/query/index.js';
import { sequelize } from '../../../src/db/index.js';
import { loadModels } from '../../../src/db/models/index.js';
import { defineAssociations as defineWidgetAssociations } from '../../fixtures/models/association.js';

const { Widget, WidgetPart } = await loadModels(
  sequelize,
  path.resolve('tests/fixtures/models'),
  defineWidgetAssociations,
);

const config = {
  searchFields: ['name'],
  filters: { status: 'status', minPrice: { field: 'priceKobo', op: 'gte', type: 'integer' } },
  sortable: { price: 'priceKobo', name: 'name' },
};

// Parts listed with their widget (belongsTo), searchable and sortable by the widget's name
const partConfig = {
  searchFields: ['label', '$widget.name$'],
  sortable: { widgetName: ['widget', 'name'] },
  defaultSort: 'label',
  include: [{ model: Widget, as: 'widget', required: true }],
};

// Lists run against real MySQL: one table, 25 rows, a few queries (the test DB may be remote)
describe('list query against MySQL', () => {
  beforeAll(async () => {
    await WidgetPart.drop();
    await Widget.drop();
    await Widget.sync();
    await WidgetPart.sync();
    await Widget.bulkCreate(
      Array.from({ length: 25 }, (_, i) => ({
        id: `w${String(i + 1).padStart(2, '0')}`,
        name: i === 0 ? 'Àmàlà Special' : `Widget ${i + 1}`,
        status: i % 5 === 0 ? 'live' : 'draft',
        priceKobo: (i + 1) * 10000,
      })),
    );
    await WidgetPart.bulkCreate([
      { widgetId: 'w03', label: 'Pepper sauce' },
      { widgetId: 'w03', label: 'Pepper soup' },
    ]);
  });

  afterAll(async () => {
    await WidgetPart.drop();
    await Widget.drop();
  });

  it('pages, sorts and counts', async () => {
    const { data, meta } = await paginate(Widget, buildListQuery({ page: '2', limit: '10', sort: '-price' }, config));
    expect(meta).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3, hasNextPage: true, hasPrevPage: true });
    expect(data.map((w) => w.priceKobo)).toEqual([
      150000, 140000, 130000, 120000, 110000, 100000, 90000, 80000, 70000, 60000,
    ]);
  });

  it('clamps page to the last page', async () => {
    const { data, meta } = await paginate(Widget, buildListQuery({ page: '99', limit: '10' }, config));
    expect(meta.page).toBe(3);
    expect(data).toHaveLength(5);
  });

  it('filters with any-of and ranges, and searches case/accent-insensitively', async () => {
    const live = await paginate(Widget, buildListQuery({ status: 'live', minPrice: '100000' }, config));
    expect(live.data.map((w) => w.id).sort()).toEqual(['w11', 'w16', 'w21']);

    const amala = await paginate(Widget, buildListQuery({ search: 'amala' }, config));
    expect(amala.data.map((w) => w.id)).toEqual(['w01']);
  });

  it('searches and sorts on a belongsTo include', async () => {
    const byWidget = await paginate(WidgetPart, buildListQuery({ search: 'widget 3', limit: '1' }, partConfig));
    expect(byWidget.meta.total).toBe(2);
    expect(byWidget.data[0].label).toBe('Pepper sauce');
    expect(byWidget.data[0].widget.id).toBe('w03');

    const sorted = await paginate(WidgetPart, buildListQuery({ sort: '-widgetName' }, partConfig));
    expect(sorted.data.map((p) => p.label)).toEqual(['Pepper sauce', 'Pepper soup']);
  });

  it('scope wins over the client filter', async () => {
    const { meta } = await paginate(Widget, buildListQuery({ status: 'draft' }, config, { scope: { status: 'live' } }));
    expect(meta.total).toBe(5);
  });

  it('cursor pagination walks to the end', async () => {
    const findOptions = buildListQuery({ sort: 'name' }, config);
    const first = await cursorPaginate(Widget, findOptions, { limit: '20' });
    expect(first.meta).toEqual({ nextCursor: '20', limit: 20, total: 25 });
    const last = await cursorPaginate(Widget, findOptions, { cursor: first.meta.nextCursor, limit: '20' });
    expect(last.data).toHaveLength(5);
    expect(last.meta.nextCursor).toBeNull();
  });
});
