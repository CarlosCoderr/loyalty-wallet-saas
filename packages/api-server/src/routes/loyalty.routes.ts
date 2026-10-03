import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticateJWT } from '../middlewares/auth.middleware.js';
import { addStampsSchema, getPassParamsSchema, redeemRewardSchema } from '../schemas/loyalty.schema.js';
import {
  getPassDetails,
  processPurchaseAndStamps,
  redeemReward,
  type StaffContext,
} from '../services/loyalty.service.js';
import { notifyPassChanged } from '../services/wallet/index.js';

// Los errores (Zod → 400, HttpError → su status) los resuelve el error handler global de app.ts
const staffContext = (request: FastifyRequest): StaffContext => ({
  tenantId: request.user.tenantId,
  staffId: request.user.sub,
  branchId: request.user.branchId,
});

export async function loyaltyRoutes(app: FastifyInstance) {
  // Todas las rutas de este módulo requieren el JWT del staff
  app.addHook('onRequest', authenticateJWT);

  // GET /api/v1/loyalty/pass/:passToken - Consultar estado del pase
  app.get('/pass/:passToken', async (request) => {
    const { passToken } = getPassParamsSchema.parse(request.params);
    const pass = await getPassDetails(passToken, request.user.tenantId);
    return { status: 'success', data: pass };
  });

  // POST /api/v1/loyalty/stamps - Registrar compra y calcular sellos + carryover
  app.post('/stamps', async (request) => {
    const body = addStampsSchema.parse(request.body);
    const result = await processPurchaseAndStamps(staffContext(request), body);
    // Ya hubo commit: avisar a Wallet sin hacer esperar al cajero
    void notifyPassChanged(result.passId, request.log);
    return { status: 'success', data: result };
  });

  // POST /api/v1/loyalty/redeem - Canjear una recompensa pendiente
  app.post('/redeem', async (request) => {
    const body = redeemRewardSchema.parse(request.body);
    const result = await redeemReward(staffContext(request), body);
    void notifyPassChanged(result.passId, request.log);
    return { status: 'success', data: result };
  });
}
