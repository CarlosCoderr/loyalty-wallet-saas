import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Fuente de verdad del diseño: .spec/database-schema.dbml
// Regla multi-tenant: toda tabla lleva tenant_id y se borra en cascada con su tenant.

// ==========================================
// ENUMS
// ==========================================

export const planTierEnum = pgEnum('plan_tier', ['basic', 'pro', 'enterprise']);
export const staffRoleEnum = pgEnum('staff_role', ['admin', 'cashier']);
export const stampRuleTypeEnum = pgEnum('stamp_rule_type', ['per_amount', 'per_visit']);
export const passStatusEnum = pgEnum('pass_status', ['active', 'suspended']);
export const transactionTypeEnum = pgEnum('transaction_type', ['add_stamp', 'redeem_reward']);
export const rewardStatusEnum = pgEnum('reward_status', ['pending', 'redeemed']);
// draft: aún no emite pases | active: opera normal | archived: no suma sellos nuevos (sí canjes)
export const programStatusEnum = pgEnum('program_status', ['draft', 'active', 'archived']);

// ==========================================
// HELPERS
// ==========================================

const id = () => uuid('id').primaryKey().defaultRandom();
const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());
const money = (name: string) => numeric(name, { precision: 10, scale: 2 });

// ==========================================
// TABLAS
// ==========================================

export const tenants = pgTable('tenants', {
  id: id(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  ownerEmail: varchar('owner_email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  planTier: planTierEnum('plan_tier').default('basic').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const branches = pgTable(
  'branches',
  {
    id: id(),
    tenantId: tenantId(),
    name: varchar('name', { length: 255 }).notNull(),
    // Código corto para reportes y la PWA (ej. CENTRO). Obligatorio en la API; nullable por filas antiguas.
    code: varchar('code', { length: 50 }),
    address: text('address'),
    phone: varchar('phone', { length: 50 }),
    // Solo se guarda el hash; la API key en claro se muestra una única vez al crearla.
    apiKeyHash: varchar('api_key_hash', { length: 255 }).unique(),
    createdAt: createdAt(),
  },
  (t) => [
    index('branches_tenant_idx').on(t.tenantId),
    unique('branches_tenant_code_uq').on(t.tenantId, t.code),
  ],
);

export const staffUsers = pgTable(
  'staff_users',
  {
    id: id(),
    tenantId: tenantId(),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    fullName: varchar('full_name', { length: 255 }),
    // PIN rápido de 4 dígitos para cajero, hasheado con bcrypt.
    pinHash: varchar('pin_hash', { length: 255 }),
    role: staffRoleEnum('role').default('cashier').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    // Va dentro del JWT: al cambiar contraseña/PIN se incrementa y los tokens anteriores dejan de valer.
    tokenVersion: integer('token_version').default(0).notNull(),
    // Bloqueo por intentos fallidos de login (protege el PIN de 4 dígitos contra fuerza bruta)
    failedAttempts: integer('failed_attempts').default(0).notNull(),
    lockoutUntil: timestamp('lockout_until', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('staff_users_tenant_email_uq').on(t.tenantId, t.email),
    index('staff_users_branch_idx').on(t.branchId),
  ],
);

export const loyaltyPrograms = pgTable(
  'loyalty_programs',
  {
    id: id(),
    tenantId: tenantId(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),

    // Reglas de fidelización
    stampRuleType: stampRuleTypeEnum('stamp_rule_type').default('per_amount').notNull(),
    amountPerStamp: money('amount_per_stamp').default('10.00').notNull(), // Ej: $10 = 1 sello
    minPurchaseAmount: money('min_purchase_amount').default('0.00').notNull(), // Umbral mínimo
    totalStamps: integer('total_stamps').default(10).notNull(),
    rewardTitle: varchar('reward_title', { length: 255 }).notNull(),
    rewardDescription: text('reward_description'),
    status: programStatusEnum('status').default('active').notNull(),

    // Personalización estética
    primaryColor: varchar('primary_color', { length: 20 }).default('#000000').notNull(),
    backgroundColor: varchar('background_color', { length: 20 }).default('#FFFFFF').notNull(),
    labelColor: varchar('label_color', { length: 20 }).default('#000000').notNull(),
    logoUrl: text('logo_url'),
    stampIconUrl: text('stamp_icon_url'),
    bannerUrl: text('banner_url'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('loyalty_programs_tenant_idx').on(t.tenantId),
    check('loyalty_programs_total_stamps_chk', sql`${t.totalStamps} > 0`),
    check('loyalty_programs_amount_per_stamp_chk', sql`${t.amountPerStamp} > 0`),
    check('loyalty_programs_min_purchase_chk', sql`${t.minPurchaseAmount} >= 0`),
  ],
);

export const customers = pgTable(
  'customers',
  {
    id: id(),
    tenantId: tenantId(),
    phone: varchar('phone', { length: 50 }).notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }),
    email: varchar('email', { length: 255 }),
    birthDate: date('birth_date'),
    createdAt: createdAt(),
  },
  (t) => [unique('customers_tenant_phone_uq').on(t.tenantId, t.phone)],
);

export const passes = pgTable(
  'passes',
  {
    id: id(),
    tenantId: tenantId(),
    programId: uuid('program_id')
      .notNull()
      .references(() => loyaltyPrograms.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    serialNumber: varchar('serial_number', { length: 100 }).notNull().unique(), // QR escaneable
    // Token que Apple envía en "Authorization: ApplePass <token>" al web service del pase.
    authenticationToken: varchar('authentication_token', { length: 64 }).notNull(),
    currentStamps: integer('current_stamps').default(0).notNull(),
    // Sobrante de monto que aún no completa un sello (regla per_amount).
    carryoverAmount: money('carryover_amount').default('0.00').notNull(),
    rewardsRedeemed: integer('rewards_redeemed').default(0).notNull(),
    googleLoyaltyObjectId: text('google_loyalty_object_id'),
    status: passStatusEnum('status').default('active').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('passes_program_customer_uq').on(t.programId, t.customerId),
    index('passes_tenant_idx').on(t.tenantId),
    index('passes_customer_idx').on(t.customerId),
    check('passes_current_stamps_chk', sql`${t.currentStamps} >= 0`),
  ],
);

// Apple Wallet: un pase puede estar instalado en varios dispositivos,
// cada uno con su propio push token (protocolo de PassKit Web Service).
export const appleDevices = pgTable(
  'apple_devices',
  {
    id: id(),
    tenantId: tenantId(),
    deviceLibraryIdentifier: varchar('device_library_identifier', { length: 255 }).notNull(),
    pushToken: text('push_token').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique('apple_devices_tenant_device_uq').on(t.tenantId, t.deviceLibraryIdentifier)],
);

export const appleRegistrations = pgTable(
  'apple_registrations',
  {
    tenantId: tenantId(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => appleDevices.id, { onDelete: 'cascade' }),
    passId: uuid('pass_id')
      .notNull()
      .references(() => passes.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.deviceId, t.passId] }),
    index('apple_registrations_pass_idx').on(t.passId),
  ],
);

export const transactions = pgTable(
  'transactions',
  {
    id: id(),
    tenantId: tenantId(),
    // restrict: el historial no debe desaparecer al borrar un pase por error.
    passId: uuid('pass_id')
      .notNull()
      .references(() => passes.id, { onDelete: 'restrict' }),
    staffId: uuid('staff_id').references(() => staffUsers.id, { onDelete: 'set null' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    type: transactionTypeEnum('type').notNull(),
    purchaseAmount: money('purchase_amount').default('0.00').notNull(),
    stampsAdded: integer('stamps_added').default(1).notNull(),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [
    index('transactions_tenant_created_idx').on(t.tenantId, t.createdAt),
    index('transactions_pass_idx').on(t.passId),
  ],
);

// Cada tarjeta completada genera un premio 'pending'; el cajero lo canjea después.
export const rewardRedemptions = pgTable(
  'reward_redemptions',
  {
    id: id(),
    tenantId: tenantId(),
    passId: uuid('pass_id')
      .notNull()
      .references(() => passes.id, { onDelete: 'restrict' }),
    // Copia del premio al momento de ganarlo: si el programa cambia, el premio ganado no.
    rewardTitle: varchar('reward_title', { length: 255 }).notNull(),
    status: rewardStatusEnum('status').default('pending').notNull(),
    earnedTransactionId: uuid('earned_transaction_id').references(() => transactions.id, {
      onDelete: 'set null',
    }),
    redeemedTransactionId: uuid('redeemed_transaction_id').references(() => transactions.id, {
      onDelete: 'set null',
    }),
    redeemedByStaffId: uuid('redeemed_by_staff_id').references(() => staffUsers.id, {
      onDelete: 'set null',
    }),
    redeemedAtBranchId: uuid('redeemed_at_branch_id').references(() => branches.id, {
      onDelete: 'set null',
    }),
    earnedAt: timestamp('earned_at', { withTimezone: true }).defaultNow().notNull(),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
  },
  (t) => [
    index('reward_redemptions_pass_status_idx').on(t.passId, t.status),
    index('reward_redemptions_tenant_idx').on(t.tenantId),
    check(
      'reward_redemptions_redeemed_chk',
      sql`(${t.status} = 'pending' AND ${t.redeemedAt} IS NULL) OR (${t.status} = 'redeemed' AND ${t.redeemedAt} IS NOT NULL)`,
    ),
  ],
);

// ==========================================
// RELACIONES (para db.query.*)
// ==========================================

export const tenantsRelations = relations(tenants, ({ many }) => ({
  branches: many(branches),
  staffUsers: many(staffUsers),
  loyaltyPrograms: many(loyaltyPrograms),
  customers: many(customers),
  passes: many(passes),
  transactions: many(transactions),
  rewardRedemptions: many(rewardRedemptions),
}));

export const branchesRelations = relations(branches, ({ one, many }) => ({
  tenant: one(tenants, { fields: [branches.tenantId], references: [tenants.id] }),
  staffUsers: many(staffUsers),
  transactions: many(transactions),
}));

export const staffUsersRelations = relations(staffUsers, ({ one, many }) => ({
  tenant: one(tenants, { fields: [staffUsers.tenantId], references: [tenants.id] }),
  branch: one(branches, { fields: [staffUsers.branchId], references: [branches.id] }),
  transactions: many(transactions),
}));

export const loyaltyProgramsRelations = relations(loyaltyPrograms, ({ one, many }) => ({
  tenant: one(tenants, { fields: [loyaltyPrograms.tenantId], references: [tenants.id] }),
  passes: many(passes),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  tenant: one(tenants, { fields: [customers.tenantId], references: [tenants.id] }),
  passes: many(passes),
}));

export const passesRelations = relations(passes, ({ one, many }) => ({
  tenant: one(tenants, { fields: [passes.tenantId], references: [tenants.id] }),
  program: one(loyaltyPrograms, { fields: [passes.programId], references: [loyaltyPrograms.id] }),
  customer: one(customers, { fields: [passes.customerId], references: [customers.id] }),
  appleRegistrations: many(appleRegistrations),
  transactions: many(transactions),
  rewardRedemptions: many(rewardRedemptions),
}));

export const appleDevicesRelations = relations(appleDevices, ({ many }) => ({
  registrations: many(appleRegistrations),
}));

export const appleRegistrationsRelations = relations(appleRegistrations, ({ one }) => ({
  device: one(appleDevices, { fields: [appleRegistrations.deviceId], references: [appleDevices.id] }),
  pass: one(passes, { fields: [appleRegistrations.passId], references: [passes.id] }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  tenant: one(tenants, { fields: [transactions.tenantId], references: [tenants.id] }),
  pass: one(passes, { fields: [transactions.passId], references: [passes.id] }),
  staff: one(staffUsers, { fields: [transactions.staffId], references: [staffUsers.id] }),
  branch: one(branches, { fields: [transactions.branchId], references: [branches.id] }),
}));

export const rewardRedemptionsRelations = relations(rewardRedemptions, ({ one }) => ({
  tenant: one(tenants, { fields: [rewardRedemptions.tenantId], references: [tenants.id] }),
  pass: one(passes, { fields: [rewardRedemptions.passId], references: [passes.id] }),
  redeemedBy: one(staffUsers, {
    fields: [rewardRedemptions.redeemedByStaffId],
    references: [staffUsers.id],
  }),
}));
