import type { ReceiptDelivery, Sale } from '../types';
import { formatMoney, formatPaymentMethod } from './formatters';
import { countLabel } from './plural';

/**
 * Ce que le détail d'une commande raconte, hors de tout affichage.
 *
 * Ces trois calculs sont les seules vraies décisions de cet écran : ce que le
 * statut veut dire, ce que le client doit au total, et ce qui est arrivé à la
 * commande. Ils vivent ici pour être vérifiables sans monter un composant —
 * une phrase de dette fausse se voit en caisse, pas dans une capture d'écran.
 */

/** Sous-titre du bloc de tête : le statut traduit en une ligne. */
export function statusSubtitle(sale: Sale): string {
  if (sale.isCancelled) return 'N’est comptée dans aucun chiffre';
  const reste = sale.remainingAmount;
  if (reste === 0) return 'Réglée en totalité';
  if (sale.paidAmount === 0) return 'Rien n’a encore été payé';
  return `${formatMoney(sale.paidAmount)} reçus · ${formatMoney(reste)} à recevoir`;
}

/**
 * La dette du client après cette commande, expliquée en une phrase.
 *
 * Le commerçant ne cherche pas ce que cette commande-ci laisse dû : il cherche
 * ce que la personne en face de lui doit en tout. La phrase distingue donc
 * toujours ce qui vient d'ici de ce qui vient d'avant.
 *
 * @param customerDebt dette totale du client telle que la base la connaît ;
 *   `undefined` quand la commande n'est rattachée à aucun client du carnet, on
 *   retombe alors sur le reste de cette seule commande.
 */
export function debtSentence(sale: Sale, customerDebt: number | undefined): string | null {
  // Une commande annulée ne doit plus rien à personne : rien à expliquer.
  if (sale.isCancelled) return null;

  const prenom = (sale.customerName?.trim() || 'Ce client').split(' ')[0];
  const reste = sale.remainingAmount;
  const detteTotale = customerDebt ?? reste;
  const detteAilleurs = Math.max(0, detteTotale - reste);

  if (detteTotale === 0) return `${prenom} n’a aucune dette : son compte est à jour.`;

  if (detteAilleurs > 0) {
    return `Après cette commande, ${prenom} te doit ${formatMoney(detteTotale)} au total — ${formatMoney(detteAilleurs)} d’anciennes commandes et ${formatMoney(reste)} de celle-ci.`;
  }

  return `Après cette commande, ${prenom} te doit ${formatMoney(reste)}.`;
}

export interface HistoryLine {
  at: string;
  titre: string;
  detail?: string;
}

const LIBELLE_CANAL: Record<ReceiptDelivery['canal'], string> = {
  WHATSAPP: 'Reçu envoyé sur WhatsApp',
  IMPRESSION: 'Reçu imprimé',
  TELECHARGEMENT: 'Reçu téléchargé',
  COPIE_TEXTE: 'Reçu copié',
};

/**
 * Tout ce qui est arrivé à la commande, du plus récent au plus ancien.
 *
 * Pour une commande annulée, on détaille ce que l'annulation a corrigé :
 * sans ça, le commerçant voit « Commande annulée » et part chercher où sont
 * passés son stock et son argent.
 */
export function buildHistory(sale: Sale, deliveries: ReceiptDelivery[]): HistoryLine[] {
  const lignes: HistoryLine[] = [
    {
      at: sale.createdAt,
      titre: 'Commande enregistrée',
      detail: sale.sellerName ? `par ${sale.sellerName}` : undefined,
    },
  ];

  for (const p of sale.payments ?? []) {
    lignes.push({
      at: p.createdAt,
      titre: p.isCancelled
        ? `Paiement annulé — ${formatMoney(p.amount)}`
        : `Paiement reçu — ${formatMoney(p.amount)}`,
      detail: formatPaymentMethod(p.method),
    });
  }

  for (const envoi of deliveries) {
    if (envoi.orderId !== sale.id && envoi.orderReference !== sale.reference) continue;
    lignes.push({
      at: envoi.createdAt,
      titre: LIBELLE_CANAL[envoi.canal],
      detail: envoi.userName,
    });
  }

  if (sale.isCancelled) {
    const quand = sale.cancelledAt ?? sale.createdAt;
    const nbArticles = sale.items.reduce((total, it) => total + it.quantity, 0);

    lignes.push({ at: quand, titre: 'Commande annulée', detail: sale.cancelReason });
    lignes.push({
      at: quand,
      titre: 'Stock remis',
      detail: `${countLabel(nbArticles, 'article')} ${nbArticles > 1 ? 'sont revenus' : 'est revenu'} en stock`,
    });
    if (sale.paidAmount > 0) {
      lignes.push({
        at: quand,
        titre: 'Paiement annulé',
        detail: `${formatMoney(sale.paidAmount)} retirés de la caisse`,
      });
    }
  }

  return lignes.sort((a, b) => b.at.localeCompare(a.at));
}
