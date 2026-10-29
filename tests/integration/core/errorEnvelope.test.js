import { describe, expect, it } from '@jest/globals';
import express from 'express';
import { UniqueConstraintError, ValidationError as SequelizeValidationError, ValidationErrorItem } from 'sequelize';
import request from 'supertest';
import { z } from 'zod';
import app from '../../../src/app.js';
import { AppError, ERROR_CODES } from '../../../src/core/errors/index.js';
import { asyncHandler, respond } from '../../../src/core/http/index.js';
import { errorHandler, notFound, requestId, validate } from '../../../src/core/middlewares/index.js';

// A small app with the real error middleware and routes that throw on demand
const testApp = express();
testApp.use(requestId);
testApp.use(express.json());
testApp.get(
  '/throw/:code',
  asyncHandler(async (req) => {
    throw new AppError(req.params.code);
  }),
);
testApp.get('/crash', () => {
  throw new Error('connect ECONNREFUSED 10.0.0.1:3306');
});
testApp.get('/unique', () => {
  throw new UniqueConstraintError({ errors: [new ValidationErrorItem('dup', 'unique violation', 'phone', '+234')] });
});
testApp.get('/sequelize-validation', () => {
  throw new SequelizeValidationError('bad', [
    new ValidationErrorItem('Phone is required', 'notNull violation', 'phone'),
  ]);
});
testApp.post(
  '/validate',
  validate({ body: z.object({ address: z.object({ line1: z.string({ error: 'Enter the street address' }) }) }) }),
  (req, res) => respond.ok(res, req.body),
);
testApp.delete('/thing', (req, res) => respond.noContent(res));
testApp.use(notFound);
testApp.use(errorHandler);

const expectEnvelope = (res, status, code, message = ERROR_CODES[code].message) => {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({
    success: false,
    error: expect.objectContaining({ code, message, requestId: res.headers['x-request-id'] }),
  });
};

describe('error envelope', () => {
  it.each(Object.entries(ERROR_CODES))('%s', async (code, { status, message }) => {
    const res = await request(testApp).get(`/throw/${code}`);
    expectEnvelope(res, status, code, message);
    expect(res.body.error).not.toHaveProperty('fieldErrors');
  });

  it('hides unknown errors behind INTERNAL_ERROR', async () => {
    const res = await request(testApp).get('/crash');
    expectEnvelope(res, 500, 'INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|stack/);
  });

  it('maps unique constraint errors to 409 CONFLICT with fieldErrors', async () => {
    const res = await request(testApp).get('/unique');
    expectEnvelope(res, 409, 'CONFLICT');
    expect(res.body.error.fieldErrors).toEqual({ phone: 'That phone is already in use. Try another one.' });
  });

  it('maps Sequelize validation errors to 422 VALIDATION_ERROR', async () => {
    const res = await request(testApp).get('/sequelize-validation');
    expectEnvelope(res, 422, 'VALIDATION_ERROR');
    expect(res.body.error.fieldErrors).toEqual({ phone: 'Phone is required' });
  });

  it('returns Zod field errors keyed by dotted paths', async () => {
    const res = await request(testApp).post('/validate').send({ address: {} });
    expectEnvelope(res, 422, 'VALIDATION_ERROR');
    expect(res.body.error.fieldErrors).toEqual({ 'address.line1': 'Enter the street address' });
  });

  it('returns 204 with no body for noContent', async () => {
    const res = await request(testApp).delete('/thing');
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });
});

describe('error envelope on the real app', () => {
  it('404 NOT_FOUND for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expectEnvelope(res, 404, 'NOT_FOUND');
  });

  it('400 BAD_REQUEST for malformed JSON', async () => {
    const res = await request(app).post('/api/v1/health').set('Content-Type', 'application/json').send('{"a":');
    expectEnvelope(res, 400, 'BAD_REQUEST', "The request body isn't valid JSON.");
  });

  it('413 PAYLOAD_TOO_LARGE for bodies over 1 MB', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ text: 'x'.repeat(1_100_000) }));
    expectEnvelope(res, 413, 'PAYLOAD_TOO_LARGE', 'That request is too large. Try sending less data.');
  });
});
