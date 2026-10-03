import { expect, test } from './fixtures.js';

test('manifest instalable: standalone, abre en /scan, íconos 192/512', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/scan');
  expect(manifest.icons).toHaveLength(3);

  const icon = await request.get('/icons/512');
  expect(icon.ok()).toBe(true);
  expect(icon.headers()['content-type']).toBe('image/png');
});

test('el service worker se sirve sin caché y queda registrado', async ({ page, request }) => {
  const sw = await request.get('/sw.js');
  expect(sw.ok()).toBe(true);
  expect(sw.headers()['cache-control']).toContain('no-cache');

  await page.goto('/login');
  await expect
    .poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())))
    .toBe(true);
});
