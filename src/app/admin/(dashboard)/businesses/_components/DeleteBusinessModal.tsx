'use client';

import { useState } from 'react';
import { adminApi, adminErrorMessage } from '../../../_lib/adminApi';

/**
 * Le strict nécessaire pour confirmer une suppression. Volontairement plus
 * étroit que `AdminBusiness` : la page d'accueil n'a pas la fiche complète
 * d'une boutique, et n'a pas besoin de l'avoir pour l'effacer.
 */
export interface BusinessASupprimer {
  id: string;
  nom: string;
  ville: string | null;
}

/** Libellés des compteurs renvoyés par l'API, pour un résumé lisible après coup. */
const LIGNE_LABELS: Record<string, string> = {
  mouvementsCaisse: 'mouvements de caisse',
  caisses: 'caisses',
  mouvementsStock: 'mouvements de stock',
  depenses: 'dépenses',
  receptions: 'réceptions',
  comptages: 'comptages',
  paiements: 'paiements',
  lignesVente: 'lignes de vente',
  ventes: 'ventes',
  commerciaux: 'commerciaux',
  codesBarres: 'codes-barres',
  imagesProduit: 'images produit',
  produits: 'produits',
  clients: 'clients',
  categories: 'catégories',
  statsJour: 'statistiques journalières',
  notifications: 'notifications',
  commissionsAffiliation: "commissions d'affiliation",
  paiementsAbonnement: "paiements d'abonnement",
  factures: 'factures',
  abonnements: 'abonnements',
  abonnementsPush: 'appareils notifiés',
  journalAudit: 'entrées de journal',
  comptes: 'comptes',
};

interface Supprime {
  nom: string;
  lignes: Record<string, number>;
  total: number;
}

/**
 * Confirmation de suppression définitive. Le nom de la boutique doit être
 * retapé à l'identique : c'est le seul garde-fou entre un clic de trop et la
 * perte des données d'une vraie boutique. Le serveur revérifie la saisie, le
 * bouton grisé n'est qu'un confort.
 */
export function DeleteBusinessModal({
  business,
  onClose,
  onDeleted,
}: {
  business: BusinessASupprimer;
  onClose: () => void;
  onDeleted: (resume: Supprime) => void;
}) {
  const [confirmation, setConfirmation] = useState('');
  const [motif, setMotif] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nomCorrect = confirmation.trim() === business.nom.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomCorrect) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const data = await adminApi.del<{ supprime: Supprime }>(`/businesses/${business.id}`, {
        confirmation: confirmation.trim(),
        motif: motif.trim() || undefined,
      });
      onDeleted(data.supprime);
    } catch (err) {
      setError(adminErrorMessage(err));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h2 className="text-base font-bold text-rose-700">Supprimer définitivement</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          {business.nom}
          {business.ville ? ` — ${business.ville}` : ''}
        </p>

        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          La boutique, ses comptes et toutes ses données (ventes, produits, clients, caisse,
          dépenses, abonnements) partent pour de bon. Rien n&apos;est récupérable.
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Retape le nom de la boutique pour confirmer
            </label>
            <input
              type="text"
              required
              autoFocus
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={business.nom}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Motif <span className="font-normal text-slate-400">(facultatif, pour le journal)</span>
            </label>
            <input
              type="text"
              maxLength={500}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="compte de test"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-600"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !nomCorrect}
              className="flex-1 rounded-lg bg-rose-600 py-2 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50"
            >
              {isSubmitting ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Résumé de ce qui a été effacé, en une phrase. */
export function resumeSuppression(resume: Supprime): string {
  const details = Object.entries(resume.lignes)
    .map(([cle, n]) => `${n} ${LIGNE_LABELS[cle] ?? cle}`)
    .join(', ');
  return details
    ? `« ${resume.nom} » supprimée — ${details}.`
    : `« ${resume.nom} » supprimée (aucune donnée rattachée).`;
}
