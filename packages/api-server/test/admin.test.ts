import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO, apiClient, createTestApp, resetDatabase } from './helpers.js';

const ADMIN = '/api/v1/admin';

describe('panel de administración (/api/v1/admin)', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let api: ReturnType<typeof apiClient>;
  let admin: string;
  let cashier: string;
  let programId: string;

  beforeAll(async () => {
    app = await createTestApp();
    api = apiClient(app);
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    ({ programId } = await resetDatabase());
    admin = await api.loginAdmin();
    cashier = await api.loginCashier();
  });

  it('acceso: sin token 401, cajero 403, admin 200', async () => {
    expect((await api.get(`${ADMIN}/branches`)).status).toBe(401);
    expect((await api.get(`${ADMIN}/branches`, cashier)).status).toBe(403);
    expect((await api.get(`${ADMIN}/branches`, admin)).status).toBe(200);
  });

  describe('tenant', () => {
    it('lee y edita nombre/teléfono; el slug no es editable; PATCH vacío → 400', async () => {
      expect((await api.get(`${ADMIN}/tenant`, admin)).body.data.slug).toBe(DEMO.tenantSlug);
      expect((await api.patch(`${ADMIN}/tenant`, { slug: 'otro' }, admin)).status).toBe(400);
      expect((await api.patch(`${ADMIN}/tenant`, {}, admin)).status).toBe(400);

      const res = await api.patch(`${ADMIN}/tenant`, { name: 'Agencia Demo SA', phone: '+52 55 1234 5678' }, admin);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ name: 'Agencia Demo SA', slug: DEMO.tenantSlug });
    });
  });

  describe('sucursales', () => {
    it('crea con código en mayúsculas y teléfono; lista sin apiKeyHash', async () => {
      const res = await api.post(`${ADMIN}/branches`, { name: 'Sucursal Norte', code: 'norte', phone: '555-1234' }, admin);
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ code: 'NORTE', phone: '555-1234' });

      const list = await api.get(`${ADMIN}/branches`, admin);
      expect(list.body.data).toHaveLength(2);
      expect(JSON.stringify(list.body)).not.toContain('apiKeyHash');
    });

    it('código duplicado → 409 (al crear y al editar); validaciones → 400; inexistente → 404', async () => {
      const norte = (await api.post(`${ADMIN}/branches`, { name: 'Norte', code: 'NORTE' }, admin)).body.data.id;
      expect((await api.post(`${ADMIN}/branches`, { name: 'Otra', code: 'NORTE' }, admin)).status).toBe(409);
      expect((await api.patch(`${ADMIN}/branches/${norte}`, { code: 'CENTRO' }, admin)).status).toBe(409);
      expect((await api.post(`${ADMIN}/branches`, { name: 'Otra' }, admin)).status).toBe(400);
      expect((await api.post(`${ADMIN}/branches`, { name: 'Otra', code: 'SUR', foo: 1 }, admin)).status).toBe(400);
      expect((await api.patch(`${ADMIN}/branches/${randomUUID()}`, { name: 'Sucursal X' }, admin)).status).toBe(404);
      expect((await api.patch(`${ADMIN}/branches/123`, { name: 'Sucursal X' }, admin)).status).toBe(400);
    });
  });

  describe('programas', () => {
    it('crea por visita en borrador con descripción del premio', async () => {
      const res = await api.post(
        `${ADMIN}/programs`,
        { title: 'Visitas VIP', stampRuleType: 'per_visit', totalStamps: 8, rewardTitle: 'Postre gratis', rewardDescription: 'Cualquier postre', status: 'draft', primaryColor: '#FF5500' },
        admin,
      );
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ status: 'draft', rewardDescription: 'Cualquier postre', stampRuleType: 'per_visit' });
    });

    it('validaciones: per_amount sin amountPerStamp 400, regla "amount" 400, PATCH vacío 400', async () => {
      expect((await api.post(`${ADMIN}/programs`, { title: 'P1', stampRuleType: 'per_amount', totalStamps: 5, rewardTitle: 'Premio' }, admin)).status).toBe(400);
      expect((await api.post(`${ADMIN}/programs`, { title: 'P1', stampRuleType: 'amount', totalStamps: 5, rewardTitle: 'Premio' }, admin)).status).toBe(400);
      expect((await api.patch(`${ADMIN}/programs/${programId}`, {}, admin)).status).toBe(400);
    });

    it('bajar totalStamps al nivel de un pase existente → 409; por encima → 200 y marca pases a actualizar', async () => {
      // El pase demo tiene 3 sellos
      expect((await api.patch(`${ADMIN}/programs/${programId}`, { totalStamps: 3 }, admin)).status).toBe(409);
      const res = await api.patch(`${ADMIN}/programs/${programId}`, { totalStamps: 4, primaryColor: '#123456' }, admin);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ totalStamps: 4, passesUpdated: 1 });
      expect((await api.patch(`${ADMIN}/programs/${programId}`, { totalStamps: 12 }, admin)).status).toBe(200);
    });

    it('programa archivado bloquea compras; al reactivarlo vuelven a funcionar', async () => {
      await api.patch(`${ADMIN}/programs/${programId}`, { status: 'archived' }, admin);
      const blocked = await api.post('/api/v1/loyalty/stamps', { passToken: DEMO.passSerial, amountSpent: 50 }, cashier);
      expect(blocked.status).toBe(409);

      await api.patch(`${ADMIN}/programs/${programId}`, { status: 'active' }, admin);
      expect((await api.post('/api/v1/loyalty/stamps', { passToken: DEMO.passSerial, amountSpent: 10 }, cashier)).status).toBe(200);
    });
  });
});
