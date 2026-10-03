import { z } from 'zod';

// El "passToken" es el serial_number que va codificado en el QR del pase.
const passToken = z.string().trim().min(1, 'El token del pase es requerido').max(100);
const notes = z.string().trim().max(500).optional();

// Param para leer un pase por su token/código QR
export const getPassParamsSchema = z.object({ passToken });

// Registrar una compra para otorgar sellos
export const addStampsSchema = z.object({
  passToken,
  amountSpent: z
    .number()
    .positive('El monto gastado debe ser mayor a 0')
    .max(99_999_999.99, 'Monto fuera de rango')
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Máximo 2 decimales'),
  notes,
});

// Canjear un premio (si no se indica rewardId, se canjea el pendiente más antiguo)
export const redeemRewardSchema = z.object({
  passToken,
  rewardId: z.uuid('ID de recompensa inválido').optional(),
  notes,
});

export type AddStampsInput = z.infer<typeof addStampsSchema>;
export type RedeemRewardInput = z.infer<typeof redeemRewardSchema>;
