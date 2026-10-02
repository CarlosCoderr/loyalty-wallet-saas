import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Rutas relativas al cwd, calculadas desde este archivo, para que funcione igual
// si drizzle-kit se ejecuta desde la raíz o desde packages/api-server.
// drizzle-kit no admite rutas absolutas en `out` ni "\" de Windows en `schema`.
const root = (p: string) =>
  relative(process.cwd(), fileURLToPath(new URL(p, import.meta.url))).replaceAll('\\', '/');

dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)), quiet: true });

export default defineConfig({
  schema: root('./packages/api-server/src/db/schema.ts'),
  out: root('./packages/api-server/drizzle'),
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
