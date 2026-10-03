import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { ZodError, z } from 'zod';
import { env } from './env.js';
import { appleWalletRoutes } from './routes/apple-wallet.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { loyaltyRoutes } from './routes/loyalty.routes.js';
import { HttpError } from './utils/http-error.js';

// Construye la app sin escuchar en ningún puerto: así se puede usar en tests con app.inject().
export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: env.NODE_ENV === 'production' ? 'info' : 'debug' },
  });

  // Plugins
  await app.register(cors, { origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',') });
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  // Errores: validación → 400, errores de dominio y de Fastify (JSON inválido, body muy grande…)
  // → su status 4xx, el resto → 500 sin filtrar detalles.
  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        status: 'error',
        message: 'Datos inválidos',
        errors: z.flattenError(error).fieldErrors,
      });
    }
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({ status: 'error', message: error.message });
    }
    const statusCode = (error as { statusCode?: unknown })?.statusCode;
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({ status: 'error', message: (error as Error).message });
    }
    request.log.error(error);
    return reply.status(500).send({ status: 'error', message: 'Error interno del servidor' });
  });

  // Rutas
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(loyaltyRoutes, { prefix: '/api/v1/loyalty' });
  // webServiceURL del pase de Apple: https://<dominio>/api/apple
  await app.register(appleWalletRoutes, { prefix: '/api/apple' });

  return app;
}
