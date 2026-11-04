// Real photographs for the seed (docs/backend/seed-images.json, handoff 8.1)
import { readFileSync } from 'node:fs';

export const SEED_IMAGES = JSON.parse(
  readFileSync(new URL('../../../../docs/backend/seed-images.json', import.meta.url), 'utf8'),
);

// TODO(phase 13): copy through the upload pipeline instead of pointing at Wikimedia
export const DOCUMENT_SAMPLE = SEED_IMAGES.documentSample[0];

/**
 * An `uploads` row for a sample document (the paperwork photo, never a real ID). Every seeded vendor
 * and rider document points at one of these.
 */
export const sampleDocumentUpload = (userId, purpose) => ({
  userId,
  purpose,
  publicId: 'seed/document-sample',
  resourceType: 'image',
  isPrivate: false,
  format: 'jpg',
  url: DOCUMENT_SAMPLE.url,
  width: null,
  height: null,
  bytes: 0,
});
