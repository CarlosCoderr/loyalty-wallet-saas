// API para las pruebas E2E de la PWA (packages/e2e): Playwright la arranca con `npm run e2e:server`.
// Usa la BD _test, la migra y recrea los datos demo antes de escuchar, así cada corrida empieza igual.
import globalSetup from './global-setup.js';
import { TEST_DATABASE_URL, assertTestDatabase, testEnv } from './test-env.js';

const port = process.env.E2E_API_PORT ?? '4100';

// Antes de importar la app: env.ts lee process.env al cargarse
Object.assign(process.env, testEnv, {
  PORT: port,
  PUBLIC_BASE_URL: `http://localhost:${port}`,
  CORS_ORIGIN: process.env.E2E_PWA_ORIGIN ?? 'http://localhost:3100',
});

assertTestDatabase(TEST_DATABASE_URL);
await globalSetup();

const { seedDemoData } = await import('../src/db/demo-data.js');
await seedDemoData();

await import('../src/server.js');
