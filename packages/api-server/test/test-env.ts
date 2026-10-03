// Configuración común de las pruebas. Se usa desde vitest.config.ts y global-setup.ts.

// BD exclusiva de pruebas: se vacía y recrea constantemente. Nunca apuntar a desarrollo/producción.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://loyalty:loyalty@localhost:5433/loyalty_test';

/** Lanza si la URL no es de una BD de pruebas (nombre terminado en _test). */
export function assertTestDatabase(url: string) {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(
      `Las pruebas solo corren contra una BD cuyo nombre termine en "_test" (actual: "${name}"). ` +
        'Configura TEST_DATABASE_URL.',
    );
  }
}

// Variables que ven los módulos de la app durante las pruebas (se aplican antes de importarlos)
export const testEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_SECRET: 'test-secret-solo-para-pruebas-automaticas-1234567890',
  // Alto para que el límite por IP no interfiera; auth.test.ts crea una app con el valor real (20)
  LOGIN_RATE_LIMIT_MAX: '100000',
  PUBLIC_BASE_URL: 'http://localhost:4000',
  WALLET_PROVIDER: 'mock',
  APPLE_PASS_TYPE_IDENTIFIER: 'pass.com.test.loyalty',
  APPLE_TEAM_ID: 'TEST123456',
  TRUST_PROXY: 'false',
  CORS_ORIGIN: '*',
};
