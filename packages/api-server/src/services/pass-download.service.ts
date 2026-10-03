import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { passes } from '../db/schema.js';
import { env } from '../env.js';
import { HttpError, NotFoundError } from '../utils/http-error.js';
import { loadPassSnapshot, walletService } from './wallet/index.js';

// El enlace de descarga lleva una firma HMAC del serial: el .pkpass contiene el nombre del
// cliente y el authenticationToken, así que conocer el serial (está en el QR) no basta.
// Prefijo de dominio para que esta firma no sirva en ningún otro uso del mismo secreto.
function signSerial(serialNumber: string) {
  return createHmac('sha256', env.JWT_SECRET)
    .update(`apple-pass-download:${serialNumber}`)
    .digest('base64url')
    .slice(0, 32);
}

/** URL pública para instalar la tarjeta en Apple Wallet (se envía al cliente por WhatsApp, email, QR…). */
export function appleDownloadUrl(serialNumber: string) {
  return `${env.PUBLIC_BASE_URL}/api/v1/passes/${encodeURIComponent(serialNumber)}/apple?sig=${signSerial(serialNumber)}`;
}

function validSignature(serialNumber: string, sig: string) {
  const expected = Buffer.from(signSerial(serialNumber));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * GET /api/v1/passes/:serialNumber/apple?sig=...
 * Firma inválida y serial inexistente responden igual (404) para no revelar qué seriales existen.
 */
export async function getApplePassDownload(serialNumber: string, sig: string) {
  if (!validSignature(serialNumber, sig)) throw new NotFoundError('Tarjeta no encontrada');

  const pass = await db.query.passes.findFirst({
    where: eq(passes.serialNumber, serialNumber),
    columns: { id: true },
  });
  if (!pass) throw new NotFoundError('Tarjeta no encontrada');

  const snapshot = await loadPassSnapshot(pass.id);
  if (!snapshot) throw new NotFoundError('Tarjeta no encontrada');

  const { applePassBuffer } = await walletService.generatePassBundle(snapshot);
  if (!applePassBuffer) throw new HttpError(500, 'No se pudo generar la tarjeta de Apple Wallet');

  return { buffer: applePassBuffer, updatedAt: snapshot.updatedAt, serialNumber: snapshot.serialNumber };
}
