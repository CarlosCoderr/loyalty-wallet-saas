import { FAKE_CAMERA_VIDEO } from '../playwright.config.js';
import { DEMO, expect, loginAsCashier, test } from './fixtures.js';

// Chrome con cámara simulada: en vez de la cámara real muestra el QR de DEMO-0001
test.use({
  permissions: ['camera'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${FAKE_CAMERA_VIDEO}`,
    ],
  },
});

// Un solo recorrido: cada paso depende de los sellos que dejó el anterior (la tarjeta demo empieza en 3/10)
test('escanear la tarjeta con la cámara, sumar sellos y entregar el premio', async ({ page }) => {
  await test.step('login con PIN muestra negocio y sucursal', async () => {
    await loginAsCashier(page);
    await expect(page.locator('header')).toContainText('Agencia Demo');
    await expect(page.locator('header')).toContainText('Sucursal Centro');
  });

  await test.step('la cámara lee el QR y abre la tarjeta', async () => {
    await page.waitForURL(`**/pass/${DEMO.serial}`, { timeout: 20_000 });
    await expect(page.getByText('3 de 10 sellos')).toBeVisible();
    await expect(page.locator('main')).toContainText('Cliente Prueba');
  });

  await test.step('monto con 3 decimales: error local sin llamar a la API', async () => {
    await page.fill('#amount', '12.345');
    await page.click('text=Registrar compra');
    await expect(page.locator('main')).toContainText('máximo 2 decimales');
    await expect(page.getByText('3 de 10 sellos')).toBeVisible();
  });

  await test.step('compra de $35,30 (coma decimal) suma 4 sellos', async () => {
    await page.fill('#amount', '35,30');
    await page.click('text=Registrar compra');
    await expect(page.getByText('+4 sellos')).toBeVisible();
    await expect(page.getByText('7 de 10 sellos')).toBeVisible();
  });

  await test.step('completar la tarjeta anuncia el premio', async () => {
    await page.fill('#amount', '30');
    await page.click('text=Registrar compra');
    await expect(page.getByText('ganó un premio')).toBeVisible();
    await expect(page.locator('main')).toContainText('Premios por entregar (1)');
  });

  await test.step('entregar el premio', async () => {
    await page.getByRole('button', { name: 'Entregar', exact: true }).click();
    await expect(page.getByText('Premio entregado')).toBeVisible();
    await expect(page.locator('main')).toContainText('Premios por entregar (0)');
  });
});
