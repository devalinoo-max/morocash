'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DeleteBusinessModal,
  resumeSuppression,
  type BusinessASupprimer,
} from '../businesses/_components/DeleteBusinessModal';

const STATUT_BADGE: Record<string, string> = {
  ESSAI: 'bg-amber-100 text-amber-800',
  ACTIF: 'bg-emerald-100 text-emerald-800',
  IMPAYE: 'bg-orange-100 text-orange-800',
  SUSPENDU: 'bg-rose-100 text-rose-800',
  RESILIE: 'bg-slate-200 text-slate-600',
};

export interface RecentBusinessRow extends BusinessASupprimer {
  statut: string;
  /** Sérialisée en ISO par la frontière serveur → client. */
  createdAt: string;
  produits: number;
  ventes: number;
  clients: number;
}

/** « 8 produits · 10 ventes · 11 clients », ou « aucune donnée ». */
function decrireVolume(b: RecentBusinessRow): string {
  const parts: string[] = [];
  if (b.produits > 0) parts.push(`${b.produits} produit${b.produits > 1 ? 's' : ''}`);
  if (b.ventes > 0) parts.push(`${b.ventes} vente${b.ventes > 1 ? 's' : ''}`);
  if (b.clients > 0) parts.push(`${b.clients} client${b.clients > 1 ? 's' : ''}`);
  return parts.length > 0 ? parts.join(' · ') : 'aucune donnée';
}

/**
 * Les dernières boutiques inscrites, avec un bouton de suppression sur chacune :
 * c'est là que se retrouvent les comptes créés en testant, et le volume affiché
 * dit tout de suite si la boutique est une coquille vide ou une vraie boutique.
 *
 * La liste vient du composant serveur parent ; après une suppression, un
 * `router.refresh()` la fait recalculer côté serveur plutôt que de retirer la
 * ligne à la main — les métriques du haut de page bougent aussi.
 */
export function RecentBusinessesPanel({ businesses }: { businesses: RecentBusinessRow[] }) {
  const router = useRouter();
  const [suppression, setSuppression] = useState<RecentBusinessRow | null>(null);
  const [dernierResume, setDernierResume] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">Dernières boutiques créées</h2>
        <Link href="/admin/businesses" className="text-xs font-semibold text-indigo-600 hover:text-indigo-500">
          Toutes les boutiques →
        </Link>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Pour retrouver et supprimer un compte de test. La suppression est définitive.
      </p>

      {dernierResume && (
        <div className="mb-3 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <span className="flex-1">{dernierResume}</span>
          <button
            onClick={() => setDernierResume(null)}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            Fermer
          </button>
        </div>
      )}

      {businesses.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune boutique.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {businesses.map((b) => {
            const vide = b.produits === 0 && b.ventes === 0 && b.clients === 0;
            return (
              <li key={b.id} className="flex items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-slate-900">{b.nom}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        STATUT_BADGE[b.statut] ?? 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {b.statut}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {new Date(b.createdAt).toLocaleDateString('fr-FR')}
                    {b.ville ? ` · ${b.ville}` : ''} ·{' '}
                    <span className={vide ? 'font-semibold text-slate-400' : ''}>{decrireVolume(b)}</span>
                  </p>
                </div>
                <button
                  onClick={() => setSuppression(b)}
                  className="shrink-0 rounded-md bg-rose-700 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-600"
                >
                  Supprimer
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {suppression && (
        <DeleteBusinessModal
          business={suppression}
          onClose={() => setSuppression(null)}
          onDeleted={(resume) => {
            setSuppression(null);
            setDernierResume(resumeSuppression(resume));
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
