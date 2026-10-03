import { expect, loginAsCashier, test } from './fixtures.js';

// Sin cámara simulada: el navegador no tiene cámara, la caja usa la entrada manual

test('sin cámara se explica el motivo y se puede escribir el número', async ({ page }) => {
  await loginAsCashier(page);
  await expect(page.getByText(/No hay permiso|No se pudo abrir la cámara/)).toBeVisible();

  await page.fill('#serial', 'no-existe');
  await page.click('text=Buscar tarjeta');
  await expect(page.locator('main [role=alert]')).toContainText('No existe una tarjeta con el número "NO-EXISTE"');
});

test('inscribir un cliente nuevo y no duplicarlo después', async ({ page }) => {
  await loginAsCashier(page);

  await test.step('teléfono nuevo → formulario con el teléfono normalizado', async () => {
    await page.click('text=Nuevo cliente');
    await page.fill('#phone', '55 4444 3333');
    await page.click('text=Continuar');
    await expect(page.getByText('Cliente nuevo con teléfono')).toBeVisible();
    await expect(page.locator('main')).toContainText('5544443333');
  });

  await test.step('crea la tarjeta y muestra el QR para Apple Wallet', async () => {
    await page.fill('#firstName', 'Lucía');
    await page.fill('#lastName', 'Ramírez');
    await page.click('text=Inscribir y crear tarjeta');
    await expect(page.getByText('Tarjeta de Lucía creada')).toBeVisible();
    await expect(page.locator('img[alt*="Apple Wallet"]')).toBeVisible();
    await expect(page.locator('main')).toContainText('Modo de prueba'); // WALLET_PROVIDER=mock
  });

  await test.step('desde la inscripción se abre la tarjeta nueva', async () => {
    await page.click('text=Registrar su primera compra');
    await expect(page.getByText('0 de 10 sellos')).toBeVisible();
    expect(page.url()).toMatch(/\/pass\/[0-9A-F]{20}$/);
  });

  await test.step('el mismo teléfono muestra al cliente existente', async () => {
    await page.click('text=Nuevo cliente');
    await page.fill('#phone', '5544443333');
    await page.click('text=Continuar');
    await expect(page.getByText('Este teléfono ya está registrado')).toBeVisible();
    await expect(page.locator('main')).toContainText('Ya tiene tarjeta en este programa');
  });
});
