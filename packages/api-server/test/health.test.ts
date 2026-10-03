import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, createTestApp, resetDatabase } from './helpers.js';

describe('app', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let api: ReturnType<typeof apiClient>;

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
    api = apiClient(app);
  });
  afterAll(() => app.close());

  it('GET /health responde ok', async () => {
    const res = await api.get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('ruta inexistente → 404', async () => {
    expect((await api.get('/no-existe')).status).toBe(404);
  });

  it('JSON mal formado → 400 (no 500)', async () => {
    const res = await api.request('POST', '/api/v1/auth/login', {
      body: '{malo',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });
});
