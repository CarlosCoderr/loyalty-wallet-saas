import { z } from 'zod';
import { nonEmptyPatch } from './common.js';

// strictObject: un campo desconocido es 400, no se descarta en silencio.

// --- STAFF SCHEMAS ---
const staffFields = z.strictObject({
  fullName: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(255),
  email: z.email('Email inválido').trim().toLowerCase().max(255),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(72),
  role: z.enum(['admin', 'cashier']),
  branchId: z.uuid('ID de sucursal inválido').nullable(),
  pin: z.string().regex(/^\d{4,6}$/, 'El PIN debe ser de 4 a 6 dígitos numéricos'),
  isActive: z.boolean(),
});

export const createStaffSchema = staffFields
  .omit({ isActive: true })
  .partial({ role: true, branchId: true, pin: true })
  .transform((s) => ({ ...s, role: s.role ?? ('cashier' as const), branchId: s.branchId ?? null }))
  .refine((s) => s.role !== 'cashier' || s.branchId !== null, {
    message: 'Un cajero debe tener sucursal asignada',
    path: ['branchId'],
  });

export const updateStaffSchema = nonEmptyPatch(staffFields.partial());

// --- CUSTOMER SCHEMAS ---
// Teléfono normalizado (sin espacios, guiones ni paréntesis) para que el UNIQUE por tenant funcione
const phone = z
  .string()
  .transform((p) => p.replace(/[\s\-().]/g, ''))
  .pipe(z.string().regex(/^\+?\d{7,15}$/, 'Teléfono inválido (7 a 15 dígitos, opcional +)'));

const customerFields = z.strictObject({
  firstName: z.string().trim().min(1, 'El nombre es requerido').max(100),
  lastName: z.string().trim().max(100).nullish(),
  phone,
  email: z.email('Email inválido').trim().toLowerCase().max(255).nullish(),
  birthDate: z.iso.date('Fecha inválida (AAAA-MM-DD)').nullish(),
});

export const createCustomerSchema = customerFields;
export const updateCustomerSchema = nonEmptyPatch(customerFields.partial());

export const queryCustomersSchema = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const issuePassSchema = z.strictObject({
  programId: z.uuid('ID de programa inválido'),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type QueryCustomersInput = z.infer<typeof queryCustomersSchema>;
