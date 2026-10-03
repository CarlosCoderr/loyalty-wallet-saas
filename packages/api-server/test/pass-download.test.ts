import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appleDownloadUrl } from '../src/services/pass-download.service.js';
import { DEMO, apiClient, createTestApp, resetDatabase } from './helpers.js';

const BASE_URL = 'http://localhost:4000'; // PUBLIC_BASE_URL de test-env.ts
const path = (url: string) => url.replace(BASE_URL, '');

describe('descarga pública de la tarjeta (/api/v1/passes/:serial/apple)', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let api: ReturnType<typeof apiClient>;
  let url: string;
  let serial: string;
  let customerId: string;
  let cashier: string;

  beforeAll(async () => {
    app = await createTestApp();
    api = apiClient(app);
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    const { programId } = await resetDatabase();
    cashier = await api.loginCashier();
    customerId = (await api.post('/api/v1/customers', { firstName: 'María', phone: '5533334444' }, cashier)).body.data.id;
    const issued = await api.post(`/api/v1/customers/${customerId}/passes`, { programId }, cashier);
    expect(issued.status).toBe(201);
    serial = issued.body.data.serialNumber;
    url = issued.body.data.wallet.appleDownloadUrl;
  });

  it('emitir la tarjeta devuelve un enlace firmado, sin exponer el token secreto', async () => {
    expect(url).toMatch(new RegExp(`^${BASE_URL}/api/v1/passes/${serial}/apple\\?sig=[\\w-]{32}$`));
    expect(url).toBe(appleDownloadUrl(serial));
    const detail = await api.get(`/api/v1/customers/${customerId}`, cashier);
    expect(detail.body.data.passes[0].appleDownloadUrl).toBe(url);
    expect(JSON.stringify(detail.body)).not.toContain('authenticationToken');
  });

  it('sin JWT: responde el .pkpass con los headers que activan la hoja de Apple Wallet', async () => {
    const res = await api.get(path(url));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.apple.pkpass');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="${serial}.pkpass"`);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['last-modified']).toBeTruthy();
    expect(res.raw.length).toBeGreaterThan(0);
  });

  it('firma ausente, alterada o de otra tarjeta → 404 (igual que serial inexistente)', async () => {
    const sig = new URL(url).searchParams.get('sig')!;
    const tampered = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');
    expect((await api.get(path(url).split('?')[0])).status).toBe(404);
    expect((await api.get(`/api/v1/passes/${serial}/apple?sig=${tampered}`)).status).toBe(404);
    expect((await api.get(`/api/v1/passes/${DEMO.passSerial}/apple?sig=${sig}`)).status).toBe(404);
    expect((await api.get(`/api/v1/passes/${encodeURIComponent('../../etc')}/apple?sig=x`)).status).toBe(404);
  });
});
