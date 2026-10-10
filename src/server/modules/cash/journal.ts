import type { PaymentMethod } from '@prisma/client';
import { runInTenantTransaction } from '@/server/repositories/base';
import { getCustomerBalances } from '@/server/modules/customers/debt';
import { VERSEMENT_INCLUDE, serializeVersement, type Versement } from '@/server/modules/payments/versements';

/**
 * Le journal de la caisse sur une période : chaque mouvement, le total de
 * chaque carte, et le cumul après chaque ligne.
 *
 * Tout est calculé ici pour que l'écran n'additionne rien : la somme des
 * lignes d'un détail est, par construction, le chiffre de sa carte.
 *
 * Trois sortes de lignes :
 *  - FOND    : le fond de départ saisi à l'ouverture, puis chaque ajout
 *              d'argent fait à la main (l'historique des changements du fond) ;
 *  - ENTREE  : les paiements reçus — ceux faits à la commande et les versements
 *              sur d'anciennes commandes. Même requête que le « Total vendu » :
 *              le total des entrées d'un jour EST le total vendu de ce jour ;
 *  - SORTIE  : les dépenses payées depuis la caisse et l'argent sorti à la main.
 *
 * Un paiement annulé reste dans le journal, marqué annulé, et n'entre dans
 * aucun total. Sa contre-passation en caisse (le mouvement inverse créé à
 * l'annulation) n'est donc pas listée une seconde fois.
 */

export type JournalKind = 'FOND' | 'ENTREE' | 'SORTIE';

export interface JournalLine {
  id: string;
  kind: JournalKind;
  createdAt: Date;
  montant: number;
  methode: PaymentMethod;
  /** Client et commande pour une entrée, motif pour une sortie. */
  libelle: string;
  /** Catégorie de la dépense, ou précision du mouvement. */
  categorie: string | null;
  par: string | null;
  annule: boolean;
  /** Présent sur une entrée : de quoi ouvrir son reçu. */
  versement: Versement | null;
  expenseId: string | null;
  /** Total courant de SA carte (fond, entrées ou sorties) après cette ligne. */
  cumul: number;
  /** Total courant de son mode de paiement après cette ligne. */
  cumulMode: number;
  /** Solde de la période après cette ligne ; null si les sorties sont masquées. */
  soldeApres: number | null;
}

const MODE_ORDER: PaymentMethod[] = ['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN', 'MOOV', 'VIREMENT', 'AUTRE'];

function isReversal(clientUuid: string): boolean {
  return clientUuid.startsWith('cancel:');
}

export async function getCashJournal(
  ctx: { businessId: string; canSeeExits: boolean },
  from: Date,
  to: Date
) {
  const [raw, balances] = await Promise.all([
    runInTenantTransaction(ctx.businessId, async (tx) => {
      const range = { gte: from, lte: to };
      const [payments, movements, registers] = await Promise.all([
        tx.payment.findMany({
          where: { businessId: ctx.businessId, createdAt: range },
          include: VERSEMENT_INCLUDE,
        }),
        // Les mouvements liés à un paiement sont déjà représentés par ce paiement.
        tx.cashMovement.findMany({
          where: { businessId: ctx.businessId, createdAt: range, paymentId: null },
          include: { user: { select: { nom: true } } },
        }),
        tx.cashRegister.findMany({
          where: { businessId: ctx.businessId, ouverteLe: range },
          include: { ouvertePar: { select: { nom: true } } },
        }),
      ]);

      const expenseIds = movements
        .filter((m) => m.origine === 'DEPENSE' && m.referenceId)
        .map((m) => m.referenceId as string);
      const expenses = expenseIds.length
        ? await tx.expense.findMany({
            where: { businessId: ctx.businessId, id: { in: expenseIds } },
            select: { id: true, note: true, category: { select: { nom: true } } },
          })
        : [];

      return { payments, movements, registers, expenses };
    }),
    getCustomerBalances(ctx.businessId),
  ]);

  const expenseById = new Map(raw.expenses.map((e) => [e.id, e]));
  type Draft = Omit<JournalLine, 'cumul' | 'cumulMode' | 'soldeApres'>;
  const drafts: Draft[] = [];

  for (const r of raw.registers) {
    // Une caisse ouverte toute seule à 0 F (mode libre) n'est pas un fond saisi.
    if (r.fondDepart <= 0) continue;
    drafts.push({
      id: `fond-${r.id}`,
      kind: 'FOND',
      createdAt: r.ouverteLe,
      montant: r.fondDepart,
      methode: 'ESPECES',
      libelle: 'Fond de départ',
      categorie: 'Ouverture de la caisse',
      par: r.ouvertePar?.nom ?? null,
      annule: false,
      versement: null,
      expenseId: null,
    });
  }

  for (const p of raw.payments) {
    const v = serializeVersement(p);
    const commande = v.orderNumero ? `Commande #${v.orderNumero.split('-').pop()}` : 'Sans commande';
    drafts.push({
      id: `paiement-${p.id}`,
      kind: 'ENTREE',
      createdAt: p.createdAt,
      montant: p.montant,
      methode: p.methode,
      libelle: `${v.customerNom ?? 'Client'} · ${commande}`,
      categorie: null,
      par: v.encaissePar,
      annule: p.statut !== 'VALIDE',
      versement: v,
      expenseId: null,
    });
  }

  for (const m of raw.movements) {
    if (isReversal(m.clientUuid)) continue;
    if (m.type === 'SORTIE') {
      if (!ctx.canSeeExits) continue;
      const expense = m.origine === 'DEPENSE' && m.referenceId ? expenseById.get(m.referenceId) : undefined;
      drafts.push({
        id: `mouvement-${m.id}`,
        kind: 'SORTIE',
        createdAt: m.createdAt,
        montant: m.montant,
        methode: m.methode,
        libelle: expense?.note?.trim() || m.motif?.trim() || (expense ? expense.category.nom : 'Sortie de caisse'),
        categorie: expense ? expense.category.nom : 'Argent sorti de la caisse',
        par: m.user?.nom ?? null,
        annule: false,
        versement: null,
        expenseId: expense?.id ?? null,
      });
    } else {
      // Argent ajouté à la main : il modifie le fond, ce n'est pas une vente.
      drafts.push({
        id: `mouvement-${m.id}`,
        kind: 'FOND',
        createdAt: m.createdAt,
        montant: m.montant,
        methode: m.methode,
        libelle: m.motif?.trim() || 'Argent ajouté à la caisse',
        categorie: 'Ajout au fond',
        par: m.user?.nom ?? null,
        annule: false,
        versement: null,
        expenseId: null,
      });
    }
  }

  drafts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));

  const totals: Record<JournalKind, number> = { FOND: 0, ENTREE: 0, SORTIE: 0 };
  const byMode = new Map<PaymentMethod, number>();
  let solde = 0;

  const lines: JournalLine[] = drafts.map((draft) => {
    // « Autre » se range avec les espèces, comme partout ailleurs dans l'app.
    const d = draft.methode === 'AUTRE' ? { ...draft, methode: 'ESPECES' as PaymentMethod } : draft;
    if (!d.annule) {
      const signe = d.kind === 'SORTIE' ? -1 : 1;
      totals[d.kind] += d.montant;
      solde += signe * d.montant;
      byMode.set(d.methode, (byMode.get(d.methode) ?? 0) + signe * d.montant);
    }
    return {
      ...d,
      cumul: totals[d.kind],
      cumulMode: byMode.get(d.methode) ?? 0,
      soldeApres: ctx.canSeeExits ? solde : null,
    };
  });

  let creances = 0;
  let nbDebiteurs = 0;
  for (const dette of balances.values()) {
    if (dette > 0) {
      creances += dette;
      nbDebiteurs += 1;
    }
  }

  return {
    from,
    to,
    peutVoirSorties: ctx.canSeeExits,
    fondDepart: totals.FOND,
    entrees: totals.ENTREE,
    sorties: ctx.canSeeExits ? totals.SORTIE : null,
    solde: ctx.canSeeExits ? solde : null,
    modes: MODE_ORDER.filter((m) => byMode.has(m)).map((m) => ({ methode: m, total: byMode.get(m) ?? 0 })),
    creances: { total: creances, nbClients: nbDebiteurs },
    // Du plus récent au plus ancien, comme l'écran les affiche.
    lignes: lines.reverse(),
  };
}
