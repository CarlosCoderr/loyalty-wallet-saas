import '@fastify/jwt';

// Tipado del payload del JWT: request.user queda tipado en todas las rutas protegidas.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      tenantId: string;
      role: 'admin' | 'cashier';
      branchId: string | null;
    };
    user: FastifyJWT['payload'];
  }
}
