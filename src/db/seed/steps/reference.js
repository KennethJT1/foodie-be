// Settings (handoff 8.3), service areas (the 6 cities with centres and neighbourhoods),
// notification templates, banks and required documents
import { DEFAULT_NOTIFICATION_TEMPLATES, DEFAULT_SETTINGS } from '../../../modules/settings/settings.defaults.js';
import { invalidateSettings } from '../../../modules/settings/settings.service.js';
import { slugify } from '../../../core/utils/slug.js';
import { models } from '../../index.js';
import { CITIES } from '../data/cities.js';
import { BANKS, REQUIRED_DOCUMENTS } from '../data/reference.js';

export const reference = async ({ transaction }) => {
  const { Setting, ServiceArea, NotificationTemplate, Bank, RequiredDocument } = models;

  await Setting.bulkCreate(
    Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })),
    { transaction },
  );
  await ServiceArea.bulkCreate(
    CITIES.map(({ city, state, lat, lng, areas }, sortOrder) => ({
      id: `area_${slugify(city).replace(/-/g, '_')}`,
      name: city,
      state,
      lat,
      lng,
      areas,
      sortOrder,
    })),
    { transaction },
  );
  await NotificationTemplate.bulkCreate(
    DEFAULT_NOTIFICATION_TEMPLATES.map((t, sortOrder) => ({ ...t, sortOrder })),
    { transaction },
  );
  await Bank.bulkCreate(BANKS, { transaction });
  await RequiredDocument.bulkCreate(
    Object.entries(REQUIRED_DOCUMENTS).flatMap(([appliesTo, docs]) =>
      docs.map(({ type, label }, sortOrder) => ({
        id: `rdoc_${appliesTo}_${type}`,
        appliesTo,
        type,
        label,
        sortOrder,
      })),
    ),
    { transaction },
  );

  // Cached settings from before the wipe must not outlive it
  transaction?.afterCommit(() => invalidateSettings());
  if (!transaction) await invalidateSettings();
};
