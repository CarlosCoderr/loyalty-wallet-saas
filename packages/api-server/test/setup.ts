import { afterAll } from 'vitest';
import { db } from '../src/db/index.js';
import { assertTestDatabase } from './test-env.js';

// Doble seguro por cada archivo de pruebas: jamás resetear datos fuera de la BD _test
assertTestDatabase(process.env.DATABASE_URL ?? '');

// Cada archivo corre en su propio contexto: cerrar su pool de conexiones al terminar
afterAll(async () => {
  await db.$client.end({ timeout: 5 });
});
