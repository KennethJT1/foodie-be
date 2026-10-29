import { beforeAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { signAccessToken } from '../../../src/core/auth/index.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createUser } from '../../helpers/factories.js';

let superAdmin;
let support;

beforeAll(async () => {
  await resetDatabase();
  superAdmin = await createUser({ role: 'admin', adminRole: 'super_admin', phone: null });
  support = await createUser({ role: 'admin', adminRole: 'support', phone: null });
});

describe('Bull Board /admin/queues', () => {
  it('401 without a token; 403 for other admins and customers', async () => {
    expect((await request(app).get('/admin/queues/')).status).toBe(401);
    expect((await request(app).get('/admin/queues/').set('Authorization', bearer(support))).status).toBe(403);
    expect((await request(app).get(`/admin/queues?token=${signAccessToken(support)}`)).status).toBe(403);
    expect(
      (
        await request(app)
          .get('/admin/queues/')
          .set('Authorization', bearer(await createUser()))
      ).status,
    ).toBe(403);
  });

  it('a super admin link sets a path-scoped cookie, drops the token from the URL and opens the board', async () => {
    const agent = request.agent(app);
    const link = await agent.get(`/admin/queues?token=${signAccessToken(superAdmin)}`);
    expect(link.status).toBe(302);
    expect(link.headers.location).toBe('/admin/queues/');
    expect(link.headers['set-cookie'][0]).toMatch(/^kjt_board=.+; Path=\/admin\/queues; HttpOnly; SameSite=Strict/);

    const page = await agent.get('/admin/queues/');
    expect(page.status).toBe(200);
    expect(page.text).toMatch(/<div id="root">/);
    const queues = await agent.get('/admin/queues/api/queues');
    expect(queues.status).toBe(200);
    expect(queues.body.queues.map((q) => q.name)).toContain('notifications');
  });
});
