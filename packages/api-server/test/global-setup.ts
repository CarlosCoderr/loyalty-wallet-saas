import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { TEST_DATABASE_URL, assertTestDatabase } from './test-env.js';

// Se ejecuta una vez antes de todas las pruebas: crea la BD de pruebas si falta y aplica las migraciones.
export default async function globalSetup() {
  assertTestDatabase(TEST_DATABASE_URL);

  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.replace(/^\//, '');

  // Conexión a la BD de mantenimiento del mismo servidor para poder crear la de pruebas
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    const [exists] = await admin`select 1 from pg_database where datname = ${dbName}`;
    if (!exists) await admin.unsafe(`create database "${dbName}"`);
  } finally {
    await admin.end();
  }

  const client = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
    });
  } finally {
    await client.end();
  }
}
