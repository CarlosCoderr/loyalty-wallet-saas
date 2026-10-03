import { z } from 'zod';

// Monto en dinero: hasta 2 decimales y dentro del rango de numeric(10,2)
export const moneyAmount = () =>
  z
    .number()
    .max(99_999_999.99, 'Monto fuera de rango')
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Máximo 2 decimales');

export const idParamsSchema = z.object({ id: z.uuid('ID inválido') });

// PATCH: al menos un campo presente
export const nonEmptyPatch = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.refine((o) => Object.values(o).some((v) => v !== undefined), 'Envía al menos un campo');
