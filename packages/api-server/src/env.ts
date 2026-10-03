import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// El .env vive en la raíz del monorepo (src/ y dist/ están a la misma profundidad).
const ROOT_DIR = fileURLToPath(new URL('../../../', import.meta.url));
dotenv.config({ path: resolve(ROOT_DIR, '.env'), quiet: true });

// Rutas de certificados relativas a la raíz del repo, sin importar desde dónde se ejecute.
const rootPath = z
  .string()
  .min(1)
  .transform((p) => resolve(ROOT_DIR, p))
  .optional();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  // Orígenes permitidos separados por coma, o "*" para cualquiera (solo desarrollo).
  CORS_ORIGIN: z.string().default('*'),

  // Wallet: 'mock' simula los avisos en el log; 'production' usa Apple/Google reales.
  WALLET_PROVIDER: z.enum(['mock', 'production']).default('mock'),
  APPLE_PASS_TYPE_IDENTIFIER: z.string().min(1).optional(),
  APPLE_TEAM_ID: z.string().min(1).optional(),
  APPLE_P12_CERT_PATH: rootPath,
  APPLE_P12_PASSWORD: z.string().optional(),
  GOOGLE_ISSUER_ID: z.string().min(1).optional(),
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH: rootPath,
}).superRefine((e, ctx) => {
  if (e.WALLET_PROVIDER !== 'production') return;
  const required = [
    'APPLE_PASS_TYPE_IDENTIFIER',
    'APPLE_TEAM_ID',
    'APPLE_P12_CERT_PATH',
    'GOOGLE_ISSUER_ID',
    'GOOGLE_SERVICE_ACCOUNT_KEY_PATH',
  ] as const;
  for (const key of required) {
    if (!e[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${key} es obligatoria con WALLET_PROVIDER=production` });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
