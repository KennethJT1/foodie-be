import { describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';

describe('GET /api/v1/health', () => {
  it('returns ok with the time', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { status: 'ok', time: expect.any(String), uptime: expect.any(Number) },
    });
    expect(new Date(res.body.data.time).toISOString()).toBe(res.body.data.time);
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('is not rate limited', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers).not.toHaveProperty('ratelimit');
  });
});

describe('GET /health (load balancers)', () => {
  it('stays at the server root', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('/health/ready checks MySQL and Redis', async () => {
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'ready', checks: { mysql: 'up', redis: 'up' } });
  });
});

describe('CORS', () => {
  it.each(['http://localhost:5173', 'http://localhost:5174', 'http://localhost:4173'])(
    'allows %s with credentials',
    async (origin) => {
      const res = await request(app)
        .options('/api/v1/health')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'PATCH')
        .set('Access-Control-Request-Headers', 'Authorization, Content-Type');
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-methods']).toBe('GET,POST,PATCH,DELETE');
      expect(res.headers['access-control-allow-headers']).toBe('Authorization,Content-Type');
    },
  );

  it('does not allow other origins', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(res.headers).not.toHaveProperty('access-control-allow-origin');
  });
});

describe('Swagger', () => {
  it('serves the master contract', async () => {
    const res = await request(app).get('/docs/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.paths).toHaveProperty('/health');
    expect(res.body.paths).toHaveProperty(['/auth/register']);
  });
});
