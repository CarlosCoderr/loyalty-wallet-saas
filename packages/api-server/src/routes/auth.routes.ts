import type { FastifyInstance } from 'fastify';
import { authenticateJWT } from '../middlewares/auth.middleware.js';
import { loginSchema } from '../schemas/auth.schema.js';
import { authenticateStaff } from '../services/auth.service.js';

export async function authRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/login
  app.post('/login', async (request) => {
    // Si el body es inválido, ZodError → 400 en el error handler global
    const body = loginSchema.parse(request.body);
    const { staff, tenant, tokenVersion } = await authenticateStaff(body);

    // El tenantId viaja en el token: toda ruta protegida filtra por él
    const token = app.jwt.sign({
      sub: staff.id,
      tenantId: tenant.id,
      role: staff.role,
      branchId: staff.branchId,
      ver: tokenVersion,
    });

    return { status: 'success', data: { token, user: staff, tenant } };
  });

  // GET /api/v1/auth/me (protegida): devuelve el usuario de la sesión (rol y sucursal actuales)
  app.get('/me', { preHandler: authenticateJWT }, async (request) => {
    return { status: 'success', data: request.user };
  });
}
