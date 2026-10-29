import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import sharp from 'sharp';
import request from 'supertest';
import app from '../../../src/app.js';
import { models } from '../../../src/db/index.js';
import { storage } from '../../../src/integrations/cloudinary/storage.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createUser } from '../../helpers/factories.js';

// Cloudinary is replaced by an in-memory fake that keeps what it was given
const real = { ...storage };
let stored;
beforeAll(() => {
  storage.put = async (buffer, { folder, resourceType, isPrivate }) => {
    const publicId = `kjt-foodie-test/${folder}/${stored.length + 1}`;
    stored.push({ buffer, folder, resourceType, isPrivate, publicId });
    return { publicId, url: isPrivate ? null : `https://res.cloudinary.test/${publicId}.webp` };
  };
  storage.signedUrl = (publicId, { format, expiresInSec }) =>
    `https://api.cloudinary.test/download?public_id=${publicId}&format=${format}&ttl=${expiresInSec}&n=${Math.random()}`;
});
afterAll(() => Object.assign(storage, real));

let users;
beforeEach(async () => {
  stored = [];
  await resetDatabase();
  users = {
    customer: await createUser(),
    vendor: await createUser({ role: 'vendor' }),
    rider: await createUser({ role: 'rider' }),
  };
});

const jpeg = (width, height, { noise = false } = {}) => {
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels, 200);
  if (noise) for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 2654435761) >>> 24;
  return sharp(raw, { raw: { width, height, channels } })
    .withMetadata({ exif: { IFD0: { Make: 'TestPhone' } } })
    .jpeg({ quality: 95 })
    .toBuffer();
};
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');

const upload = (user, purpose, file, filename = 'photo.jpg', contentType = 'image/jpeg') => {
  const req = request(app).post('/api/v1/uploads');
  if (user) req.set('Authorization', bearer(user));
  if (purpose !== undefined) req.field('purpose', purpose);
  if (file) req.attach('file', file, { filename, contentType });
  return req;
};

describe('POST /uploads', () => {
  it('re-encodes a food photo to WebP at most 1600 px wide, strips metadata and records the upload', async () => {
    const res = await upload(users.vendor, 'food_photo', await jpeg(2400, 1200));
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      url: 'https://res.cloudinary.test/kjt-foodie-test/food_photo/1.webp',
      width: 1600,
      height: 800,
      bytes: expect.any(Number),
    });

    const [file] = stored;
    expect(file).toMatchObject({ folder: 'food_photo', resourceType: 'image', isPrivate: false });
    const meta = await sharp(file.buffer).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 1600, height: 800 });
    expect(meta.exif).toBeUndefined();
    expect(file.buffer.length).toBe(res.body.data.bytes);

    const row = await models.Upload.findOne({ where: { url: res.body.data.url } });
    expect(row).toMatchObject({ userId: users.vendor.id, purpose: 'food_photo', format: 'webp', isPrivate: false });
  });

  it('keeps big noisy photos under 2 MB and never enlarges small ones', async () => {
    const big = await upload(users.vendor, 'vendor_cover', await jpeg(1600, 1600, { noise: true }));
    expect(big.status).toBe(201);
    expect(big.body.data.bytes).toBeLessThanOrEqual(2 * 1024 * 1024);

    const small = await upload(users.customer, 'avatar', await jpeg(300, 200));
    expect(small.body.data).toMatchObject({ width: 300, height: 200 });
  });

  it('documents are private: PDF accepted, a short-lived signed URL is returned', async () => {
    const pdf = await upload(users.rider, 'rider_document', PDF, 'licence.pdf', 'application/pdf');
    expect(pdf.status).toBe(201);
    expect(pdf.body.data).toMatchObject({ width: null, height: null, bytes: PDF.length });
    expect(pdf.body.data.url).toMatch(/^https:\/\/api\.cloudinary\.test\/download\?public_id=.+&format=pdf&ttl=3600/);
    expect(stored[0]).toMatchObject({ resourceType: 'raw', isPrivate: true, buffer: PDF });

    const scan = await upload(users.vendor, 'vendor_document', await jpeg(800, 600));
    expect(scan.body.data.url).toMatch(/format=webp/);
    expect(stored[1]).toMatchObject({ resourceType: 'image', isPrivate: true });
  });

  it('checks the real bytes, not the name or MIME type', async () => {
    const fake = await upload(users.vendor, 'food_photo', Buffer.from('not really a jpeg'), 'dish.jpg');
    expect(fake.status).toBe(422);
    expect(fake.body.error.fieldErrors).toEqual({ file: 'Upload a JPG, PNG or WebP image' });

    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#f00' } })
      .gif()
      .toBuffer();
    expect((await upload(users.customer, 'refund_photo', gif, 'a.gif', 'image/gif')).status).toBe(422);

    const pdfAsPhoto = await upload(users.vendor, 'food_photo', PDF, 'menu.pdf', 'application/pdf');
    expect(pdfAsPhoto.body.error.fieldErrors).toEqual({ file: 'Upload a JPG, PNG or WebP image' });
    const textAsDoc = await upload(users.vendor, 'vendor_document', Buffer.from('hello'), 'cac.pdf', 'application/pdf');
    expect(textAsDoc.body.error.fieldErrors).toEqual({ file: 'Upload a JPG, PNG, WebP or PDF file' });
    expect(stored).toEqual([]);
  });

  it('413 over 8 MB', async () => {
    const res = await upload(users.vendor, 'food_photo', Buffer.alloc(8 * 1024 * 1024 + 1), 'huge.jpg');
    expect(res.status).toBe(413);
    expect(res.body.error).toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'That file is too large. The limit is 8 MB.',
    });
  });

  it('422 without a file or purpose; 403 for the wrong role; 401 signed out', async () => {
    const photo = await jpeg(50, 50);
    expect((await upload(users.vendor, 'food_photo')).body.error.fieldErrors).toEqual({
      file: 'Choose a file to upload',
    });
    expect((await upload(users.vendor, 'menu', photo)).body.error.fieldErrors).toEqual({
      purpose: 'Pick what the file is for',
    });
    expect((await upload(users.vendor, undefined, photo)).status).toBe(422);

    expect((await upload(users.customer, 'food_photo', photo)).status).toBe(403);
    expect((await upload(users.vendor, 'rider_document', photo)).status).toBe(403);
    expect((await upload(users.rider, 'refund_photo', photo)).status).toBe(403);
    expect((await upload(null, 'avatar', photo)).status).toBe(401);
    expect(stored).toEqual([]);
  });
});
