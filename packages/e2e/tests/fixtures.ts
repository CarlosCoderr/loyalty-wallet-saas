import { test as base, expect, type Page } from '@playwright/test';

// Datos de seedDemoData (packages/api-server/src/db/demo-data.ts)
export const DEMO = {
  tenantSlug: 'agencia-demo',
  cashierEmail: 'cajero@agenciademo.com',
  cashierPassword: 'demo1234',
  cashierPin: '1234',
  serial: 'DEMO-0001',
};

/** Inicia sesión como el cajero demo (con PIN por defecto) y espera la pantalla de escaneo. */
export async function loginAsCashier(page: Page, password = DEMO.cashierPin) {
  await page.goto('/login');
  await page.fill('#tenantSlug', DEMO.tenantSlug);
  await page.fill('#email', DEMO.cashierEmail);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await page.waitForURL('**/scan');
}

// Errores esperables: respuestas 401/404 de la API que la PWA muestra como mensajes
const EXPECTED_CONSOLE_ERROR = /401|404|Failed to load resource/;

export const test = base.extend<{ consoleErrors: string[] }>({
  // Toda prueba falla si la PWA deja errores de JavaScript en la consola
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' && !EXPECTED_CONSOLE_ERROR.test(m.text())) errors.push(m.text());
      });
      page.on('pageerror', (err) => errors.push(err.message));
      // Acepta los confirm() (p. ej. "¿Entregar premio?")
      page.on('dialog', (d) => d.accept());
      await use(errors);
      expect(errors, 'errores de JavaScript en consola').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
