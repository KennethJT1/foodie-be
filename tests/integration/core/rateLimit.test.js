import { describe, expect, it } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { errorHandler, rateLimit, requestId } from '../../../src/core/middlewares/index.js';

describe('Redis rate limit', () => {
  it('returns 429 RATE_LIMITED after the limit, with RateLimit headers', async () => {
    const app = express();
    app.use(requestId);
    // A fresh name per run so earlier runs' counters don't count
    app.use(rateLimit({ name: `test-${Date.now()}`, limit: 2 }));
    app.get('/', (req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    expect((await request(app).get('/')).status).toBe(200);
    const second = await request(app).get('/');
    expect(second.status).toBe(200);
    expect(second.headers.ratelimit).toMatch(/remaining=0/);

    const third = await request(app).get('/');
    expect(third.status).toBe(429);
    expect(third.body.error).toMatchObject({ code: 'RATE_LIMITED', message: 'Too many tries. Please wait a moment.' });
  });
});
