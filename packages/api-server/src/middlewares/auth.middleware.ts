import { and, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { db } from '../db/index.js';
import { staffUsers } from '../db/schema.js';
import { UnauthorizedError } from '../utils/http-error.js';

// Usar como preHandler/onRequest en rutas protegidas. Deja el usuario en request.user.
export async function authenticateJWT(request: FastifyRequest) {
  try {
    await request.jwtVerify();
  } catch {
    throw new UnauthorizedError('Token JWT no válido o expirado');
  }

  // El token por sí solo no basta: el usuario debe seguir activo y con las mismas credenciales.
  // Rol y sucursal se toman de la BD, así un cambio hecho por el admin aplica de inmediato.
  const staff = await db.query.staffUsers.findFirst({
    where: and(eq(staffUsers.id, request.user.sub), eq(staffUsers.tenantId, request.user.tenantId)),
    columns: { role: true, branchId: true, isActive: true, tokenVersion: true },
  });

  if (!staff || !staff.isActive || staff.tokenVersion !== request.user.ver) {
    throw new UnauthorizedError('Sesión no válida: vuelve a iniciar sesión');
  }

  request.user = { ...request.user, role: staff.role, branchId: staff.branchId };
}
