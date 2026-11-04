// Real photographs for the seed (docs/backend/seed-images.json, handoff 8.1)
import { readFileSync } from 'node:fs';

export const SEED_IMAGES = JSON.parse(
  readFileSync(new URL('../../../../docs/backend/seed-images.json', import.meta.url), 'utf8'),
);

export const DOCUMENT_SAMPLE = SEED_IMAGES.documentSample[0];

/** `{ author, license, source }` for a seed photo, by its Wikimedia URL. */
const CREDITS = new Map(
  [...Object.values(SEED_IMAGES.dishes).flat(), ...SEED_IMAGES.vendorCovers, ...SEED_IMAGES.documentSample].map((p) => [
    p.url,
    p.credit,
  ]),
);
export const creditFor = (sourceUrl) => CREDITS.get(sourceUrl) ?? null;
