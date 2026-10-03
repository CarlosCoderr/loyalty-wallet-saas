import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO, apiClient, createTestApp, resetDatabase } from './helpers.js';

const STAFF = '/api/v1/admin/staff';
const PASS = `/api/v1/loyalty/pass/${DEMO.passSerial}`;

describe('gestión de staff y sesiones (/api/v1/admin/staff)', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let api: ReturnType<typeof apiClient>;
  let admin: string;
  let branchId: string;

  const createCashier = (extra: Record<string, unknown> = {}) =>
    api.post(STAFF, { fullName: 'Ana Caja', email: 'ana@x.com', password: 'clave1234', branchId, ...extra }, admin);

  beforeAll(async () => {
    app = await createTestApp();
    api = apiClient(app);
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    ({ branchId } = await resetDatabase());
    admin = await api.loginAdmin();
  });

  it('cajero → 403; listado sin hashes ni tokenVersion', async () => {
    expect((await api.get(STAFF, await api.loginCashier())).status).toBe(403);
    const res = await api.get(STAFF, admin);
    expect(res.body.data).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|pinHash|tokenVersion/);
  });

  it('validaciones de alta: sucursal obligatoria para cajeros, rol válido, contraseña ≥ 8', async () => {
    expect((await createCashier({ branchId: undefined })).status).toBe(400);
    expect((await createCashier({ branchId: randomUUID() })).status).toBe(404);
    expect((await createCashier({ role: 'staff' })).status).toBe(400);
    expect((await createCashier({ password: 'abc123' })).status).toBe(400);
  });

  it('alta: email en minúsculas, rol cashier por defecto; email repetido → 409', async () => {
    const res = await createCashier({ email: 'Ana@X.com', pin: '4321' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: 'ana@x.com', role: 'cashier', branch: { code: 'CENTRO' } });
    expect((await createCashier({ email: 'ANA@x.com' })).status).toBe(409);

    expect((await api.loginRaw('ana@x.com', 'clave1234')).status).toBe(200);
    expect((await api.loginRaw('ana@x.com', '4321')).status).toBe(200);
  });

  it('cambiar la contraseña invalida al instante el token anterior', async () => {
    const id = (await createCashier()).body.data.id;
    const old = await api.login('ana@x.com', 'clave1234');
    expect((await api.get(PASS, old)).status).toBe(200);

    await api.patch(`${STAFF}/${id}`, { password: 'nueva12345' }, admin);
    expect((await api.get(PASS, old)).status).toBe(401);
    expect((await api.loginRaw('ana@x.com', 'nueva12345')).status).toBe(200);
  });

  it('desactivar corta la sesión al instante; login 403 solo con la clave correcta', async () => {
    const id = (await createCashier()).body.data.id;
    const token = await api.login('ana@x.com', 'clave1234');

    await api.patch(`${STAFF}/${id}`, { isActive: false }, admin);
    expect((await api.get(PASS, token)).status).toBe(401);
    const res = await api.loginRaw('ana@x.com', 'clave1234');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/desactivado/);
    expect((await api.loginRaw('ana@x.com', 'mala-clave')).status).toBe(401);

    await api.patch(`${STAFF}/${id}`, { isActive: true }, admin);
    expect((await api.loginRaw('ana@x.com', 'clave1234')).status).toBe(200);
  });

  it('un cajero no puede quedar sin sucursal; un ascenso aplica con el mismo token', async () => {
    const id = (await createCashier()).body.data.id;
    const token = await api.login('ana@x.com', 'clave1234');
    expect((await api.patch(`${STAFF}/${id}`, { branchId: null }, admin)).status).toBe(400);

    expect((await api.get('/api/v1/admin/branches', token)).status).toBe(403);
    await api.patch(`${STAFF}/${id}`, { role: 'admin' }, admin);
    expect((await api.get('/api/v1/admin/branches', token)).status).toBe(200);
  });

  it('un admin no puede quitarse el rol ni desactivarse a sí mismo', async () => {
    const adminId = (await api.get('/api/v1/auth/me', admin)).body.data.sub;
    expect((await api.patch(`${STAFF}/${adminId}`, { isActive: false }, admin)).status).toBe(409);
    expect((await api.patch(`${STAFF}/${adminId}`, { role: 'cashier', branchId }, admin)).status).toBe(409);
  });

  it('dos admins degradándose mutuamente a la vez: siempre queda exactamente 1 admin (sin deadlock)', async () => {
    const adminId = (await api.get('/api/v1/auth/me', admin)).body.data.sub;
    const b = (await createCashier({ email: 'b@x.com', role: 'admin', branchId: undefined })).body.data;

    for (let round = 0; round < 5; round++) {
      const tokA = await api.loginAdmin();
      const tokB = await api.login('b@x.com', 'clave1234');
      const [x, y] = await Promise.all([
        api.patch(`${STAFF}/${b.id}`, { role: 'cashier', branchId }, tokA),
        api.patch(`${STAFF}/${adminId}`, { role: 'cashier', branchId }, tokB),
      ]);
      const codes = [x.status, y.status].sort();
      // El perdedor recibe 409 (dejaría sin admins) o 403 (ya lo degradaron antes de entrar)
      expect(codes[0]).toBe(200);
      expect([403, 409]).toContain(codes[1]);

      const survivor = x.status === 200 ? tokA : tokB;
      const list = (await api.get(STAFF, survivor)).body.data as { role: string; isActive: boolean }[];
      expect(list.filter((s) => s.role === 'admin' && s.isActive)).toHaveLength(1);
      await api.patch(`${STAFF}/${x.status === 200 ? b.id : adminId}`, { role: 'admin' }, survivor);
    }
  });
});
