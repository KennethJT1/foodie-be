import { beforeAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { ADMIN_ROLES, DEFAULT_ROLE_PERMISSIONS } from '../../../src/core/auth/index.js';
import { ADMIN_ENDPOINTS } from '../../helpers/adminEndpoints.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createUser } from '../../helpers/factories.js';

const send = (method, path, auth) => {
  const req = request(app)[method.toLowerCase()](path);
  if (auth) req.set('Authorization', auth);
  return method === 'GET' ? req : req.send({});
};

describe('admin permission matrix', () => {
  const tokens = {};

  beforeAll(async () => {
    await resetDatabase();
    for (const role of ADMIN_ROLES)
      tokens[role] = bearer(await createUser({ role: 'admin', adminRole: role, phone: null }));
    tokens.customer = bearer(await createUser());
    tokens.vendor = bearer(await createUser({ role: 'vendor' }));
  });

  const cases = ADMIN_ENDPOINTS.flatMap(([method, path, permission]) =>
    ADMIN_ROLES.map((role) => [role, method, path, permission, DEFAULT_ROLE_PERMISSIONS[role].includes(permission)]),
  );

  it.each(cases)('%s → %s %s (%s): allowed=%s', async (role, method, path, permission, allowed) => {
    const res = await send(method, path, tokens[role]);
    if (allowed) expect(res.status).not.toBe(403);
    else {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it.each(ADMIN_ENDPOINTS)('non-admins get 403 and no token gets 401: %s %s', async (method, path) => {
    expect((await send(method, path, tokens.customer)).status).toBe(403);
    expect((await send(method, path, tokens.vendor)).status).toBe(403);
    expect((await send(method, path)).status).toBe(401);
  });
});
