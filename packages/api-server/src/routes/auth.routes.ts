import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { authenticateJWT } from '../middlewares/auth.middleware.js';
import { loginSchema } from '../schemas/auth.schema.js';
import { authenticateStaff } from '../services/auth.service.js';

export async function authRoutes(app: FastifyInstance) {
  // global: false → el límite solo aplica a las rutas que lo piden (no a /me).
  // Es una primera barrera por IP; el bloqueo por cuenta (auth.service) es la protección fina.
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      message: `Demasiados intentos de inicio de sesión desde esta red. Intenta de nuevo en ${Math.max(1, Math.ceil(context.ttl / 60_000))} minutos.`,
    }),
  });

  // POST /api/v1/auth/login
  app.post(
    '/login',
    {
      // Por IP: generoso porque los cajeros de una sucursal suelen compartir IP
      config: { rateLimit: { max: env.LOGIN_RATE_LIMIT_MAX, timeWindow: '15 minutes' } },
    },
    async (request) => {
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
    },
  );

  // GET /api/v1/auth/me (protegida): devuelve el usuario de la sesión (rol y sucursal actuales)
  app.get('/me', { preHandler: authenticateJWT }, async (request) => {
    return { status: 'success', data: request.user };
  });
}
