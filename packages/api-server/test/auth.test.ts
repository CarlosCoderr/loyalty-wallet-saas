import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_FAILED_ATTEMPTS } from '../src/services/auth.service.js';
import { staffUsers } from '../src/db/schema.js';
import { DEMO, apiClient, createTestApp, db, resetDatabase } from './helpers.js';

type App = Awaited<ReturnType<typeof createTestApp>>;

async function lockState(email: string) {
  const [row] = await db
    .select({ failed: staffUsers.failedAttempts, until: staffUsers.lockoutUntil })
    .from(staffUsers)
    .where(eq(staffUsers.email, email));
  return { failed: row.failed, locked: !!row.until && row.until > new Date() };
}

describe('POST /auth/login', () => {
  let app: App;
  let api: ReturnType<typeof apiClient>;

  beforeAll(async () => {
    app = await createTestApp();
    api = apiClient(app);
  });
  afterAll(() => app.close());
  beforeEach(() => resetDatabase());

  it('acepta la contraseña y devuelve token, usuario y tenant (sin hashes)', async () => {
    const res = await api.loginRaw(DEMO.cashier.email, DEMO.cashier.password);
    expect(res.status).toBe(200);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({ email: DEMO.cashier.email, role: 'cashier', branchName: 'Sucursal Centro' });
    expect(res.body.data.tenant.slug).toBe(DEMO.tenantSlug);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|pinHash|tokenVersion/);
  });

  it('acepta el PIN del cajero y el email sin importar mayúsculas', async () => {
    expect((await api.loginRaw('Cajero@AgenciaDemo.com', DEMO.cashier.pin)).status).toBe(200);
  });

  it('mismo 401 y mensaje para clave incorrecta, usuario inexistente y tenant inexistente', async () => {
    const wrong = await api.loginRaw(DEMO.cashier.email, 'incorrecta');
    const ghost = await api.loginRaw('nadie@agenciademo.com', 'incorrecta');
    const noTenant = await api.loginRaw(DEMO.cashier.email, DEMO.cashier.password, 'no-existe');
    for (const res of [wrong, ghost, noTenant]) {
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Credenciales inválidas');
    }
  });

  it('body inválido → 400 con errores por campo', async () => {
    const res = await api.post('/api/v1/auth/login', { email: 'no-es-email' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors)).toEqual(expect.arrayContaining(['tenantSlug', 'email', 'password']));
  });

  describe('bloqueo por cuenta', () => {
    it(`${MAX_FAILED_ATTEMPTS} fallos bloquean la cuenta; los anteriores no`, async () => {
      for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) await api.loginRaw(DEMO.cashier.email, `mala-${i}`);
      expect(await lockState(DEMO.cashier.email)).toEqual({ failed: MAX_FAILED_ATTEMPTS - 1, locked: false });

      expect((await api.loginRaw(DEMO.cashier.email, 'mala-final')).status).toBe(401);
      expect(await lockState(DEMO.cashier.email)).toEqual({ failed: MAX_FAILED_ATTEMPTS, locked: true });
    });

    it('bloqueada: 423 con clave correcta, incorrecta o PIN (no revela cuándo se acierta)', async () => {
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) await api.loginRaw(DEMO.cashier.email, `mala-${i}`);

      const statuses = await Promise.all(
        [DEMO.cashier.password, 'otra-mala', DEMO.cashier.pin].map(async (p) => (await api.loginRaw(DEMO.cashier.email, p)).status),
      );
      expect(statuses).toEqual([423, 423, 423]);
      // Otro usuario del mismo tenant no se ve afectado
      expect((await api.loginRaw(DEMO.admin.email, DEMO.admin.password)).status).toBe(200);
    });

    it('al vencer el bloqueo el contador reinicia: un error de dedo no vuelve a bloquear', async () => {
      await db
        .update(staffUsers)
        .set({ failedAttempts: MAX_FAILED_ATTEMPTS, lockoutUntil: new Date(Date.now() - 1000) })
        .where(eq(staffUsers.email, DEMO.cashier.email));

      expect((await api.loginRaw(DEMO.cashier.email, 'error-de-dedo')).status).toBe(401);
      expect(await lockState(DEMO.cashier.email)).toEqual({ failed: 1, locked: false });
    });

    it('un login correcto reinicia el contador', async () => {
      await api.loginRaw(DEMO.cashier.email, 'mala');
      await api.loginRaw(DEMO.cashier.email, 'mala');
      expect((await api.loginRaw(DEMO.cashier.email, DEMO.cashier.password)).status).toBe(200);
      expect(await lockState(DEMO.cashier.email)).toEqual({ failed: 0, locked: false });
    });

    it('el contador es atómico: 12 fallos simultáneos cuentan 12', async () => {
      await Promise.all(Array.from({ length: 12 }, (_, i) => api.loginRaw(DEMO.admin.email, `paralelo-${i}`)));
      expect(await lockState(DEMO.admin.email)).toEqual({ failed: 12, locked: true });
    });

    it('un email inexistente nunca responde "bloqueada"', async () => {
      for (let i = 0; i < MAX_FAILED_ATTEMPTS + 2; i++) {
        expect((await api.loginRaw('nadie@agenciademo.com', `xxxx-${i}`)).status).toBe(401);
      }
    });
  });
});

describe('límite de intentos por IP', () => {
  let app: App;
  let api: ReturnType<typeof apiClient>;
  let adminToken: string;

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp({ loginRateLimitMax: 20 });
    api = apiClient(app);
    adminToken = await api.loginAdmin(); // consume 1 de los 20 intentos de la ventana
  });
  afterAll(() => app.close());

  it('GET /me no tiene límite (30 llamadas seguidas → 200)', async () => {
    for (let i = 0; i < 30; i++) expect((await api.get('/api/v1/auth/me', adminToken)).status).toBe(200);
  });

  it('login: 20 intentos por IP; el 21º → 429 en el formato de la API', async () => {
    // El login del beforeAll ya consumió 1 intento de esta ventana
    for (let i = 0; i < 19; i++) expect((await api.loginRaw('nadie@agenciademo.com', 'xxxx')).status).toBe(401);

    const res = await api.loginRaw(DEMO.admin.email, DEMO.admin.password);
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ status: 'error' });
    expect(res.body.message).toMatch(/Demasiados intentos de inicio de sesión.*minutos/);
  });

  it('con el login limitado, /me y la caja siguen funcionando', async () => {
    expect((await api.get('/api/v1/auth/me', adminToken)).status).toBe(200);
    expect((await api.get(`/api/v1/loyalty/pass/${DEMO.passSerial}`, adminToken)).status).toBe(200);
  });
});

describe('GET /auth/me y sesiones', () => {
  let app: App;
  let api: ReturnType<typeof apiClient>;

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
    api = apiClient(app);
  });
  afterAll(() => app.close());

  it('con token → datos de la sesión; sin token o token falso → 401', async () => {
    const token = await api.loginCashier();
    const me = await api.get('/api/v1/auth/me', token);
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ role: 'cashier', tenantId: expect.any(String), ver: 0 });

    expect((await api.get('/api/v1/auth/me')).status).toBe(401);
    expect((await api.get('/api/v1/auth/me', 'token.falso.x')).status).toBe(401);
  });

  it('un token firmado sin la versión de credenciales actual → 401', async () => {
    const token = await api.loginCashier();
    const payload = app.jwt.decode<Record<string, unknown>>(token)!;
    const stale = app.jwt.sign({ ...(payload as any), ver: 99 });
    expect((await api.get('/api/v1/auth/me', stale)).status).toBe(401);
  });
});
