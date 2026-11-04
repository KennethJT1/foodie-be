// Seed photos (handoff 8.1): every Wikimedia file is downloaded once and stored through the upload
// pipeline (WebP, resized, our Cloudinary), so the app never hot-links Wikimedia. Downloads and the
// resulting URLs are cached in .seed-cache/, so re-seeding uploads nothing new. Runs before the
// seed transaction; steps then read URLs synchronously with mediaUrl().
//
// SEED_MEDIA=remote skips downloads and uses the Wikimedia URLs (offline machines, quick runs).
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { logger } from '../../config/logger.js';
import { storage } from '../../integrations/cloudinary/storage.js';
import { toWebp } from '../../modules/uploads/uploads.service.js';
import { DOCUMENT_SAMPLE, SEED_IMAGES } from './data/images.js';

const CACHE_DIR = new URL('../../../.seed-cache/', import.meta.url);
const MANIFEST = new URL('manifest.json', CACHE_DIR);
// Wikimedia asks automated clients to identify themselves
const USER_AGENT = 'KJTFoodieSeeder/1.0 (development seed data)';

// kind → how the stored copy is made
const KINDS = {
  food_photo: (buffer) => toWebp(buffer, 1600),
  vendor_cover: (buffer) => toWebp(buffer, 1600),
  // Square centre crop of a real photo (handoff 8.1: no text logos)
  vendor_logo: async (buffer) =>
    toWebp(await sharp(buffer).rotate().resize(400, 400, { fit: 'cover' }).toBuffer(), 400),
  document: (buffer) => toWebp(buffer, 2000),
};

const resolved = new Map();

const keyOf = (kind, source) => `${kind}:${source}`;

/** Our URL for a seed photo, or the source URL when it wasn't (or couldn't be) copied. */
export const mediaUrl = (kind, source) => resolved.get(keyOf(kind, source)) ?? source;

const download = async (source) => {
  const file = new URL(`${createHash('sha1').update(source).digest('hex')}.jpg`, CACHE_DIR);
  try {
    return await readFile(file);
  } catch {
    let res;
    // Wikimedia answers 429 when we go too fast: wait as long as it asks (or back off), then retry
    for (let attempt = 1; ; attempt += 1) {
      res = await fetch(source, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) });
      if (res.status !== 429 || attempt === 5) break;
      const waitSec = Number(res.headers.get('retry-after')) || 5 * attempt;
      await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
    }
    if (!res.ok) throw new Error(`${res.status} downloading ${source}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(file, buffer);
    return buffer;
  }
};

/** Every (kind, source) the seed uses: dish photos, covers, logos from dish photos, the document. */
const wanted = () => {
  const dishPhotos = Object.values(SEED_IMAGES.dishes)
    .flat()
    .map((p) => p.url);
  return [
    ...dishPhotos.map((url) => ['food_photo', url]),
    ...Object.values(SEED_IMAGES.dishes).map((photos) => ['vendor_logo', photos[0].url]),
    ...SEED_IMAGES.vendorCovers.map((p) => ['vendor_cover', p.url]),
    ...SEED_IMAGES.documentSample.map((p) => ['document', p.url]),
  ];
};

/** Copies any seed photo not in the cache yet; a failure keeps the source URL for that photo. */
export const prepareMedia = async () => {
  if (process.env.SEED_MEDIA === 'remote') return logger.warn('SEED_MEDIA=remote: seed photos point at Wikimedia');
  await mkdir(CACHE_DIR, { recursive: true });
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8').catch(() => '{}'));
  let copied = 0;
  let failed = 0;
  const queue = wanted().filter(([kind, source]) => !manifest[keyOf(kind, source)]);

  // Two at a time: polite to Wikimedia, quick enough for Cloudinary
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [kind, source] = next;
      try {
        const { buffer } = await KINDS[kind](await download(source));
        const { url } = await storage.put(buffer, { folder: `seed/${kind}`, resourceType: 'image', isPrivate: false });
        manifest[keyOf(kind, source)] = url;
        copied += 1;
      } catch (err) {
        failed += 1;
        logger.warn({ err: err.message, source }, 'Seed photo not copied; using the source URL');
      }
    }
  };
  await Promise.all([1, 2].map(worker));
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));

  for (const [key, url] of Object.entries(manifest)) resolved.set(key, url);
  logger.info(`Seed photos: ${resolved.size} ready (${copied} copied now, ${failed} failed)`);
};

/**
 * An `uploads` row for a sample document (the paperwork photo, never a real ID). Every seeded vendor
 * and rider document points at one of these. `public_id` and `url` are unique per row, so both carry
 * the row id (a `#fragment` doesn't change the image the URL loads).
 */
export const sampleDocumentUpload = (id, userId, purpose) => ({
  id,
  userId,
  purpose,
  publicId: `seed/document-sample/${id}`,
  resourceType: 'image',
  isPrivate: false,
  format: 'webp',
  url: `${mediaUrl('document', DOCUMENT_SAMPLE.url)}#${id}`,
  width: null,
  height: null,
  bytes: 0,
});
