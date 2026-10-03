import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { apiClient, createTestApp, resetDatabase } from './helpers.js';

const CUSTOMERS = '/api/v1/customers';

describe('clientes y emisión de tarjetas (/api/v1/customers)', () => {
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

  describe('permisos', () => {
    it('cajero: listar, dar de alta, ver y emitir; editar → 403', async () => {
      expect((await api.get(CUSTOMERS)).status).toBe(401);
      expect((await api.get(`${CUSTOMERS}?search=prueba`, cashier)).status).toBe(200);
      const c = await api.post(CUSTOMERS, { firstName: 'Luis', phone: '5511112222' }, cashier);
      expect(c.status).toBe(201);
      expect((await api.get(`${CUSTOMERS}/${c.body.data.id}`, cashier)).status).toBe(200);
      expect((await api.post(`${CUSTOMERS}/${c.body.data.id}/passes`, { programId }, cashier)).status).toBe(201);
      expect((await api.patch(`${CUSTOMERS}/${c.body.data.id}`, { firstName: 'X' }, cashier)).status).toBe(403);
      expect((await api.patch(`${CUSTOMERS}/${c.body.data.id}`, { firstName: 'Luis A.' }, admin)).status).toBe(200);
    });

    it('la ruta antigua /api/v1/admin/customers ya no existe', async () => {
      expect((await api.get('/api/v1/admin/customers', admin)).status).toBe(404);
    });
  });

  it('alta: normaliza teléfono y email; mismo teléfono con otro formato → 409', async () => {
    const res = await api.post(CUSTOMERS, { firstName: 'Ana', lastName: 'López', phone: '55 1234-5678', email: 'Ana.Lopez@Mail.com' }, admin);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ phone: '5512345678', email: 'ana.lopez@mail.com' });
    expect((await api.post(CUSTOMERS, { firstName: 'Otra', phone: '(55) 1234 5678' }, admin)).status).toBe(409);
  });

  it('validaciones: teléfono, fecha y campos desconocidos → 400; edición de inexistente → 404', async () => {
    expect((await api.post(CUSTOMERS, { firstName: 'X', phone: 'abc' }, admin)).status).toBe(400);
    expect((await api.post(CUSTOMERS, { firstName: 'X', phone: '5599999999', birthDate: '31/12/1990' }, admin)).status).toBe(400);
    expect((await api.post(CUSTOMERS, { firstName: 'X', phone: '5599999999', vip: true }, admin)).status).toBe(400);
    expect((await api.patch(`${CUSTOMERS}/${randomUUID()}`, { firstName: 'Y' }, admin)).status).toBe(404);
  });

  it('búsqueda sin distinguir mayúsculas, "%" literal y paginación estable', async () => {
    await api.post(CUSTOMERS, { firstName: 'Ana', lastName: 'López', phone: '5512345678' }, admin);
    expect((await api.get(`${CUSTOMERS}?search=ana`, admin)).body.data.total).toBe(1);
    expect((await api.get(`${CUSTOMERS}?search=%25`, admin)).body.data.total).toBe(0);

    const p1 = (await api.get(`${CUSTOMERS}?page=1&limit=1`, admin)).body.data;
    const p2 = (await api.get(`${CUSTOMERS}?page=2&limit=1`, admin)).body.data;
    expect(p1.total).toBe(2);
    expect(p1.items[0].id).not.toBe(p2.items[0].id);
  });

  it('detalle: pases sin authenticationToken', async () => {
    const demo = (await api.get(`${CUSTOMERS}?search=Prueba`, admin)).body.data.items[0];
    const res = await api.get(`${CUSTOMERS}/${demo.id}`, admin);
    expect(res.body.data.passes).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain('authenticationToken');
  });

  describe('emisión de tarjetas', () => {
    it('programa borrador → 409; inexistente → 404; repetida → 409', async () => {
      const c = (await api.post(CUSTOMERS, { firstName: 'Ana', phone: '5512345678' }, admin)).body.data;
      const draft = (await api.post('/api/v1/admin/programs', { title: 'Borrador', stampRuleType: 'per_visit', totalStamps: 5, rewardTitle: 'Premio', status: 'draft' }, admin)).body.data;
      expect((await api.post(`${CUSTOMERS}/${c.id}/passes`, { programId: draft.id }, admin)).status).toBe(409);
      expect((await api.post(`${CUSTOMERS}/${c.id}/passes`, { programId: randomUUID() }, admin)).status).toBe(404);
      expect((await api.post(`${CUSTOMERS}/${c.id}/passes`, { programId }, admin)).status).toBe(201);
      expect((await api.post(`${CUSTOMERS}/${c.id}/passes`, { programId }, admin)).status).toBe(409);
    });

    it('la tarjeta nueva tiene serial aleatorio de 20 caracteres y el cajero ya puede usarla', async () => {
      const c = (await api.post(CUSTOMERS, { firstName: 'Ana', phone: '5512345678' }, cashier)).body.data;
      const res = await api.post(`${CUSTOMERS}/${c.id}/passes`, { programId }, cashier);
      const serial = res.body.data.serialNumber as string;
      expect(serial).toMatch(/^[0-9A-F]{20}$/);
      expect(res.body.data.wallet.googleSaveUrl).toBeTruthy();
      expect(JSON.stringify(res.body)).not.toContain('authenticationToken');

      expect((await api.get(`/api/v1/loyalty/pass/${serial}`, cashier)).body.data.currentStamps).toBe(0);
      const stamped = await api.post('/api/v1/loyalty/stamps', { passToken: serial, amountSpent: 25 }, cashier);
      expect(stamped.body.data).toMatchObject({ stampsEarned: 2, carryoverAmount: '5.00' });
    });
  });
});
