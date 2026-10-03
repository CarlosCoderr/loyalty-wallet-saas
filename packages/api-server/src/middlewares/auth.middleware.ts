import type { FastifyReply, FastifyRequest } from 'fastify';

// Usar como preHandler en rutas protegidas. Deja el payload en request.user.
export async function authenticateJWT(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ status: 'error', message: 'Token JWT no válido o expirado' });
  }
}
