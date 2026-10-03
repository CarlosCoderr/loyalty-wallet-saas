import { z } from 'zod';

export const loginSchema = z.object({
  tenantSlug: z.string().trim().min(1, 'El slug del tenant es requerido'),
  email: z.email('Email inválido').trim().toLowerCase(),
  password: z.string().min(4, 'La contraseña o PIN debe tener al menos 4 caracteres'),
});

export type LoginInput = z.infer<typeof loginSchema>;
