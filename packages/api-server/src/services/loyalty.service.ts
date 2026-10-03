import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { branches, loyaltyPrograms, passes, rewardRedemptions, transactions } from '../db/schema.js';
import type { AddStampsInput, RedeemRewardInput } from '../schemas/loyalty.schema.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/http-error.js';

// Quién ejecuta la operación (sale del JWT)
export interface StaffContext {
  tenantId: string;
  staffId: string;
  branchId: string | null;
}

/**
 * Sucursal de la operación: la asignada al usuario o, solo para un admin, la que indique.
 * Se valida contra el tenant: la FK aceptaría una sucursal de otro negocio.
 */
export async function resolveStaffContext(
  user: { tenantId: string; sub: string; role: 'admin' | 'cashier'; branchId: string | null },
  requestedBranchId: string | undefined,
): Promise<StaffContext> {
  const base = { tenantId: user.tenantId, staffId: user.sub, branchId: user.branchId };
  if (requestedBranchId === undefined || requestedBranchId === user.branchId) return base;

  if (user.role !== 'admin') {
    throw new ForbiddenError('Solo un administrador puede registrar operaciones en otra sucursal');
  }
  const branch = await db.query.branches.findFirst({
    where: and(eq(branches.id, requestedBranchId), eq(branches.tenantId, user.tenantId)),
    columns: { id: true },
  });
  if (!branch) throw new NotFoundError('Sucursal no encontrada');
  return { ...base, branchId: branch.id };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Dinero en centavos enteros para no arrastrar errores de punto flotante.
const toCents = (value: string | number) => Math.round(Number(value) * 100);
const fromCents = (cents: number) => (cents / 100).toFixed(2);

// Bloquea la fila del pase (FOR UPDATE) hasta el fin de la transacción:
// dos escaneos simultáneos del mismo QR se procesan uno detrás del otro.
async function lockPass(tx: Tx, tenantId: string, passToken: string) {
  const [pass] = await tx
    .select()
    .from(passes)
    .where(and(eq(passes.tenantId, tenantId), eq(passes.serialNumber, passToken)))
    .for('update');

  if (!pass) throw new NotFoundError('Pase no encontrado');
  if (pass.status !== 'active') throw new ConflictError('El pase está suspendido');
  return pass;
}

export async function getPassDetails(passToken: string, tenantId: string) {
  const pass = await db.query.passes.findFirst({
    where: and(eq(passes.tenantId, tenantId), eq(passes.serialNumber, passToken)),
    // Nunca exponer authentication_token (secreto de Apple Wallet)
    columns: {
      id: true,
      serialNumber: true,
      status: true,
      currentStamps: true,
      carryoverAmount: true,
      rewardsRedeemed: true,
      createdAt: true,
    },
    with: {
      customer: { columns: { id: true, firstName: true, lastName: true, phone: true } },
      program: {
        columns: {
          id: true,
          title: true,
          rewardTitle: true,
          stampRuleType: true,
          amountPerStamp: true,
          minPurchaseAmount: true,
          totalStamps: true,
        },
      },
      rewardRedemptions: {
        where: eq(rewardRedemptions.status, 'pending'),
        columns: { id: true, rewardTitle: true, earnedAt: true },
        orderBy: asc(rewardRedemptions.earnedAt),
      },
    },
  });

  if (!pass) throw new NotFoundError('Pase no encontrado');

  const { rewardRedemptions: pendingRewards, ...rest } = pass;
  return { ...rest, pendingRewards };
}

export async function processPurchaseAndStamps(ctx: StaffContext, input: AddStampsInput) {
  return db.transaction(async (tx) => {
    const pass = await lockPass(tx, ctx.tenantId, input.passToken);

    const [program] = await tx
      .select()
      .from(loyaltyPrograms)
      .where(and(eq(loyaltyPrograms.id, pass.programId), eq(loyaltyPrograms.tenantId, ctx.tenantId)))
      // FOR SHARE: si un admin está cambiando totalStamps, esta compra espera a que termine
      .for('share');
    if (!program) throw new NotFoundError('Programa de lealtad no encontrado');
    if (program.status !== 'active') throw new ConflictError('El programa de lealtad no está activo');

    const amountCents = toCents(input.amountSpent);
    const minCents = toCents(program.minPurchaseAmount);
    const perStampCents = toCents(program.amountPerStamp);
    let carryoverCents = toCents(pass.carryoverAmount);

    // 1. Sellos según la regla del programa. Bajo el mínimo no suma nada (ni sobrante).
    let stampsEarned = 0;
    if (amountCents >= minCents) {
      if (program.stampRuleType === 'per_visit') {
        stampsEarned = 1;
      } else {
        const totalCents = carryoverCents + amountCents;
        stampsEarned = Math.floor(totalCents / perStampCents);
        carryoverCents = totalCents % perStampCents;
      }
    }

    // 2. Tarjetas completadas → premios; el resto queda en la tarjeta actual
    const totalStampsNow = pass.currentStamps + stampsEarned;
    const rewardsEarned = Math.floor(totalStampsNow / program.totalStamps);
    const currentStamps = totalStampsNow % program.totalStamps;

    // 3. Historial (se registra aunque no gane sellos, para auditoría)
    const [transaction] = await tx
      .insert(transactions)
      .values({
        tenantId: ctx.tenantId,
        passId: pass.id,
        staffId: ctx.staffId,
        branchId: ctx.branchId,
        type: 'add_stamp',
        purchaseAmount: fromCents(amountCents),
        stampsAdded: stampsEarned,
        notes: input.notes,
      })
      .returning({ id: transactions.id });

    // 4. Un premio pendiente por cada tarjeta completada
    if (rewardsEarned > 0) {
      await tx.insert(rewardRedemptions).values(
        Array.from({ length: rewardsEarned }, () => ({
          tenantId: ctx.tenantId,
          passId: pass.id,
          rewardTitle: program.rewardTitle,
          earnedTransactionId: transaction.id,
        })),
      );
    }

    await tx
      .update(passes)
      .set({ currentStamps, carryoverAmount: fromCents(carryoverCents) })
      .where(eq(passes.id, pass.id));

    const [{ pending }] = await tx
      .select({ pending: sql<number>`count(*)::int` })
      .from(rewardRedemptions)
      .where(and(eq(rewardRedemptions.passId, pass.id), eq(rewardRedemptions.status, 'pending')));

    return {
      passId: pass.id,
      transactionId: transaction.id,
      stampsEarned,
      currentStamps,
      totalStamps: program.totalStamps,
      carryoverAmount: fromCents(carryoverCents),
      rewardsEarned,
      pendingRewards: pending,
      belowMinimum: amountCents < minCents,
    };
  });
}

export async function redeemReward(ctx: StaffContext, input: RedeemRewardInput) {
  return db.transaction(async (tx) => {
    const pass = await lockPass(tx, ctx.tenantId, input.passToken);

    // El premio indicado o, si no se indica, el pendiente más antiguo
    const [pendingReward] = await tx
      .select()
      .from(rewardRedemptions)
      .where(
        and(
          eq(rewardRedemptions.passId, pass.id),
          input.rewardId
            ? eq(rewardRedemptions.id, input.rewardId)
            : eq(rewardRedemptions.status, 'pending'),
        ),
      )
      .orderBy(asc(rewardRedemptions.earnedAt))
      .limit(1);

    if (!pendingReward) {
      throw input.rewardId
        ? new NotFoundError('Recompensa no encontrada para este pase')
        : new ConflictError('El cliente no tiene recompensas disponibles para canjear');
    }
    if (pendingReward.status !== 'pending') {
      throw new ConflictError('Esta recompensa ya fue canjeada');
    }

    const [transaction] = await tx
      .insert(transactions)
      .values({
        tenantId: ctx.tenantId,
        passId: pass.id,
        staffId: ctx.staffId,
        branchId: ctx.branchId,
        type: 'redeem_reward',
        purchaseAmount: '0.00',
        stampsAdded: 0,
        notes: input.notes,
      })
      .returning({ id: transactions.id });

    const redeemedAt = new Date();
    await tx
      .update(rewardRedemptions)
      .set({
        status: 'redeemed',
        redeemedAt,
        redeemedTransactionId: transaction.id,
        redeemedByStaffId: ctx.staffId,
        redeemedAtBranchId: ctx.branchId,
      })
      .where(eq(rewardRedemptions.id, pendingReward.id));

    await tx
      .update(passes)
      .set({ rewardsRedeemed: sql`${passes.rewardsRedeemed} + 1` })
      .where(eq(passes.id, pass.id));

    return {
      passId: pass.id,
      redemptionId: pendingReward.id,
      rewardTitle: pendingReward.rewardTitle,
      transactionId: transaction.id,
      redeemedAt,
    };
  });
}
