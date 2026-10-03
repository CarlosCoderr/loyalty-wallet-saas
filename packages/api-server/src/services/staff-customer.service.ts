import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { branches, customers, loyaltyPrograms, passes, staffUsers } from '../db/schema.js';
import type {
  CreateCustomerInput,
  CreateStaffInput,
  QueryCustomersInput,
  UpdateCustomerInput,
  UpdateStaffInput,
} from '../schemas/staff-customer.schema.js';
import { ConflictError, HttpError, NotFoundError, isUniqueViolation } from '../utils/http-error.js';
import { loadPassSnapshot, walletService } from './wallet/index.js';

const SALT_ROUNDS = 10;

// Columnas públicas: nunca hashes ni token_version
const staffColumns = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  branchId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Nunca exponer authentication_token (secreto de Apple Wallet)
const passColumns = {
  id: true,
  programId: true,
  serialNumber: true,
  status: true,
  currentStamps: true,
  carryoverAmount: true,
  rewardsRedeemed: true,
  createdAt: true,
} as const;

async function assertBranchInTenant(tenantId: string, branchId: string) {
  const branch = await db.query.branches.findFirst({
    where: and(eq(branches.id, branchId), eq(branches.tenantId, tenantId)),
    columns: { id: true },
  });
  if (!branch) throw new NotFoundError('La sucursal especificada no existe');
}

function rethrowUnique(err: unknown, constraint: string, message: string): never {
  if (isUniqueViolation(err, constraint)) throw new ConflictError(message);
  throw err;
}

// === GESTIÓN DE STAFF ===

export async function getStaffList(tenantId: string) {
  return db.query.staffUsers.findMany({
    where: eq(staffUsers.tenantId, tenantId),
    columns: staffColumns,
    with: { branch: { columns: { id: true, name: true, code: true } } },
    orderBy: asc(staffUsers.fullName),
  });
}

export async function createStaffMember(tenantId: string, data: CreateStaffInput) {
  if (data.branchId) await assertBranchInTenant(tenantId, data.branchId);

  const [passwordHash, pinHash] = await Promise.all([
    bcrypt.hash(data.password, SALT_ROUNDS),
    data.pin ? bcrypt.hash(data.pin, SALT_ROUNDS) : null,
  ]);

  try {
    const [created] = await db
      .insert(staffUsers)
      .values({
        tenantId,
        fullName: data.fullName,
        email: data.email,
        passwordHash,
        pinHash,
        role: data.role,
        branchId: data.branchId,
      })
      .returning({ id: staffUsers.id });
    return getStaffMember(tenantId, created.id);
  } catch (err) {
    rethrowUnique(err, 'staff_users_tenant_email_uq', 'El correo electrónico ya está registrado');
  }
}

async function getStaffMember(tenantId: string, staffId: string) {
  const staff = await db.query.staffUsers.findFirst({
    where: and(eq(staffUsers.id, staffId), eq(staffUsers.tenantId, tenantId)),
    columns: staffColumns,
    with: { branch: { columns: { id: true, name: true, code: true } } },
  });
  if (!staff) throw new NotFoundError('Miembro de staff no encontrado');
  return staff;
}

export async function updateStaffMember(
  tenantId: string,
  actorId: string,
  staffId: string,
  data: UpdateStaffInput,
) {
  if (data.branchId) await assertBranchInTenant(tenantId, data.branchId);

  const [passwordHash, pinHash] = await Promise.all([
    data.password ? bcrypt.hash(data.password, SALT_ROUNDS) : undefined,
    data.pin ? bcrypt.hash(data.pin, SALT_ROUNDS) : undefined,
  ]);

  try {
    await db.transaction(async (tx) => {
      // Si el cambio puede quitar un admin, se bloquean primero TODOS los admins activos del tenant,
      // siempre en el mismo orden: dos admins degradándose mutuamente a la vez no se bloquean entre sí
      // (deadlock) y el segundo ve el resultado del primero.
      const activeAdmins =
        data.role !== undefined || data.isActive !== undefined
          ? await tx
              .select({ id: staffUsers.id })
              .from(staffUsers)
              .where(
                and(eq(staffUsers.tenantId, tenantId), eq(staffUsers.role, 'admin'), eq(staffUsers.isActive, true)),
              )
              .orderBy(asc(staffUsers.id))
              .for('update')
          : [];

      const [current] = await tx
        .select({ role: staffUsers.role, branchId: staffUsers.branchId, isActive: staffUsers.isActive })
        .from(staffUsers)
        .where(and(eq(staffUsers.id, staffId), eq(staffUsers.tenantId, tenantId)))
        .for('update');
      if (!current) throw new NotFoundError('Miembro de staff no encontrado');

      const nextRole = data.role ?? current.role;
      const nextBranch = data.branchId !== undefined ? data.branchId : current.branchId;
      const nextActive = data.isActive ?? current.isActive;
      const losesAdmin = current.role === 'admin' && current.isActive && (nextRole !== 'admin' || !nextActive);

      if (staffId === actorId && losesAdmin) {
        throw new ConflictError('No puedes quitarte el rol de administrador ni desactivarte a ti mismo');
      }
      if (nextRole === 'cashier' && !nextBranch) {
        throw new HttpError(400, 'Un cajero debe tener sucursal asignada');
      }
      if (losesAdmin && !activeAdmins.some((a) => a.id !== staffId)) {
        throw new ConflictError('No se puede dejar al negocio sin ningún administrador activo');
      }

      await tx
        .update(staffUsers)
        .set({
          fullName: data.fullName,
          email: data.email,
          role: data.role,
          branchId: data.branchId,
          isActive: data.isActive,
          passwordHash,
          pinHash,
          // Cambiar contraseña o PIN cierra todas las sesiones abiertas de ese usuario
          ...(passwordHash || pinHash ? { tokenVersion: sql`${staffUsers.tokenVersion} + 1` } : {}),
        })
        .where(eq(staffUsers.id, staffId));
    });
  } catch (err) {
    rethrowUnique(err, 'staff_users_tenant_email_uq', 'El correo electrónico ya está en uso');
  }

  return getStaffMember(tenantId, staffId);
}

// === GESTIÓN DE CLIENTES ===

// Escapa los comodines de LIKE para que "%" o "_" se busquen literalmente
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function getCustomersList(tenantId: string, query: QueryCustomersInput) {
  const pattern = query.search ? `%${escapeLike(query.search)}%` : undefined;
  const where = and(
    eq(customers.tenantId, tenantId),
    pattern
      ? or(
          ilike(customers.firstName, pattern),
          ilike(customers.lastName, pattern),
          ilike(customers.email, pattern),
          ilike(customers.phone, pattern),
        )
      : undefined,
  );

  const [[{ total }], items] = await Promise.all([
    db.select({ total: count() }).from(customers).where(where),
    db.query.customers.findMany({
      where,
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
      // Orden estable: la paginación no repite ni salta registros
      orderBy: [desc(customers.createdAt), asc(customers.id)],
      with: { passes: { columns: { id: true, serialNumber: true, currentStamps: true, status: true } } },
    }),
  ]);

  return { items, total, page: query.page, limit: query.limit };
}

export async function getCustomerDetails(tenantId: string, customerId: string) {
  const customer = await db.query.customers.findFirst({
    where: and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)),
    with: {
      passes: {
        columns: passColumns,
        with: { program: { columns: { id: true, title: true, totalStamps: true, rewardTitle: true } } },
      },
    },
  });
  if (!customer) throw new NotFoundError('Cliente no encontrado');
  return customer;
}

export async function createCustomer(tenantId: string, data: CreateCustomerInput) {
  try {
    const [created] = await db
      .insert(customers)
      .values({ tenantId, ...data })
      .returning();
    return created;
  } catch (err) {
    rethrowUnique(err, 'customers_tenant_phone_uq', 'Ya existe un cliente con ese teléfono');
  }
}

export async function updateCustomer(tenantId: string, customerId: string, data: UpdateCustomerInput) {
  try {
    const [updated] = await db
      .update(customers)
      .set(data)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
      .returning();
    if (!updated) throw new NotFoundError('Cliente no encontrado');
    return updated;
  } catch (err) {
    rethrowUnique(err, 'customers_tenant_phone_uq', 'Ya existe un cliente con ese teléfono');
  }
}

/**
 * Emite la tarjeta de un cliente en un programa activo.
 * serial_number va en el QR; authentication_token es el secreto de Apple Wallet (no se devuelve).
 */
export async function issuePass(tenantId: string, customerId: string, programId: string) {
  const [customer, program] = await Promise.all([
    db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)),
      columns: { id: true },
    }),
    db.query.loyaltyPrograms.findFirst({
      where: and(eq(loyaltyPrograms.id, programId), eq(loyaltyPrograms.tenantId, tenantId)),
      columns: { id: true, status: true, title: true },
    }),
  ]);
  if (!customer) throw new NotFoundError('Cliente no encontrado');
  if (!program) throw new NotFoundError('Programa no encontrado');
  if (program.status !== 'active') throw new ConflictError('Solo se pueden emitir tarjetas de programas activos');

  let created;
  try {
    [created] = await db
      .insert(passes)
      .values({
        tenantId,
        programId,
        customerId,
        serialNumber: randomBytes(10).toString('hex').toUpperCase(),
        authenticationToken: randomBytes(32).toString('hex'),
      })
      .returning({ id: passes.id });
  } catch (err) {
    rethrowUnique(err, 'passes_program_customer_uq', 'El cliente ya tiene una tarjeta en este programa');
  }

  const pass = await db.query.passes.findFirst({ where: eq(passes.id, created.id), columns: passColumns });
  const snapshot = await loadPassSnapshot(created.id);
  const bundle = snapshot ? await walletService.generatePassBundle(snapshot) : {};

  return {
    ...pass!,
    program: { id: program.id, title: program.title },
    wallet: {
      provider: walletService.provider,
      googleSaveUrl: bundle.googleSaveUrl ?? null,
    },
  };
}
