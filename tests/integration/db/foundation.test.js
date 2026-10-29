import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import path from 'node:path';
import { ConflictError, NotFoundError } from '../../../src/core/errors/index.js';
import { lockForUpdate, sequelize, withTransaction } from '../../../src/db/index.js';
import { loadModels } from '../../../src/db/models/index.js';
import { resetDatabase } from '../../helpers/db.js';

const { Widget, WidgetPart } = await loadModels(sequelize, path.resolve('tests/fixtures/models'));

beforeAll(async () => {
  // Test-only tables; real tables come from migrations
  await WidgetPart.drop();
  await Widget.drop();
  await Widget.sync();
  await WidgetPart.sync();
});

beforeEach(() => resetDatabase());

// Inside a describe so it runs before the shared afterAll that closes the pool
describe('db foundation', () => {
  afterAll(async () => {
    await WidgetPart.drop();
    await Widget.drop();
  });

  describe('model loader', () => {
    it('defines every *.model.js and runs associate()', () => {
      expect(Widget.associations.parts.target).toBe(WidgetPart);
      expect(WidgetPart.associations.widget.target).toBe(Widget);
    });

    it('uses snake_case columns, timestamps and paranoid deletes', async () => {
      const columns = await sequelize.getQueryInterface().describeTable('test_widgets');
      expect(Object.keys(columns)).toEqual(
        expect.arrayContaining(['id', 'name', 'price_kobo', 'created_at', 'updated_at', 'deleted_at']),
      );
      expect(columns.id.type).toBe('VARCHAR(64)');
    });
  });

  describe('IDs', () => {
    it('generates UUID v7 ids', async () => {
      const widget = await Widget.create({ name: 'Jollof pot' });
      expect(widget.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('keeps fixed seed ids', async () => {
      const widget = await Widget.create({ id: 'ven_mama_put', name: 'Mama Put Kitchen' });
      expect((await Widget.findByPk('ven_mama_put')).name).toBe(widget.name);
    });

    it('stores times in UTC and kobo as numbers', async () => {
      const before = Date.now();
      await Widget.create({ id: 'w1', name: 'Suya', priceKobo: 350000 });
      const widget = await Widget.findByPk('w1');
      expect(widget.priceKobo).toBe(350000);
      expect(Math.abs(widget.createdAt.getTime() - before)).toBeLessThan(60_000);
    });
  });

  describe('withTransaction', () => {
    it('commits when the callback resolves', async () => {
      await withTransaction(async (transaction) => {
        const widget = await Widget.create({ id: 'w1', name: 'Pot' }, { transaction });
        await WidgetPart.create({ widgetId: widget.id, label: 'Lid' }, { transaction });
      });
      expect(await WidgetPart.count()).toBe(1);
    });

    it('rolls everything back when the callback throws', async () => {
      await expect(
        withTransaction(async (transaction) => {
          await Widget.create({ id: 'w1', name: 'Pot' }, { transaction });
          throw new ConflictError('INVALID_STATUS');
        }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(await Widget.count()).toBe(0);
    });

    it('joins an outer transaction instead of nesting', async () => {
      await expect(
        withTransaction(async (outer) => {
          await withTransaction(
            async (inner) => {
              expect(inner).toBe(outer);
              await Widget.create({ id: 'w1', name: 'Pot' }, { transaction: inner });
            },
            { transaction: outer },
          );
          throw new Error('outer fails');
        }),
      ).rejects.toThrow('outer fails');
      expect(await Widget.count()).toBe(0);
    });
  });

  describe('lockForUpdate', () => {
    it('returns the row inside the transaction', async () => {
      await Widget.create({ id: 'w1', name: 'Pot' });
      await withTransaction(async (transaction) => {
        const widget = await lockForUpdate(Widget, 'w1', transaction);
        expect(widget.name).toBe('Pot');
      });
    });

    it('404s for a missing or not-yours row', async () => {
      await Widget.create({ id: 'w1', name: 'Pot', status: 'draft' });
      await expect(withTransaction((t) => lockForUpdate(Widget, 'nope', t))).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        withTransaction((t) => lockForUpdate(Widget, 'w1', t, { where: { status: 'live' } })),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('needs a transaction', async () => {
      await expect(lockForUpdate(Widget, 'w1')).rejects.toThrow('needs a transaction');
    });

    it('serialises concurrent state changes: only one wins', async () => {
      await Widget.create({ id: 'w1', name: 'Pot', status: 'draft' });

      const publish = () =>
        withTransaction(async (transaction) => {
          const widget = await lockForUpdate(Widget, 'w1', transaction);
          if (widget.status !== 'draft') throw new ConflictError('INVALID_STATUS');
          await new Promise((resolve) => setTimeout(resolve, 200)); // hold the lock
          await widget.update({ status: 'live' }, { transaction });
          return 'published';
        });

      const results = await Promise.allSettled([publish(), publish()]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((r) => r.status === 'rejected').reason.code).toBe('INVALID_STATUS');
      expect((await Widget.findByPk('w1')).status).toBe('live');
    });
  });
});
