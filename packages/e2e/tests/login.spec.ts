import { DEMO, expect, loginAsCashier, test } from './fixtures.js';

test('sin sesión, la app redirige al login', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL('**/login');
});

test('clave incorrecta muestra el error de la API', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#tenantSlug', DEMO.tenantSlug);
  await page.fill('#email', DEMO.cashierEmail);
  await page.fill('#password', 'mala-clave');
  await page.click('button[type=submit]');
  // "main": Next.js también tiene un role=alert (el anunciador de rutas)
  await expect(page.locator('main [role=alert]')).toContainText('Credenciales inválidas');
});

test('la sesión sobrevive a recargar y al salir recuerda negocio y correo', async ({ page }) => {
  await loginAsCashier(page, DEMO.cashierPassword);
  await page.reload();
  await expect(page.locator('header')).toContainText('Agencia Demo');
  expect(page.url()).toContain('/scan');

  await page.click('text=Salir');
  await page.waitForURL('**/login');
  await expect(page.locator('#tenantSlug')).toHaveValue(DEMO.tenantSlug);
  await expect(page.locator('#email')).toHaveValue(DEMO.cashierEmail);
});

test('una sesión inválida (p. ej. cambió la contraseña) vuelve al login con aviso', async ({ page }) => {
  await loginAsCashier(page);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('staff-pwa:session')!);
    s.token = s.token.slice(0, -4) + 'xxxx';
    localStorage.setItem('staff-pwa:session', JSON.stringify(s));
  });
  await page.goto(`/pass/${DEMO.serial}`);
  await page.waitForURL('**/login');
  await expect(page.getByText('Tu sesión terminó')).toBeVisible();
});
