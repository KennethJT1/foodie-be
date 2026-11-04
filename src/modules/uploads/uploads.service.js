import sharp from 'sharp';
import { ForbiddenError, ValidationError } from '../../core/errors/index.js';
import { models } from '../../db/index.js';
import { storage } from '../../integrations/cloudinary/storage.js';

// Handoff section 7: JPG / PNG / WebP (and PDF for documents), stored as WebP under 2 MB.
// `roles`: who may upload for that purpose; `maxWidth`: longest allowed width after resizing.
const PURPOSES = {
  food_photo: { roles: ['vendor'], maxWidth: 1600 },
  vendor_logo: { roles: ['vendor'], maxWidth: 512 },
  vendor_cover: { roles: ['vendor'], maxWidth: 1600 },
  vendor_document: { roles: ['vendor'], maxWidth: 2000, document: true },
  rider_document: { roles: ['rider'], maxWidth: 2000, document: true },
  refund_photo: { roles: ['customer'], maxWidth: 1600 },
  avatar: { roles: ['customer', 'vendor', 'rider', 'admin'], maxWidth: 512 },
};

const MAX_STORED_BYTES = 2 * 1024 * 1024;
// Lower quality until the WebP fits; the last step is used whatever its size
const WEBP_QUALITIES = [80, 70, 60, 45];
// Private document links are short-lived; screens re-fetch to get a fresh one
export const PRIVATE_URL_TTL_SEC = 60 * 60;

const IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp']);
const isPdf = (buffer) => buffer.subarray(0, 5).toString('latin1') === '%PDF-';

/** The file's real type from its bytes (the client's file name and MIME type are not trusted). */
const detectType = async (buffer) => {
  if (isPdf(buffer)) return 'pdf';
  try {
    const { format } = await sharp(buffer).metadata();
    return IMAGE_FORMATS.has(format) ? 'image' : null;
  } catch {
    return null;
  }
};

/** EXIF-rotated, resized, metadata (GPS) stripped, WebP under 2 MB. */
export const toWebp = async (buffer, maxWidth) => {
  let out;
  for (const quality of WEBP_QUALITIES) {
    out = await sharp(buffer)
      .rotate()
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    if (out.info.size <= MAX_STORED_BYTES) break;
  }
  return { buffer: out.data, width: out.info.width, height: out.info.height, bytes: out.info.size };
};

/** A URL the client can open now: public files as stored, private ones freshly signed. */
export const uploadUrl = (upload) =>
  upload.isPrivate
    ? storage.signedUrl(upload.publicId, {
        resourceType: upload.resourceType,
        format: upload.format,
        expiresInSec: PRIVATE_URL_TTL_SEC,
      })
    : upload.url;

/** POST /uploads: checks role and type, re-encodes images, stores the file and records it. */
export const createUpload = async (user, { purpose }, file) => {
  const rule = PURPOSES[purpose];
  if (!rule.roles.includes(user.role)) throw new ForbiddenError('FORBIDDEN', "You can't upload that kind of file.");
  if (!file?.buffer?.length) throw new ValidationError({ file: 'Choose a file to upload' });

  const type = await detectType(file.buffer);
  if (!type || (type === 'pdf' && !rule.document)) {
    throw new ValidationError({
      file: rule.document ? 'Upload a JPG, PNG, WebP or PDF file' : 'Upload a JPG, PNG or WebP image',
    });
  }

  const stored =
    type === 'pdf'
      ? { buffer: file.buffer, width: null, height: null, bytes: file.buffer.length }
      : await toWebp(file.buffer, rule.maxWidth);
  const resourceType = type === 'pdf' ? 'raw' : 'image';
  const format = type === 'pdf' ? 'pdf' : 'webp';
  const isPrivate = Boolean(rule.document);

  const { publicId, url } = await storage.put(stored.buffer, { folder: purpose, resourceType, isPrivate });
  const upload = models.Upload.build({
    userId: user.id,
    purpose,
    publicId,
    resourceType,
    isPrivate,
    format,
    width: stored.width,
    height: stored.height,
    bytes: stored.bytes,
  });
  upload.url = url ?? uploadUrl(upload);
  await upload.save();

  return { url: upload.url, width: upload.width, height: upload.height, bytes: upload.bytes };
};
