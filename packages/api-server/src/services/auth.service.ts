import bcrypt from 'bcrypt';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { staffUsers, tenants } from '../db/schema.js';
import type { LoginInput } from '../schemas/auth.schema.js';
import { UnauthorizedError } from '../utils/http-error.js';

// Hash real de una contraseña aleatoria: se compara cuando el usuario no existe
// para que el tiempo de respuesta no revele qué emails o tenants son válidos.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomUUID(), 10);

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

  // 3. Se acepta la contraseña o, para el cajero, su PIN rápido
  const passwordOk = await bcrypt.compare(input.password, staff?.passwordHash ?? DUMMY_HASH);
  const pinOk = !passwordOk && staff?.pinHash ? await bcrypt.compare(input.password, staff.pinHash) : false;

  // Mismo mensaje para tenant inexistente, usuario inexistente o clave incorrecta
  if (!tenant || !staff || !(passwordOk || pinOk)) {
    throw new UnauthorizedError();
  }

  return {
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
