import type { FastifyInstance } from 'fastify';
import { like, sql } from 'drizzle-orm';
import { buildApp, type BuildAppOptions } from '../src/app.js';
import { DEMO, seedDemoData } from '../src/db/demo-data.js';
import { db } from '../src/db/index.js';
import { tenants } from '../src/db/schema.js';

export { DEMO, db, sql };

export interface ApiResponse<T = any> {
  status: number;
  body: T;
  headers: Record<string, string | string[] | number | undefined>;
  raw: Buffer;
}

export async function createTestApp(options?: BuildAppOptions) {
  const app = await buildApp(options);
  await app.ready();
  return app;
}

/** Cliente sobre app.inject(): ejecuta la petición completa (hooks, validación, errores) sin abrir puertos. */
export function apiClient(app: FastifyInstance) {
  async function request<T = any>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<ApiResponse<T>> {
    const res = await app.inject({
      method,
      url,
      headers: { ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...opts.headers },
      ...(opts.body !== undefined ? { payload: opts.body as object } : {}),
    });
    let body: any = null;
    if (res.body && String(res.headers['content-type'] ?? '').includes('json')) body = res.json();
    return { status: res.statusCode, body, headers: res.headers, raw: res.rawPayload };
  }

  const loginRaw = (email: string, password: string, tenantSlug: string = DEMO.tenantSlug) =>
    request('POST', '/api/v1/auth/login', { body: { tenantSlug, email, password } });

  async function login(email: string, password: string) {
    const res = await loginRaw(email, password);
    if (res.status !== 200) throw new Error(`Login de ${email} falló: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.data.token as string;
  }

  return {
    request,
    get: <T = any>(url: string, token?: string) => request<T>('GET', url, { token }),
    post: <T = any>(url: string, body?: unknown, token?: string) => request<T>('POST', url, { body, token }),
    patch: <T = any>(url: string, body?: unknown, token?: string) => request<T>('PATCH', url, { body, token }),
    del: <T = any>(url: string, token?: string, headers?: Record<string, string>) =>
      request<T>('DELETE', url, { token, headers }),
    loginRaw,
    login,
    loginAdmin: () => login(DEMO.admin.email, DEMO.admin.password),
    loginCashier: () => login(DEMO.cashier.email, DEMO.cashier.password),
  };
}

/** Deja la BD de pruebas en el estado demo: borra tenants creados por las pruebas y recrea el demo. */
export async function resetDatabase() {
  await db.delete(tenants).where(like(tenants.slug, 'test-%'));
  return seedDemoData();
}

/** Primera fila de una consulta SQL directa (para verificar el estado en la BD). */
export async function queryOne<T = Record<string, unknown>>(query: ReturnType<typeof sql>) {
  const rows = (await db.execute(query)) as unknown as T[];
  return rows[0];
}
