import { and, asc, eq, gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { branches, loyaltyPrograms, passes, tenants } from '../db/schema.js';
import type {
  CreateBranchInput,
  CreateProgramInput,
  UpdateBranchInput,
  UpdateProgramInput,
  UpdateTenantInput,
} from '../schemas/admin.schema.js';
import { ConflictError, NotFoundError, isUniqueViolation } from '../utils/http-error.js';

const toMoney = (n: number | undefined) => (n === undefined ? undefined : n.toFixed(2));

// Nunca devolver el hash de la API key
const branchColumns = {
  id: true,
  name: true,
  code: true,
  address: true,
  phone: true,
  createdAt: true,
} as const;

async function withBranchCodeCheck<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err, 'branches_tenant_code_uq')) {
      throw new ConflictError('Ya existe una sucursal con ese código');
    }
    throw err;
  }
}

// === BRANCHES ===
export async function getBranches(tenantId: string) {
  return db.query.branches.findMany({
    where: eq(branches.tenantId, tenantId),
    columns: branchColumns,
    orderBy: asc(branches.name),
  });
}

export async function createBranch(tenantId: string, data: CreateBranchInput) {
  return withBranchCodeCheck(async () => {
    const [created] = await db
      .insert(branches)
      .values({ tenantId, ...data })
      .returning({ id: branches.id, name: branches.name, code: branches.code, address: branches.address, phone: branches.phone, createdAt: branches.createdAt });
    return created;
  });
}

export async function updateBranch(tenantId: string, branchId: string, data: UpdateBranchInput) {
  return withBranchCodeCheck(async () => {
    const [updated] = await db
      .update(branches)
      .set(data)
      .where(and(eq(branches.id, branchId), eq(branches.tenantId, tenantId)))
      .returning({ id: branches.id, name: branches.name, code: branches.code, address: branches.address, phone: branches.phone, createdAt: branches.createdAt });
    if (!updated) throw new NotFoundError('Sucursal no encontrada');
    return updated;
  });
}

// === LOYALTY PROGRAMS ===
export async function getPrograms(tenantId: string) {
  return db.query.loyaltyPrograms.findMany({
    where: eq(loyaltyPrograms.tenantId, tenantId),
    orderBy: asc(loyaltyPrograms.createdAt),
  });
}

export async function createProgram(tenantId: string, data: CreateProgramInput) {
  const [created] = await db
    .insert(loyaltyPrograms)
    .values({
      tenantId,
      ...data,
      amountPerStamp: toMoney(data.amountPerStamp),
      minPurchaseAmount: toMoney(data.minPurchaseAmount),
    })
    .returning();
  return created;
}

/**
 * Actualiza el programa y marca sus pases como modificados (passes.updated_at),
 * para que Apple Wallet los descargue de nuevo. Devuelve los ids de pase a notificar.
 */
export async function updateProgram(tenantId: string, programId: string, data: UpdateProgramInput) {
  return db.transaction(async (tx) => {
    // FOR UPDATE: las compras en curso (que toman FOR SHARE) esperan a que termine este cambio
    const [current] = await tx
      .select({ id: loyaltyPrograms.id, totalStamps: loyaltyPrograms.totalStamps })
      .from(loyaltyPrograms)
      .where(and(eq(loyaltyPrograms.id, programId), eq(loyaltyPrograms.tenantId, tenantId)))
      .for('update');
    if (!current) throw new NotFoundError('Programa no encontrado');

    // Bajar el total no puede dejar pases con tantos o más sellos que el nuevo total sin premio
    if (data.totalStamps !== undefined && data.totalStamps < current.totalStamps) {
      const [blocking] = await tx
        .select({ id: passes.id })
        .from(passes)
        .where(
          and(
            eq(passes.programId, programId),
            eq(passes.status, 'active'),
            gte(passes.currentStamps, data.totalStamps),
          ),
        )
        .limit(1);
      if (blocking) {
        throw new ConflictError(
          `No se puede bajar a ${data.totalStamps} sellos: hay pases activos con ${data.totalStamps} o más sellos acumulados`,
        );
      }
    }

    const [updated] = await tx
      .update(loyaltyPrograms)
      .set({
        ...data,
        amountPerStamp: toMoney(data.amountPerStamp),
        minPurchaseAmount: toMoney(data.minPurchaseAmount),
      })
      .where(eq(loyaltyPrograms.id, programId))
      .returning();

    const touched = await tx
      .update(passes)
      .set({ updatedAt: new Date() })
      .where(eq(passes.programId, programId))
      .returning({ id: passes.id });

    return { program: updated, passIdsToNotify: touched.map((p) => p.id) };
  });
}

// === TENANT ===
const tenantColumns = {
  id: true,
  name: true,
  slug: true,
  ownerEmail: true,
  phone: true,
  planTier: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function getTenantProfile(tenantId: string) {
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId), columns: tenantColumns });
  if (!tenant) throw new NotFoundError('Tenant no encontrado');
  return tenant;
}

export async function updateTenantProfile(tenantId: string, data: UpdateTenantInput) {
  const [updated] = await db.update(tenants).set(data).where(eq(tenants.id, tenantId)).returning({
    id: tenants.id,
    name: tenants.name,
    slug: tenants.slug,
    ownerEmail: tenants.ownerEmail,
    phone: tenants.phone,
    planTier: tenants.planTier,
    createdAt: tenants.createdAt,
    updatedAt: tenants.updatedAt,
  });
  if (!updated) throw new NotFoundError('Tenant no encontrado');
  return updated;
}
