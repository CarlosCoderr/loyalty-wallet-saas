import type { FastifyRequest } from 'fastify';
import { ForbiddenError } from '../utils/http-error.js';

// Usar después de authenticateJWT (necesita request.user). Los roles vienen del enum staff_role.
export async function requireAdminRole(request: FastifyRequest) {
  if (request.user?.role !== 'admin') {
    throw new ForbiddenError('Acceso denegado: Se requieren permisos de administrador');
  }
}

// Cajeros y administradores (todo el staff). Explícito para que un rol nuevo no entre por defecto.
export async function requireStaffOrAdminRole(request: FastifyRequest) {
  if (request.user?.role !== 'admin' && request.user?.role !== 'cashier') {
    throw new ForbiddenError('Acceso denegado: Se requiere un usuario del staff');
  }
}
