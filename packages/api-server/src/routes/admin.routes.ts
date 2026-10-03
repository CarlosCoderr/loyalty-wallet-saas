import type { FastifyInstance } from 'fastify';
import { authenticateJWT } from '../middlewares/auth.middleware.js';
import { requireAdminRole } from '../middlewares/role.middleware.js';
import {
  createBranchSchema,
  createProgramSchema,
  updateBranchSchema,
  updateProgramSchema,
  updateTenantSchema,
} from '../schemas/admin.schema.js';
import { idParamsSchema } from '../schemas/common.js';
import {
  createBranch,
  createProgram,
  getBranches,
  getPrograms,
  getTenantProfile,
  updateBranch,
  updateProgram,
  updateTenantProfile,
} from '../services/admin.service.js';
import { notifyPassesChanged } from '../services/wallet/index.js';

// Los errores (Zod → 400, HttpError → su status) los resuelve el error handler global de app.ts
export async function adminRoutes(app: FastifyInstance) {
  // Exigir token JWT y Rol de Administrador para todo este conjunto de rutas
  app.addHook('onRequest', authenticateJWT);
  app.addHook('onRequest', requireAdminRole);

  // --- TENANT ---
  app.get('/tenant', async (request) => {
    const tenant = await getTenantProfile(request.user.tenantId);
    return { status: 'success', data: tenant };
  });

  app.patch('/tenant', async (request) => {
    const body = updateTenantSchema.parse(request.body);
    const updated = await updateTenantProfile(request.user.tenantId, body);
    return { status: 'success', data: updated };
  });

  // --- BRANCHES ---
  app.get('/branches', async (request) => {
    const list = await getBranches(request.user.tenantId);
    return { status: 'success', data: list };
  });

  app.post('/branches', async (request, reply) => {
    const body = createBranchSchema.parse(request.body);
    const created = await createBranch(request.user.tenantId, body);
    return reply.status(201).send({ status: 'success', data: created });
  });

  app.patch('/branches/:id', async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = updateBranchSchema.parse(request.body);
    const updated = await updateBranch(request.user.tenantId, id, body);
    return { status: 'success', data: updated };
  });

  // --- LOYALTY PROGRAMS ---
  app.get('/programs', async (request) => {
    const list = await getPrograms(request.user.tenantId);
    return { status: 'success', data: list };
  });

  app.post('/programs', async (request, reply) => {
    const body = createProgramSchema.parse(request.body);
    const created = await createProgram(request.user.tenantId, body);
    return reply.status(201).send({ status: 'success', data: created });
  });

  app.patch('/programs/:id', async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = updateProgramSchema.parse(request.body);
    const { program, passIdsToNotify } = await updateProgram(request.user.tenantId, id, body);
    // Colores, títulos o reglas cambiaron: las tarjetas de los clientes deben actualizarse
    void notifyPassesChanged(passIdsToNotify, request.log);
    return { status: 'success', data: { ...program, passesUpdated: passIdsToNotify.length } };
  });
}
