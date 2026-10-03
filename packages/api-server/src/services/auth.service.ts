import bcrypt from 'bcrypt';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { staffUsers, tenants } from '../db/schema.js';
import type { LoginInput } from '../schemas/auth.schema.js';
import { ForbiddenError, HttpError, UnauthorizedError } from '../utils/http-error.js';

// Hash real de una contraseña aleatoria: se compara cuando el usuario no existe
// para que el tiempo de respuesta no revele qué emails o tenants son válidos.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomUUID(), 10);

export const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * Suma un intento fallido de forma ATÓMICA (en SQL, no leyendo y escribiendo desde JS):
 * N intentos simultáneos suman N. Si el bloqueo anterior ya venció, el conteo empieza de nuevo.
 */
async function registerFailedAttempt(staffId: string) {
  const expired = sql`(${staffUsers.lockoutUntil} IS NOT NULL AND ${staffUsers.lockoutUntil} <= now())`;
  const nextCount = sql`CASE WHEN ${expired} THEN 1 ELSE ${staffUsers.failedAttempts} + 1 END`;

  await db
    .update(staffUsers)
    .set({
      failedAttempts: nextCount,
      lockoutUntil: sql`CASE WHEN ${nextCount} >= ${MAX_FAILED_ATTEMPTS}
        THEN now() + make_interval(mins => ${LOCKOUT_MINUTES}) ELSE NULL END`,
    })
    .where(eq(staffUsers.id, staffId));
}

export async function authenticateStaff(input: LoginInput) {
  // 1. Tenant por slug
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.slug, input.tenantSlug),
    columns: { id: true, name: true, slug: true },
  });

  // 2. Usuario del staff dentro de ese tenant
  const staff = tenant
    ? await db.query.staffUsers.findFirst({
        where: and(eq(staffUsers.tenantId, tenant.id), eq(staffUsers.email, input.email)),
        with: { branch: { columns: { name: true } } },
      })
    : undefined;

  // 3. Se acepta la contraseña o, para el cajero, su PIN rápido.
  //    Siempre se ejecuta bcrypt (también sin usuario) para que el tiempo no revele nada.
  const passwordOk = await bcrypt.compare(input.password, staff?.passwordHash ?? DUMMY_HASH);
  const pinOk = !passwordOk && staff?.pinHash ? await bcrypt.compare(input.password, staff.pinHash) : false;

  // Mismo mensaje para tenant inexistente o usuario inexistente
  if (!tenant || !staff) throw new UnauthorizedError();

  // 4. Cuenta bloqueada: misma respuesta con clave correcta o incorrecta.
  //    Si respondiera distinto, un atacante podría seguir probando durante el bloqueo y saber cuándo acierta.
  if (staff.lockoutUntil && staff.lockoutUntil > new Date()) {
    throw new HttpError(
      423,
      `Cuenta bloqueada temporalmente por demasiados intentos fallidos. Inténtalo de nuevo en ${LOCKOUT_MINUTES} minutos.`,
    );
  }

  // 5. Clave incorrecta: suma el intento (y bloquea al llegar al máximo)
  if (!passwordOk && !pinOk) {
    await registerFailedAttempt(staff.id);
    throw new UnauthorizedError();
  }

  // 6. Solo se informa tras validar la clave: no revela a terceros que la cuenta existe
  if (!staff.isActive) {
    throw new ForbiddenError('Tu usuario está desactivado. Contacta al administrador.');
  }

  // 7. Login correcto: reinicia el contador
  if (staff.failedAttempts > 0 || staff.lockoutUntil) {
    await db.update(staffUsers).set({ failedAttempts: 0, lockoutUntil: null }).where(eq(staffUsers.id, staff.id));
  }

  return {
    tokenVersion: staff.tokenVersion,
    staff: {
      id: staff.id,
      fullName: staff.fullName,
      email: staff.email,
      role: staff.role,
      branchId: staff.branchId,
      branchName: staff.branch?.name ?? null,
    },
    tenant,
  };
}
