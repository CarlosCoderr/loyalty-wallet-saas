import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Puertos propios: no chocan con los de desarrollo (API :4000, PWA :3001)
export const API_PORT = 4100;
export const PWA_PORT = 3100;
export const API_URL = `http://localhost:${API_PORT}`;
export const PWA_URL = `http://localhost:${PWA_PORT}`;

// Video Y4M que Chrome usa como cámara: muestra el QR de la tarjeta demo (lo genera global-setup.ts)
export const FAKE_CAMERA_VIDEO = fileURLToPath(new URL('./.cache/qr-DEMO-0001.y4m', import.meta.url));

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  // Todas las pruebas comparten la BD _test y el estado de DEMO-0001: una a la vez
  fullyParallel: false,
  workers: 1,
  // Sin reintentos: un reintento vería la tarjeta demo ya modificada
  retries: 0,
  forbidOnly: isCI,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: PWA_URL,
    browserName: 'chromium',
    // Teléfono de caja
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'es-MX',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Siempre servidores nuevos: la API recrea los datos demo al arrancar
  webServer: [
    {
      command: 'npm run e2e:server --workspace=packages/api-server',
      cwd: ROOT,
      url: `${API_URL}/health`,
      env: { E2E_API_PORT: String(API_PORT), E2E_PWA_ORIGIN: PWA_URL },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      // Build de producción (el service worker solo se registra ahí) en su propia carpeta
      command: `npx next build && npx next start --port ${PWA_PORT}`,
      cwd: fileURLToPath(new URL('../staff-pwa/', import.meta.url)),
      url: `${PWA_URL}/login`,
      env: { NEXT_PUBLIC_API_URL: API_URL, NEXT_DIST_DIR: '.next-e2e', NEXT_TELEMETRY_DISABLED: '1' },
      reuseExistingServer: false,
      timeout: 300_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
