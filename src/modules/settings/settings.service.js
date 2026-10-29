import { redis, redisPrefix } from '../../config/redis.js';
import { audit } from '../../core/audit/index.js';
import { ValidationError } from '../../core/errors/index.js';
import { models, withTransaction } from '../../db/index.js';
import { DEFAULT_SETTINGS } from './settings.defaults.js';

const { Setting, ServiceArea, NotificationTemplate, RequiredDocument } = models;

const CACHE_KEY = `${redisPrefix}:settings`;
const CACHE_TTL_SEC = 600;

/** Drops the cached settings; every API instance reads them again on next use. */
export const invalidateSettings = () => redis.del(CACHE_KEY).catch(() => {});

const load = async () => {
  const [rows, areas, templates] = await Promise.all([
    Setting.findAll(),
    ServiceArea.findAll({
      where: { isActive: true },
      order: [
        ['sortOrder', 'ASC'],
        ['name', 'ASC'],
      ],
    }),
    NotificationTemplate.findAll({
      order: [
        ['sortOrder', 'ASC'],
        ['key', 'ASC'],
      ],
    }),
  ]);
  const stored = Object.fromEntries(rows.filter((r) => r.key in DEFAULT_SETTINGS).map((r) => [r.key, r.value]));
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    serviceAreas: areas.map((a) => a.name),
    notificationTemplates: templates.map(({ key, channel, subject, body }) => ({ key, channel, subject, body })),
  };
};

/**
 * The platform settings (GET /admin/settings shape). Cached in Redis; every reader (fees, payout %,
 * timeouts in later phases) goes through here, so a change applies on the next read.
 */
export const getSettings = async () => {
  const cached = await redis.get(CACHE_KEY).catch(() => null);
  if (cached) return JSON.parse(cached);
  const settings = await load();
  await redis.set(CACHE_KEY, JSON.stringify(settings), 'EX', CACHE_TTL_SEC).catch(() => {});
  return settings;
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const saveServiceAreas = async (names, transaction) => {
  const all = await ServiceArea.findAll({ transaction });
  const byName = new Map(all.map((a) => [a.name.toLowerCase(), a]));
  for (const [sortOrder, name] of names.entries()) {
    const existing = byName.get(name.toLowerCase());
    if (existing) await existing.update({ isActive: true, sortOrder }, { transaction });
    else await ServiceArea.create({ name, sortOrder }, { transaction });
  }
  const keep = new Set(names.map((n) => n.toLowerCase()));
  for (const area of all) {
    if (!keep.has(area.name.toLowerCase()) && area.isActive) await area.update({ isActive: false }, { transaction });
  }
};

/** PATCH /admin/settings: validates across fields, saves what changed, audits `settings.updated`. */
export const updateSettings = async (actor, patch, req) => {
  const current = await load();

  const fieldErrors = {};
  const maxFee = patch.deliveryMaxFee ?? current.deliveryMaxFee;
  const baseFee = patch.deliveryBaseFee ?? current.deliveryBaseFee;
  if (maxFee < baseFee) fieldErrors.deliveryMaxFee = 'The maximum fee must be at least the base fee';
  const templateKeys = new Set(current.notificationTemplates.map((t) => t.key));
  patch.notificationTemplates?.forEach((t, i) => {
    if (!templateKeys.has(t.key)) fieldErrors[`notificationTemplates.${i}.key`] = 'Unknown template';
  });
  if (Object.keys(fieldErrors).length) throw new ValidationError(fieldErrors);

  const changed = Object.keys(patch).filter((key) => patch[key] !== undefined && !same(patch[key], current[key]));
  if (!changed.length) return current;

  await withTransaction(async (transaction) => {
    for (const key of changed.filter((k) => k in DEFAULT_SETTINGS)) {
      await Setting.upsert({ key, value: patch[key] }, { transaction });
    }
    if (changed.includes('serviceAreas')) await saveServiceAreas(patch.serviceAreas, transaction);
    if (changed.includes('notificationTemplates')) {
      for (const { key, channel, subject, body } of patch.notificationTemplates) {
        await NotificationTemplate.update({ channel, subject, body }, { where: { key }, transaction });
      }
    }
    await audit.log(
      {
        actor,
        action: 'settings.updated',
        targetType: 'settings',
        targetId: 'platform',
        summary: `Changed ${changed.join(', ')}`,
        req,
      },
      { transaction },
    );
  });
  await invalidateSettings();
  return getSettings();
};

/** Documents a vendor type (restaurant, home_cook) or riders must upload: [{ type, label }]. */
export const requiredDocuments = async (appliesTo, { transaction } = {}) =>
  (
    await RequiredDocument.findAll({
      where: { appliesTo },
      order: [['sortOrder', 'ASC']],
      transaction,
    })
  ).map(({ type, label }) => ({ type, label }));
