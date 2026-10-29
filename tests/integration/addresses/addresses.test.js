import { beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createUser } from '../../helpers/factories.js';

const home = {
  label: 'Home',
  line1: '12 Herbert Macaulay Way',
  area: 'Yaba',
  city: 'Lagos',
  state: 'Lagos',
  lat: 6.5095,
  lng: 3.3711,
  directions: 'Blue gate',
};
const work = {
  label: 'Work',
  line1: '3 Adeola Odeku St',
  area: 'Victoria Island',
  city: 'Lagos',
  state: 'Lagos',
  lat: '6.4281',
  lng: '3.4219',
};

let ada;
let auth;
const api = () => request(app);

beforeEach(async () => {
  await resetDatabase();
  ada = await createUser();
  auth = bearer(ada);
});

describe('addresses', () => {
  it('only customers may use them', async () => {
    expect((await api().get('/api/v1/addresses')).status).toBe(401);
    const vendor = await createUser({ role: 'vendor' });
    const res = await api().get('/api/v1/addresses').set('Authorization', bearer(vendor));
    expect(res.status).toBe(403);
  });

  it('the first address becomes the default; list is default first', async () => {
    const first = await api().post('/api/v1/addresses').set('Authorization', auth).send(home);
    expect(first.status).toBe(201);
    expect(first.body.data).toEqual({ id: expect.any(String), ...home, isDefault: true });

    const second = await api().post('/api/v1/addresses').set('Authorization', auth).send(work);
    expect(second.body.data).toMatchObject({ lat: 6.4281, lng: 3.4219, isDefault: false, directions: '' });

    await api().post(`/api/v1/addresses/${second.body.data.id}/default`).set('Authorization', auth).expect(200);
    const list = await api().get('/api/v1/addresses').set('Authorization', auth);
    expect(list.body.data.map((a) => [a.label, a.isDefault])).toEqual([
      ['Work', true],
      ['Home', false],
    ]);
  });

  it('isDefault on create or update moves the default', async () => {
    await api().post('/api/v1/addresses').set('Authorization', auth).send(home);
    const w = await api()
      .post('/api/v1/addresses')
      .set('Authorization', auth)
      .send({ ...work, isDefault: true });
    expect(w.body.data.isDefault).toBe(true);
    const list = await api().get('/api/v1/addresses').set('Authorization', auth);
    expect(list.body.data.filter((a) => a.isDefault)).toHaveLength(1);
  });

  it('PATCH changes only what is sent', async () => {
    const { body } = await api().post('/api/v1/addresses').set('Authorization', auth).send(home);
    const res = await api()
      .patch(`/api/v1/addresses/${body.data.id}`)
      .set('Authorization', auth)
      .send({ directions: 'Opposite the church' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ line1: home.line1, directions: 'Opposite the church' });
  });

  it('deleting the default promotes the next one', async () => {
    const h = await api().post('/api/v1/addresses').set('Authorization', auth).send(home);
    await api().post('/api/v1/addresses').set('Authorization', auth).send(work);
    const res = await api().delete(`/api/v1/addresses/${h.body.data.id}`).set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: h.body.data.id, deleted: true });
    const list = await api().get('/api/v1/addresses').set('Authorization', auth);
    expect(list.body.data).toMatchObject([{ label: 'Work', isDefault: true }]);
  });

  it("someone else's address is a 404", async () => {
    const { body } = await api().post('/api/v1/addresses').set('Authorization', auth).send(home);
    const other = bearer(await createUser());
    for (const req of [
      api().patch(`/api/v1/addresses/${body.data.id}`).set('Authorization', other).send({ label: 'Mine' }),
      api().delete(`/api/v1/addresses/${body.data.id}`).set('Authorization', other),
      api().post(`/api/v1/addresses/${body.data.id}/default`).set('Authorization', other),
    ]) {
      const res = await req;
      expect(res.status).toBe(404);
      expect(res.body.error.message).toBe("We couldn't find that address.");
    }
  });

  it('422 with the frontend field names (pin for the map)', async () => {
    const res = await api().post('/api/v1/addresses').set('Authorization', auth).send({ line1: ' ', lat: 'x' });
    expect(res.status).toBe(422);
    expect(res.body.error.fieldErrors).toEqual({
      line1: 'Enter the street address',
      area: 'Enter the area',
      city: 'Pick a city',
      pin: 'Drop a pin on the map',
    });
    const { body } = await api().post('/api/v1/addresses').set('Authorization', auth).send(home);
    const bad = await api().patch(`/api/v1/addresses/${body.data.id}`).set('Authorization', auth).send({ lat: 200 });
    expect(bad.body.error.fieldErrors).toEqual({ pin: 'Drop a pin on the map' });
  });
});
