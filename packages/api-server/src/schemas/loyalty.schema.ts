import { z } from 'zod';
import { moneyAmount } from './common.js';

// El "passToken" es el serial_number que va codificado en el QR del pase.
const passToken = z.string().trim().min(1, 'El token del pase es requerido').max(100);
const notes = z.string().trim().max(500).optional();
// Sucursal donde se registra la operación. Solo un admin puede indicar una distinta a la suya.
const branchId = z.uuid('ID de sucursal inválido').optional();

// Param para leer un pase por su token/código QR
export const getPassParamsSchema = z.object({ passToken });

// Registrar una compra para otorgar sellos
export const addStampsSchema = z.object({
  passToken,
  amountSpent: moneyAmount().positive('El monto gastado debe ser mayor a 0'),
  notes,
  branchId,
});

// Canjear un premio (si no se indica rewardId, se canjea el pendiente más antiguo)
export const redeemRewardSchema = z.object({
  passToken,
  rewardId: z.uuid('ID de recompensa inválido').optional(),
  notes,
  branchId,
});

export type AddStampsInput = z.infer<typeof addStampsSchema>;
export type RedeemRewardInput = z.infer<typeof redeemRewardSchema>;
