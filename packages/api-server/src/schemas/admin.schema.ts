import { z } from 'zod';
import { moneyAmount, nonEmptyPatch } from './common.js';

// strictObject: un campo desconocido es 400, no se descarta en silencio.

// --- Sucursales (Branches) ---
export const createBranchSchema = z.strictObject({
  name: z.string().trim().min(2, 'El nombre de la sucursal es requerido').max(255),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,50}$/, 'Código de 2 a 50 caracteres: letras, números, - o _'),
  address: z.string().trim().max(500).nullish(),
  phone: z.string().trim().max(50).nullish(),
});

export const updateBranchSchema = nonEmptyPatch(createBranchSchema.partial());

// --- Programas de Lealtad (Loyalty Programs) ---
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color hex inválido (#RRGGBB)');
const imageUrl = z.url('URL inválida').max(2000).nullish();

const programFields = z.strictObject({
  title: z.string().trim().min(2, 'El nombre del programa es requerido').max(255),
  description: z.string().trim().max(2000).nullish(),
  stampRuleType: z.enum(['per_amount', 'per_visit']),
  amountPerStamp: moneyAmount().positive('El monto por sello debe ser positivo'),
  minPurchaseAmount: moneyAmount().min(0),
  totalStamps: z.number().int().min(1, 'Debe requerir al menos 1 sello').max(100),
  rewardTitle: z.string().trim().min(2, 'El título del premio es requerido').max(255),
  rewardDescription: z.string().trim().max(2000).nullish(),
  status: z.enum(['draft', 'active', 'archived']),
  primaryColor: hexColor,
  backgroundColor: hexColor,
  labelColor: hexColor,
  logoUrl: imageUrl,
  stampIconUrl: imageUrl,
  bannerUrl: imageUrl,
});

export const createProgramSchema = programFields
  .partial({
    description: true,
    amountPerStamp: true,
    minPurchaseAmount: true,
    rewardDescription: true,
    status: true,
    primaryColor: true,
    backgroundColor: true,
    labelColor: true,
    logoUrl: true,
    stampIconUrl: true,
    bannerUrl: true,
  })
  .refine((p) => p.stampRuleType !== 'per_amount' || p.amountPerStamp !== undefined, {
    message: 'amountPerStamp es obligatorio con la regla per_amount',
    path: ['amountPerStamp'],
  });

export const updateProgramSchema = nonEmptyPatch(programFields.partial());

// --- Tenant (el slug no es editable: lo usan los cajeros para iniciar sesión) ---
export const updateTenantSchema = nonEmptyPatch(
  z.strictObject({
    name: z.string().trim().min(2).max(255).optional(),
    ownerEmail: z.email('Email inválido').trim().toLowerCase().optional(),
    phone: z.string().trim().max(50).nullish(),
  }),
);

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type CreateProgramInput = z.infer<typeof createProgramSchema>;
export type UpdateProgramInput = z.infer<typeof updateProgramSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
