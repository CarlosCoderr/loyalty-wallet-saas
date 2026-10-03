import type { FastifyInstance } from 'fastify';
import { authenticateJWT } from '../middlewares/auth.middleware.js';
import { requireAdminRole, requireStaffOrAdminRole } from '../middlewares/role.middleware.js';
import { idParamsSchema } from '../schemas/common.js';
import {
  createCustomerSchema,
  createStaffSchema,
  issuePassSchema,
  queryCustomersSchema,
  updateCustomerSchema,
  updateStaffSchema,
} from '../schemas/staff-customer.schema.js';
import {
  createCustomer,
  createStaffMember,
  getCustomerDetails,
  getCustomersList,
  getStaffList,
  issuePass,
  updateCustomer,
  updateStaffMember,
} from '../services/staff-customer.service.js';

// Los errores (Zod → 400, HttpError → su status) los resuelve el error handler global de app.ts

// --- STAFF (Exclusivo Administradores) — montado en /api/v1/admin ---
export async function staffRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticateJWT);
  app.addHook('onRequest', requireAdminRole);

  app.get('/staff', async (request) => {
    const list = await getStaffList(request.user.tenantId);
    return { status: 'success', data: list };
  });

  app.post('/staff', async (request, reply) => {
    const body = createStaffSchema.parse(request.body);
    const created = await createStaffMember(request.user.tenantId, body);
    return reply.status(201).send({ status: 'success', data: created });
  });

  app.patch('/staff/:id', async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = updateStaffSchema.parse(request.body);
    const updated = await updateStaffMember(request.user.tenantId, request.user.sub, id, body);
    return { status: 'success', data: updated };
  });
}

// --- CUSTOMERS (Cajeros y Administradores) — montado en /api/v1/customers ---
export async function customerRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticateJWT);
  app.addHook('onRequest', requireStaffOrAdminRole);

  app.get('/', async (request) => {
    const query = queryCustomersSchema.parse(request.query);
    const result = await getCustomersList(request.user.tenantId, query);
    return { status: 'success', data: result };
  });

  app.post('/', async (request, reply) => {
    const body = createCustomerSchema.parse(request.body);
    const created = await createCustomer(request.user.tenantId, body);
    return reply.status(201).send({ status: 'success', data: created });
  });

  app.get('/:id', async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const customer = await getCustomerDetails(request.user.tenantId, id);
    return { status: 'success', data: customer };
  });

  // Emitir la tarjeta del cliente en un programa desde la caja
  app.post('/:id/passes', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const { programId } = issuePassSchema.parse(request.body);
    const pass = await issuePass(request.user.tenantId, id, programId);
    return reply.status(201).send({ status: 'success', data: pass });
  });

  // Edición de perfil o datos sensibles del cliente: solo administradores
  app.patch('/:id', { preHandler: [requireAdminRole] }, async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = updateCustomerSchema.parse(request.body);
    const updated = await updateCustomer(request.user.tenantId, id, body);
    return { status: 'success', data: updated };
  });
}
