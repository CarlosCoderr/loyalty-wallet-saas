import type { FastifyInstance } from 'fastify';
import { authenticateJWT } from '../middlewares/auth.middleware.js';
import { addStampsSchema, getPassParamsSchema, redeemRewardSchema } from '../schemas/loyalty.schema.js';
import {
  getActivePrograms,
  getPassDetails,
  processPurchaseAndStamps,
  redeemReward,
  resolveStaffContext,
} from '../services/loyalty.service.js';
import { notifyPassChanged } from '../services/wallet/index.js';

// Los errores (Zod → 400, HttpError → su status) los resuelve el error handler global de app.ts

export async function loyaltyRoutes(app: FastifyInstance) {
  // Todas las rutas de este módulo requieren el JWT del staff
  app.addHook('onRequest', authenticateJWT);

  // GET /api/v1/loyalty/programs - Programas activos (para inscribir clientes desde la caja)
  app.get('/programs', async (request) => {
    return { status: 'success', data: await getActivePrograms(request.user.tenantId) };
  });

  // GET /api/v1/loyalty/pass/:passToken - Consultar estado del pase
  app.get('/pass/:passToken', async (request) => {
    const { passToken } = getPassParamsSchema.parse(request.params);
    const pass = await getPassDetails(passToken, request.user.tenantId);
    return { status: 'success', data: pass };
  });

  // POST /api/v1/loyalty/stamps - Registrar compra y calcular sellos + carryover
  app.post('/stamps', async (request) => {
    const body = addStampsSchema.parse(request.body);
    const ctx = await resolveStaffContext(request.user, body.branchId);
    const result = await processPurchaseAndStamps(ctx, body);
    // Ya hubo commit: avisar a Wallet sin hacer esperar al cajero
    void notifyPassChanged(result.passId, request.log);
    return { status: 'success', data: result };
  });

  // POST /api/v1/loyalty/redeem - Canjear una recompensa pendiente
  app.post('/redeem', async (request) => {
    const body = redeemRewardSchema.parse(request.body);
    const ctx = await resolveStaffContext(request.user, body.branchId);
    const result = await redeemReward(ctx, body);
    void notifyPassChanged(result.passId, request.log);
    return { status: 'success', data: result };
  });
}
