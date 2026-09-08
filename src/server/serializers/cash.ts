import type { CashRegister, UserRole } from '@prisma/client';

/**
 * Filtrage par rôle AVANT la réponse (spec §10) : un SELLER opère la caisse
 * (ouverture, mouvements, comptage à la fermeture) mais ne reçoit jamais l'écart
 * ni le montant attendu calculé (spec §0 règle 7 : donnée d'écart de caisse).
 */
export function serializeCashRegister(r: CashRegister, role: UserRole) {
  const base = {
    id: r.id,
    businessId: r.businessId,
    ouverteParId: r.ouverteParId,
    ouverteLe: r.ouverteLe,
    fondDepart: r.fondDepart,
    fermeeParId: r.fermeeParId,
    fermeeLe: r.fermeeLe,
    montantCompte: r.montantCompte,
    statut: r.statut,
  };

  if (role === 'SELLER') return base;

  return {
    ...base,
    montantAttendu: r.montantAttendu,
    ecart: r.ecart,
    commentaireEcart: r.commentaireEcart,
  };
}
