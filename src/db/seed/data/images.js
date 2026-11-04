// Real photographs for the seed (docs/backend/seed-images.json, handoff 8.1)
import { readFileSync } from 'node:fs';

export const SEED_IMAGES = JSON.parse(
  readFileSync(new URL('../../../../docs/backend/seed-images.json', import.meta.url), 'utf8'),
);

// TODO(phase 13): copy through the upload pipeline instead of pointing at Wikimedia
export const DOCUMENT_SAMPLE = SEED_IMAGES.documentSample[0];

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
  format: 'jpg',
  url: `${DOCUMENT_SAMPLE.url}#${id}`,
  width: null,
  height: null,
  bytes: 0,
});
