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

  // URL pública de esta API (enlaces de descarga y webServiceURL del pase). Sin "/" final.
  PUBLIC_BASE_URL: z
    .url('PUBLIC_BASE_URL inválida')
    .transform((u) => u.replace(/\/+$/, ''))
    .optional(),

  // Wallet: 'mock' simula pases y avisos; 'production' firma pases reales de Apple.
  WALLET_PROVIDER: z.enum(['mock', 'production']).default('mock'),
  APPLE_PASS_TYPE_IDENTIFIER: z.string().min(1).optional(),
  APPLE_TEAM_ID: z.string().min(1).optional(),
  // Certificados PEM: WWDR de Apple + certificado y llave del Pass Type ID
  APPLE_WWDR_CERT_PATH: rootPath,
  APPLE_SIGNER_CERT_PATH: rootPath,
  APPLE_SIGNER_KEY_PATH: rootPath,
  APPLE_SIGNER_KEY_PASSPHRASE: z.string().optional(),
  GOOGLE_ISSUER_ID: z.string().min(1).optional(),
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH: rootPath,
}).superRefine((e, ctx) => {
  // Apple solo acepta webServiceURL https (http únicamente con "Allow HTTP Services" en un iPhone
  // de desarrollo) y los enlaces de descarga llevan datos del cliente: https en producción siempre
  if (e.NODE_ENV === 'production' && e.PUBLIC_BASE_URL && !e.PUBLIC_BASE_URL.startsWith('https://')) {
    ctx.addIssue({ code: 'custom', path: ['PUBLIC_BASE_URL'], message: 'PUBLIC_BASE_URL debe ser https en producción' });
  }

  if (e.WALLET_PROVIDER !== 'production') return;
  const required = [
    'PUBLIC_BASE_URL',
    'APPLE_PASS_TYPE_IDENTIFIER',
    'APPLE_TEAM_ID',
    'APPLE_WWDR_CERT_PATH',
    'APPLE_SIGNER_CERT_PATH',
    'APPLE_SIGNER_KEY_PATH',
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

export const env = {
  ...parsed.data,
  PUBLIC_BASE_URL: parsed.data.PUBLIC_BASE_URL ?? `http://localhost:${parsed.data.PORT}`,
};
