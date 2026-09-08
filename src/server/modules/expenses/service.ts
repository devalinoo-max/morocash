import { z } from 'zod';
import { runInTenantTransaction, scoped } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';
import { applyDailyStatsDelta } from '@/server/modules/reports/dailyStats';

export const createExpenseSchema = z.object({
  clientUuid: z.string().uuid(),
  montant: z.number().int().positive(),
  categoryId: z.string().cuid(),
  note: z.string().trim().max(1000).optional(),
  justificatifUrl: z.string().url().optional(),
  methode: z
    .enum(['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN', 'MOOV', 'VIREMENT', 'AUTRE'])
    .default('ESPECES'),
  recurrente: z.boolean().default(false),
  date: z.coerce.date().optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = z.object({
  montant: z.number().int().positive().optional(),
  categoryId: z.string().cuid().optional(),
  note: z.string().trim().max(1000).optional(),
  justificatifUrl: z.string().url().optional(),
  methode: z
    .enum(['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN', 'MOOV', 'VIREMENT', 'AUTRE'])
    .optional(),
});

export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

const ACHAT_MARCHANDISE_NOM = 'Achat marchandise';

/**
 * Une dépense de catégorie système "Achat marchandise" compte dans `totalDepenses`
 * mais jamais dans le calcul de `gagne` (spec §7.5) — voir dailyStats.ts.
 *
 * Chaque dépense règle un CashMovement (origine DEPENSE), exactement comme un
 * paiement de commande (createOrder) ou un remboursement de dette (repayDebt) —
 * les trois seuls flux qui font sortir/entrer de l'argent en caisse exigent tous
 * une caisse ouverte, quel que soit le moyen de paiement (spec §7.4 : `argentSorti`
 * inclut "dépenses réglées en espèces", et l'historique de caisse doit refléter
 * toutes les dépenses réglées pendant la session, pas seulement celles en espèces).
 */
export async function createExpense(
  ctx: { businessId: string; userId: string },
  input: CreateExpenseInput
) {
  return runInTenantTransaction(ctx.businessId, async (tx) => {
    const existing = await tx.expense.findUnique({ where: { clientUuid: input.clientUuid } });
    if (existing) {
      return { status: 'DUPLICATE' as const, expense: existing };
    }

    const category = await tx.category.findFirst({
      where: { id: input.categoryId, businessId: ctx.businessId, type: 'DEPENSE' },
    });
    if (!category) {
      throw new AppError('VALIDATION_ERROR', 'Catégorie de dépense introuvable pour cette boutique.');
    }

    const register = await tx.cashRegister.findFirst({
      where: { businessId: ctx.businessId, statut: 'OUVERTE' },
    });
    if (!register) {
      throw new AppError('CASH_REGISTER_CLOSED', 'Aucune caisse ouverte pour régler cette dépense.');
    }

    const expense = await tx.expense.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        clientUuid: input.clientUuid,
        montant: input.montant,
        categoryId: category.id,
        note: input.note,
        justificatifUrl: input.justificatifUrl,
        methode: input.methode,
        recurrente: input.recurrente,
        origine: 'MANUELLE',
        date: input.date ?? new Date(),
      },
    });

    await tx.cashMovement.create({
      data: {
        businessId: ctx.businessId,
        cashRegisterId: register.id,
        clientUuid: `${input.clientUuid}:cash`,
        type: 'SORTIE',
        origine: 'DEPENSE',
        referenceId: expense.id,
        montant: expense.montant,
        methode: expense.methode,
        userId: ctx.userId,
      },
    });

    const estAchatMarchandise = category.nom === ACHAT_MARCHANDISE_NOM && category.systeme;

    await applyDailyStatsDelta(
      tx,
      ctx.businessId,
      {
        totalDepenses: input.montant,
        depensesDeductibles: estAchatMarchandise ? 0 : input.montant,
      },
      expense.date
    );

    return { status: 'CREATED' as const, expense };
  });
}

export async function listExpenses(businessId: string) {
  const repo = scoped(businessId);
  return repo.expenses.findMany({ orderBy: { date: 'desc' } });
}

export async function updateExpense(businessId: string, id: string, input: UpdateExpenseInput) {
  const repo = scoped(businessId);
  const existing = await repo.expenses.findById(id);
  if (!existing) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Dépense introuvable.');
  }
  if (input.categoryId) {
    const category = await repo.categories.findById(input.categoryId);
    if (!category || category.type !== 'DEPENSE') {
      throw new AppError('VALIDATION_ERROR', 'Catégorie de dépense introuvable pour cette boutique.');
    }
  }
  // Note : une modification de montant/catégorie après coup ne recalcule pas
  // DailyStats a posteriori dans cette étape — la reconstruction nocturne (§11)
  // absorbe cet écart, cohérent avec "DailyStats ... reconstruit intégralement
  // par un cron nocturne" (spec §7.5).
  await repo.expenses.update(id, input);
  return repo.expenses.findById(id);
}
