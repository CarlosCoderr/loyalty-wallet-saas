import { createHash, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, inArray, notExists, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { appleDevices, appleRegistrations, passes } from '../db/schema.js';
import { env } from '../env.js';
import { HttpError, NotFoundError, UnauthorizedError } from '../utils/http-error.js';
import { loadPassSnapshot, walletService } from './wallet/index.js';

// Implementa el PassKit Web Service de Apple:
// https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes

/** El passTypeIdentifier de la URL debe ser el nuestro (si está configurado). */
export function assertPassType(passTypeIdentifier: string) {
  const expected = env.APPLE_PASS_TYPE_IDENTIFIER;
  if (expected && passTypeIdentifier !== expected) {
    throw new NotFoundError('Tipo de pase desconocido');
  }
}

// Comparación en tiempo constante: el tiempo de respuesta no revela cuánto del token coincide.
function safeEqual(a: string, b: string) {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Valida "Authorization: ApplePass <authenticationToken>" contra el pase.
 * Serial inexistente y token incorrecto dan el mismo 401 para no revelar qué seriales existen.
 */
export async function authenticateApplePass(serialNumber: string, authHeader: string | undefined) {
  const token = authHeader?.startsWith('ApplePass ') ? authHeader.slice('ApplePass '.length).trim() : '';

  const pass = await db.query.passes.findFirst({
    where: eq(passes.serialNumber, serialNumber),
    columns: { id: true, tenantId: true, authenticationToken: true, updatedAt: true },
  });

  // Se compara siempre (incluso sin pase) para que ambos casos tarden lo mismo
  const valid = safeEqual(token, pass?.authenticationToken ?? '\0') && token.length > 0;
  if (!pass || !valid) throw new UnauthorizedError('No autorizado');
  return pass;
}

/**
 * POST /v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber
 * 201 si el registro es nuevo, 200 si ya existía (el push token se actualiza siempre).
 */
export async function registerDeviceForPass(
  deviceLibraryIdentifier: string,
  serialNumber: string,
  pushToken: string,
  authHeader: string | undefined,
): Promise<200 | 201> {
  const pass = await authenticateApplePass(serialNumber, authHeader);

  return db.transaction(async (tx) => {
    const [device] = await tx
      .insert(appleDevices)
      .values({ tenantId: pass.tenantId, deviceLibraryIdentifier, pushToken })
      .onConflictDoUpdate({
        target: [appleDevices.tenantId, appleDevices.deviceLibraryIdentifier],
        set: { pushToken, updatedAt: new Date() },
      })
      .returning({ id: appleDevices.id });

    const inserted = await tx
      .insert(appleRegistrations)
      .values({ tenantId: pass.tenantId, deviceId: device.id, passId: pass.id })
      .onConflictDoNothing()
      .returning({ passId: appleRegistrations.passId });

    return inserted.length > 0 ? 201 : 200;
  });
}

/**
 * GET /v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier?passesUpdatedSince=tag
 * Sin autenticación (así lo define Apple). null → 204.
 * El tag son los microsegundos epoch de updated_at: entero exacto, sin pérdida de precisión.
 */
export async function getUpdatablePassSerials(deviceLibraryIdentifier: string, passesUpdatedSince?: string) {
  // Un mismo iPhone puede tener pases de varios tenants: hay una fila de dispositivo por tenant
  const registered = db
    .select({ passId: appleRegistrations.passId })
    .from(appleRegistrations)
    .innerJoin(appleDevices, eq(appleDevices.id, appleRegistrations.deviceId))
    .where(eq(appleDevices.deviceLibraryIdentifier, deviceLibraryIdentifier));

  const updatedAtMicros = sql<string>`(extract(epoch from ${passes.updatedAt}) * 1000000)::bigint`;

  const rows = await db
    .select({ serialNumber: passes.serialNumber, updatedAtMicros: sql<string>`${updatedAtMicros}::text` })
    .from(passes)
    .where(
      and(
        inArray(passes.id, registered),
        passesUpdatedSince ? gt(updatedAtMicros, sql`${passesUpdatedSince}::bigint`) : undefined,
      ),
    );
  if (rows.length === 0) return null;

  const lastUpdated = rows.reduce((acc, r) => (BigInt(r.updatedAtMicros) > BigInt(acc) ? r.updatedAtMicros : acc), '0');
  return { lastUpdated, serialNumbers: rows.map((r) => r.serialNumber) };
}

/**
 * GET /v1/passes/:passTypeIdentifier/:serialNumber
 * Devuelve el .pkpass actual, o notModified si el iPhone ya tiene esta versión.
 */
export async function getLatestPassFile(
  serialNumber: string,
  authHeader: string | undefined,
  ifModifiedSince: string | undefined,
) {
  const pass = await authenticateApplePass(serialNumber, authHeader);

  // Last-Modified tiene precisión de segundos
  const updatedAtSeconds = Math.floor(pass.updatedAt.getTime() / 1000);
  const since = ifModifiedSince ? Date.parse(ifModifiedSince) : NaN;
  if (!Number.isNaN(since) && updatedAtSeconds <= Math.floor(since / 1000)) {
    return { notModified: true as const, updatedAt: pass.updatedAt };
  }

  const snapshot = await loadPassSnapshot(pass.id);
  if (!snapshot) throw new NotFoundError('Pase no encontrado');

  const { applePassBuffer } = await walletService.generatePassBundle(snapshot);
  if (!applePassBuffer) throw new HttpError(500, 'No se pudo generar el pase de Apple');

  return { notModified: false as const, buffer: applePassBuffer, updatedAt: pass.updatedAt };
}

/**
 * DELETE /v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber
 * Borra el registro y, si el dispositivo ya no tiene pases de ese tenant, también el dispositivo.
 */
export async function unregisterDeviceForPass(
  deviceLibraryIdentifier: string,
  serialNumber: string,
  authHeader: string | undefined,
) {
  const pass = await authenticateApplePass(serialNumber, authHeader);

  await db.transaction(async (tx) => {
    const device = await tx.query.appleDevices.findFirst({
      where: and(
        eq(appleDevices.tenantId, pass.tenantId),
        eq(appleDevices.deviceLibraryIdentifier, deviceLibraryIdentifier),
      ),
      columns: { id: true },
    });
    if (!device) return;

    await tx
      .delete(appleRegistrations)
      .where(and(eq(appleRegistrations.deviceId, device.id), eq(appleRegistrations.passId, pass.id)));

    await tx
      .delete(appleDevices)
      .where(
        and(
          eq(appleDevices.id, device.id),
          notExists(
            tx.select().from(appleRegistrations).where(eq(appleRegistrations.deviceId, device.id)),
          ),
        ),
      );
  });
}
