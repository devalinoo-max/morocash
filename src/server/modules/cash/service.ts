import { z } from 'zod';
import { runInTenantTransaction, scoped } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';

export const openRegisterSchema = z.object({
  clientUuid: z.string().uuid(),
  fondDepart: z.number().int().nonnegative(),
});

export type OpenRegisterInput = z.infer<typeof openRegisterSchema>;

export const closeRegisterSchema = z.object({
  montantCompte: z.number().int().nonnegative(),
  commentaireEcart: z.string().trim().max(1000).optional(),
});

export type CloseRegisterInput = z.infer<typeof closeRegisterSchema>;

export const manualMovementSchema = z.object({
  clientUuid: z.string().uuid(),
  type: z.enum(['APPORT', 'RETRAIT']),
  montant: z.number().int().positive(),
  motif: z.string().trim().min(1, 'Un motif est obligatoire pour un mouvement manuel.'),
  methode: z
    .enum(['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN', 'MOOV', 'VIREMENT', 'AUTRE'])
    .default('ESPECES'),
});

export type ManualMovementInput = z.infer<typeof manualMovementSchema>;

/**
 * Ouvre une caisse — une seule caisse ouverte à la fois par boutique (spec §7.4).
 */
export async function openRegister(
  ctx: { businessId: string; userId: string },
  input: OpenRegisterInput
) {
  return runInTenantTransaction(ctx.businessId, async (tx) => {
    const open = await tx.cashRegister.findFirst({
      where: { businessId: ctx.businessId, statut: 'OUVERTE' },
    });
    if (open) {
      throw new AppError('CASH_REGISTER_ALREADY_OPEN', 'Une caisse est déjà ouverte pour cette boutique.');
    }

    const register = await tx.cashRegister.create({
      data: {
        businessId: ctx.businessId,
        ouverteParId: ctx.userId,
        fondDepart: input.fondDepart,
      },
    });

    return register;
  });
}

export async function getCurrentRegister(businessId: string) {
  const repo = scoped(businessId);
  return repo.cash.currentRegister();
}

export async function listMovements(businessId: string, cashRegisterId?: string) {
  const repo = scoped(businessId);
  return repo.cash.movements({
    where: cashRegisterId ? { cashRegisterId } : undefined,
    orderBy: { createdAt: 'desc' },
  });
}

export async function getHistory(businessId: string) {
  const repo = scoped(businessId);
  return repo.cash.history();
}

/**
 * Mouvement manuel (APPORT/RETRAIT) — motif obligatoire, exige une caisse ouverte.
 * APPORT = ENTREE, RETRAIT = SORTIE (spec §7.4).
 */
export async function createManualMovement(
  ctx: { businessId: string; userId: string },
  input: ManualMovementInput
) {
  return runInTenantTransaction(ctx.businessId, async (tx) => {
    const existing = await tx.cashMovement.findUnique({ where: { clientUuid: input.clientUuid } });
    if (existing) {
      return { status: 'DUPLICATE' as const, movement: existing };
    }

    const register = await tx.cashRegister.findFirst({
      where: { businessId: ctx.businessId, statut: 'OUVERTE' },
    });
    if (!register) {
      throw new AppError('CASH_REGISTER_CLOSED', 'Aucune caisse ouverte pour ce mouvement.');
    }

    const movement = await tx.cashMovement.create({
      data: {
        businessId: ctx.businessId,
        cashRegisterId: register.id,
        clientUuid: input.clientUuid,
        type: input.type === 'APPORT' ? 'ENTREE' : 'SORTIE',
        origine: input.type,
        montant: input.montant,
        methode: input.methode,
        motif: input.motif,
        userId: ctx.userId,
      },
    });

    return { status: 'CREATED' as const, movement };
  });
}

/**
 * Fermeture de caisse — calcule l'attendu et l'écart à partir des CashMovement de
 * la session (spec §7.4, formules exactes) :
 *   attenduEnEspeces = fondDepart + entrées espèces − sorties espèces
 *   attenduTotal      = fondDepart + toutes entrées − toutes sorties
 *   ecart             = montantCompte − attenduEnEspeces
 * `montantCompte` est un comptage physique d'espèces — comparé à l'attendu en
 * espèces, pas au total tous moyens confondus.
 */
export async function closeRegister(
  ctx: { businessId: string; userId: string },
  input: CloseRegisterInput
) {
  return runInTenantTransaction(ctx.businessId, async (tx) => {
    const register = await tx.cashRegister.findFirst({
      where: { businessId: ctx.businessId, statut: 'OUVERTE' },
    });
    if (!register) {
      throw new AppError('CASH_REGISTER_CLOSED', 'Aucune caisse ouverte pour cette boutique.');
    }

    const movements = await tx.cashMovement.findMany({
      where: { businessId: ctx.businessId, cashRegisterId: register.id },
    });

    let entreesEspeces = 0;
    let sortiesEspeces = 0;
    let entreesTotal = 0;
    let sortiesTotal = 0;
    for (const m of movements) {
      if (m.type === 'ENTREE') {
        entreesTotal += m.montant;
        if (m.methode === 'ESPECES') entreesEspeces += m.montant;
      } else {
        sortiesTotal += m.montant;
        if (m.methode === 'ESPECES') sortiesEspeces += m.montant;
      }
    }

    const attenduEnEspeces = register.fondDepart + entreesEspeces - sortiesEspeces;
    const attenduTotal = register.fondDepart + entreesTotal - sortiesTotal;
    const ecart = input.montantCompte - attenduEnEspeces;

    const closed = await tx.cashRegister.update({
      where: { id: register.id },
      data: {
        statut: 'FERMEE',
        fermeeParId: ctx.userId,
        fermeeLe: new Date(),
        montantAttendu: attenduEnEspeces,
        montantCompte: input.montantCompte,
        ecart,
        commentaireEcart: input.commentaireEcart,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        action: 'CASH_REGISTER_CLOSED',
        entite: 'CashRegister',
        entiteId: register.id,
        nouvellesValeurs: { montantAttendu: attenduEnEspeces, montantCompte: input.montantCompte, ecart },
      },
    });

    return { register: closed, attenduEnEspeces, attenduTotal, ecart };
  });
}
