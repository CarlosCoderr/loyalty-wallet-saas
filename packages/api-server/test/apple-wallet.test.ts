import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO, apiClient, createTestApp, queryOne, resetDatabase, sql } from './helpers.js';

const PT = 'pass.com.test.loyalty'; // APPLE_PASS_TYPE_IDENTIFIER de test-env.ts
const DEV = 'iphone-test-123';
const BASE = '/api/apple/v1';
const REG = `${BASE}/devices/${DEV}/registrations/${PT}/${DEMO.passSerial}`;

describe('PassKit Web Service (/api/apple)', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let api: ReturnType<typeof apiClient>;
  let AUTH: Record<string, string>;

  const register = (pushToken: string, headers = AUTH, url = REG) =>
    api.request('POST', url, { body: { pushToken }, headers });
  const deviceCount = async () =>
    Number(
      (await queryOne<{ n: string }>(sql`select count(*) as n from apple_devices where device_library_identifier = ${DEV}`)).n,
    );

  beforeAll(async () => {
    app = await createTestApp();
    api = apiClient(app);
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    await resetDatabase();
    const { authentication_token } = await queryOne<{ authentication_token: string }>(
      sql`select authentication_token from passes where serial_number = ${DEMO.passSerial}`,
    );
    AUTH = { authorization: `ApplePass ${authentication_token}` };
  });

  describe('autenticación', () => {
    it('sin token, token incorrecto o serial inexistente → mismo 401', async () => {
      expect((await register('t', {})).status).toBe(401);
      expect((await register('t', { authorization: `ApplePass ${'x'.repeat(64)}` })).status).toBe(401);
      expect((await register('t', AUTH, `${BASE}/devices/${DEV}/registrations/${PT}/NO-EXISTE`)).status).toBe(401);
    });

    it('passTypeIdentifier ajeno → 404; identificador de 300 caracteres → 4xx', async () => {
      expect((await register('t', AUTH, `${BASE}/devices/${DEV}/registrations/pass.otro/${DEMO.passSerial}`)).status).toBe(404);
      const long = await register('t', AUTH, `${BASE}/devices/${'d'.repeat(300)}/registrations/${PT}/${DEMO.passSerial}`);
      expect(long.status).toBeGreaterThanOrEqual(400);
      expect(long.status).toBeLessThan(500);
    });
  });

  it('registro: 201 nuevo, 200 repetido, actualiza el push token sin duplicar', async () => {
    expect((await register('tok1')).status).toBe(201);
    expect((await register('tok1')).status).toBe(200);
    expect((await register('tok2-nuevo')).status).toBe(200);

    const row = await queryOne<{ push_token: string }>(
      sql`select push_token from apple_devices where device_library_identifier = ${DEV}`,
    );
    expect(row.push_token).toBe('tok2-nuevo');
    expect(await deviceCount()).toBe(1);
  });

  it('seriales cambiados: lista, 204 con el mismo tag, y vuelve a listar tras una compra', async () => {
    await register('tok1');
    const first = await api.get(`${BASE}/devices/${DEV}/registrations/${PT}`);
    expect(first.status).toBe(200);
    expect(first.body.serialNumbers).toEqual([DEMO.passSerial]);
    const tag = first.body.lastUpdated as string;
    expect(tag).toMatch(/^\d+$/);

    expect((await api.get(`${BASE}/devices/${DEV}/registrations/${PT}?passesUpdatedSince=${tag}`)).status).toBe(204);
    expect((await api.get(`${BASE}/devices/otro-iphone/registrations/${PT}`)).status).toBe(204);
    expect((await api.get(`${BASE}/devices/${DEV}/registrations/${PT}?passesUpdatedSince=ayer`)).status).toBe(400);

    const cashier = await api.loginCashier();
    await api.post('/api/v1/loyalty/stamps', { passToken: DEMO.passSerial, amountSpent: 20 }, cashier);

    const after = await api.get(`${BASE}/devices/${DEV}/registrations/${PT}?passesUpdatedSince=${tag}`);
    expect(after.status).toBe(200);
    expect(after.body.serialNumbers).toEqual([DEMO.passSerial]);
    expect(BigInt(after.body.lastUpdated)).toBeGreaterThan(BigInt(tag));
  });

  it('descarga del pase: pkpass + Last-Modified, 304 si no cambió, 401 sin token', async () => {
    const url = `${BASE}/passes/${PT}/${DEMO.passSerial}`;
    const res = await api.request('GET', url, { headers: AUTH });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.apple.pkpass');
    const lastModified = res.headers['last-modified'] as string;
    expect(lastModified).toBeTruthy();

    expect((await api.request('GET', url, { headers: { ...AUTH, 'if-modified-since': lastModified } })).status).toBe(304);
    expect(
      (await api.request('GET', url, { headers: { ...AUTH, 'if-modified-since': 'Mon, 01 Jan 2024 00:00:00 GMT' } })).status,
    ).toBe(200);
    expect((await api.get(url)).status).toBe(401);
  });

  it('baja: 401 sin token, 200 con token, borra el dispositivo sin pases, idempotente', async () => {
    await register('tok1');
    expect((await api.del(REG)).status).toBe(401);
    expect((await api.del(REG, undefined, AUTH)).status).toBe(200);
    expect(await deviceCount()).toBe(0);
    expect((await api.del(REG, undefined, AUTH)).status).toBe(200);
  });

  it('logs de iOS: acepta hasta 50 líneas; 51 → 400; más de 128 KB → 413', async () => {
    expect((await api.post(`${BASE}/log`, { logs: ['Error de prueba'] })).status).toBe(200);
    expect((await api.post(`${BASE}/log`, { logs: Array(51).fill('x') })).status).toBe(400);
    expect((await api.post(`${BASE}/log`, { logs: ['x'.repeat(200_000)] })).status).toBe(413);
  });
});
