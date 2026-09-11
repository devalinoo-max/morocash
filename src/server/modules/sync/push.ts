import { z } from 'zod';
import { AppError } from '@/server/shared/errors';
import { auditable } from '@/server/guards';
import { createOrder, createOrderSchema } from '@/server/modules/orders/createOrder';
import { createExpense, createExpenseSchema } from '@/server/modules/expenses/service';
import { repayDebt, repayDebtSchema } from '@/server/modules/customers/debt';
import {
  createReception,
  receptionSchema,
  createAdjustment,
  adjustmentSchema,
} from '@/server/modules/stock/movements';
import { createStockCount, stockCountSchema } from '@/server/modules/stock/counts';
import { createManualMovement, manualMovementSchema } from '@/server/modules/cash/service';
import type { UserRole, CashRegisterMode } from '@prisma/client';

/**
 * Le cahier des charges (§9) définit le contrat de `/sync/push` (clientUuid,
 * deviceId, operationType, payload, createdAt → SYNCED|DUPLICATE|ERROR par
 * opération) mais n'énumère pas les valeurs possibles d'`operationType`. Cette
 * liste correspond exactement aux opérations idempotentes déjà construites aux
 * étapes 4 à 7 (chacune portant son propre `clientUuid @unique` en base) —
 * aucune logique métier nouvelle n'est inventée ici, seulement le routage vers
 * les modules existants.
 *
 * `CREATE_CUSTOMER` est volontairement absent : le modèle `Customer` du schéma
 * (§2) ne porte pas de `clientUuid` — le rejouer via sync créerait des doublons,
 * à l'opposé de la garantie d'idempotence attendue par ce endpoint.
 */
export const syncOperationSchema = z.object({
  clientUuid: z.string().uuid(),
  deviceId: z.string().trim().min(1),
  operationType: z.enum([
    'CREATE_SALE',
    'CREATE_EXPENSE',
    'RECORD_DEBT_PAYMENT',
    'STOCK_RECEPTION',
    'STOCK_MOVEMENT',
    'STOCK_COUNT',
    'CASH_MOVEMENT',
  ]),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.coerce.date(),
});

export type SyncOperation = z.infer<typeof syncOperationSchema>;

export const syncPushSchema = z.object({
  operations: z.array(syncOperationSchema).min(1).max(100),
});

export interface SyncResult {
  clientUuid: string;
  status: 'SYNCED' | 'DUPLICATE' | 'ERROR';
  error?: { code: string; message: string };
}

type Ctx = { businessId: string; userId: string; role: UserRole; cashRegisterMode: CashRegisterMode };

async function processOne(ctx: Ctx, op: SyncOperation): Promise<SyncResult> {
  // Le clientUuid de l'enveloppe fait foi — il prime sur un éventuel clientUuid
  // dupliqué dans le payload, pour éviter toute divergence entre les deux.
  const payload = { ...op.payload, clientUuid: op.clientUuid };

  try {
    switch (op.operationType) {
      case 'CREATE_SALE': {
        const parsed = createOrderSchema.parse(payload);
        const result = await createOrder(
          {
            businessId: ctx.businessId,
            userId: ctx.userId,
            role: ctx.role,
            remiseMaxVendeur: 0,
            cashRegisterMode: ctx.cashRegisterMode,
          },
          parsed
        );
        return { clientUuid: op.clientUuid, status: result.status === 'DUPLICATE' ? 'DUPLICATE' : 'SYNCED' };
      }
      case 'CREATE_EXPENSE': {
        const parsed = createExpenseSchema.parse(payload);
        const result = await createExpense({ businessId: ctx.businessId, userId: ctx.userId }, parsed);
        if (result.status === 'CREATED') {
          await auditable(ctx, { action: 'EXPENSE_CREATED', entite: 'Expense', entiteId: result.expense.id });
        }
        return { clientUuid: op.clientUuid, status: result.status === 'DUPLICATE' ? 'DUPLICATE' : 'SYNCED' };
      }
      case 'RECORD_DEBT_PAYMENT': {
        const customerId = z.string().cuid().parse((op.payload as Record<string, unknown>).customerId);
        const parsed = repayDebtSchema.parse(payload);
        const result = await repayDebt(
          { businessId: ctx.businessId, userId: ctx.userId, cashRegisterMode: ctx.cashRegisterMode },
          customerId,
          parsed
        );
        return { clientUuid: op.clientUuid, status: result.status === 'DUPLICATE' ? 'DUPLICATE' : 'SYNCED' };
      }
      case 'STOCK_RECEPTION': {
        const parsed = receptionSchema.parse(payload);
        const result = await createReception(ctx.businessId, ctx.userId, parsed);
        if (result.status === 'CREATED') {
          await auditable(ctx, {
            action: 'STOCK_RECEPTION_CREATED',
            entite: 'StockReception',
            entiteId: result.reception.id,
          });
        }
        return { clientUuid: op.clientUuid, status: result.status === 'DUPLICATE' ? 'DUPLICATE' : 'SYNCED' };
      }
      case 'STOCK_MOVEMENT': {
        const parsed = adjustmentSchema.parse(payload);
        const result = await createAdjustment(ctx.businessId, ctx.userId, parsed);
        if (result.status === 'CREATED') {
          await auditable(ctx, {
            action: `STOCK_${result.movement.type}`,
            entite: 'StockMovement',
            entiteId: result.movement.id,
            motif: parsed.motif,
          });
        }
        return { clientUuid: op.clientUuid, status: result.status === 'DUPLICATE' ? 'DUPLICATE' : 'SYNCED' };
      }
      case 'STOCK_COUNT': {
        const parsed = stockCountSchema.parse(payload);
        const result = await createStockCount(ctx.businessId, ctx.userId, parsed);
        if (result.status === 'CREATED') {
          await auditable(ctx, { action: 'STOCK_COUNT_CREATED', entite: 'StockCount', entiteId: result.count.id });
        }
        return { clientUuid: op.clientUuid, status: result.status === 'DUPLICATE' ? 'DUPLICATE' : 'SYNCED' };
      }
      case 'CASH_MOVEMENT': {
        const parsed = manualMovementSchema.parse(payload);
        const result = await createManualMovement(
          { businessId: ctx.businessId, userId: ctx.userId, cashRegisterMode: ctx.cashRegisterMode },
          parsed
        );
        if (result.status === 'CREATED') {
          await auditable(ctx, {
            action: 'CASH_MOVEMENT_CREATED',
            entite: 'CashMovement',
            entiteId: result.movement.id,
          });
        }
        return { clientUuid: op.clientUuid, status: result.status === 'DUPLICATE' ? 'DUPLICATE' : 'SYNCED' };
      }
      default:
        return {
          clientUuid: op.clientUuid,
          status: 'ERROR',
          error: { code: 'VALIDATION_ERROR', message: `Type d'opération inconnu: ${String(op.operationType)}` },
        };
    }
  } catch (error) {
    if (error instanceof AppError) {
      return { clientUuid: op.clientUuid, status: 'ERROR', error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return {
        clientUuid: op.clientUuid,
        status: 'ERROR',
        error: { code: 'VALIDATION_ERROR', message: "Charge utile invalide pour ce type d'opération." },
      };
    }
    return {
      clientUuid: op.clientUuid,
      status: 'ERROR',
      error: { code: 'SERVER_ERROR', message: 'Erreur inattendue.' },
    };
  }
}

/**
 * Traite chaque opération indépendamment (spec §9) — un échec sur l'une n'annule
 * jamais les opérations déjà réussies du même lot.
 */
export async function pushSyncOperations(ctx: Ctx, operations: SyncOperation[]): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const op of operations) {
    results.push(await processOne(ctx, op));
  }
  return results;
}
