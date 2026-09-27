'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, adminErrorMessage } from '../../_lib/adminApi';
import { METHOD_LABELS, PERIOD_LABELS, formatAmount } from '../../_lib/format';
import type { AdminBusiness, AdminSubscriptionPayment, SubPayState } from '../../_lib/types';

const STATUT_FILTERS: { value: SubPayState | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tous' },
  { value: 'REUSSI', label: 'Réussis' },
  { value: 'ECHOUE', label: 'Échoués' },
  { value: 'EXPIRE', label: 'Expirés' },
  { value: 'INITIE', label: 'En attente' },
];

const STATUT_BADGE: Record<SubPayState, { label: string; className: string }> = {
  REUSSI: { label: 'Réussi', className: 'bg-emerald-100 text-emerald-800' },
  ECHOUE: { label: 'Échoué', className: 'bg-rose-100 text-rose-800' },
  EXPIRE: { label: 'Expiré', className: 'bg-slate-200 text-slate-600' },
  INITIE: { label: 'En attente', className: 'bg-amber-100 text-amber-800' },
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('fr-FR');
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<AdminSubscriptionPayment[]>([]);
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [statutFilter, setStatutFilter] = useState<SubPayState | 'ALL'>('ALL');
  const [businessId, setBusinessId] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .get<{ businesses: AdminBusiness[] }>('/businesses?limit=200')
      .then((d) => setBusinesses(d.businesses))
      .catch(() => setBusinesses([]));
  }, []);

  const loadPayments = useCallback(
    async (opts: { append?: boolean; afterCursor?: string } = {}) => {
      const setBusy = opts.append ? setIsLoadingMore : setIsLoading;
      setBusy(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (statutFilter !== 'ALL') params.set('statut', statutFilter);
        if (businessId) params.set('businessId', businessId);
        params.set('limit', '50');
        if (opts.afterCursor) params.set('cursor', opts.afterCursor);
        const data = await adminApi.get<{ payments: AdminSubscriptionPayment[] }>(`/payments?${params.toString()}`);
        setPayments((prev) => (opts.append ? [...prev, ...data.payments] : data.payments));
        setHasMore(data.payments.length === 50);
        setCursor(data.payments.at(-1)?.id);
      } catch (err) {
        setError(adminErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [statutFilter, businessId]
  );

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Paiements</h1>
        <p className="mt-1 text-sm text-slate-500">Toutes les transactions d&apos;abonnement des boutiques.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUT_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatutFilter(f.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              statutFilter === f.value
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            {f.label}
          </button>
        ))}
        <select
          value={businessId}
          onChange={(e) => setBusinessId(e.target.value)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
        >
          <option value="">Toutes les boutiques</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nom}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Boutique</th>
              <th className="px-4 py-3 text-right">Montant</th>
              <th className="px-4 py-3">Formule</th>
              <th className="px-4 py-3">Durée</th>
              <th className="px-4 py-3">Moyen de paiement</th>
              <th className="px-4 py-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Chargement…
                </td>
              </tr>
            )}
            {!isLoading && payments.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Aucun paiement pour ce filtre.
                </td>
              </tr>
            )}
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDateTime(p.createdAt)}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{p.businessNom}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                  {formatAmount(p.montant)}
                </td>
                <td className="px-4 py-3 text-slate-600">{p.formule ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{p.periode ? PERIOD_LABELS[p.periode] : '—'}</td>
                {/* Tant que pawaPay n'a pas confirmé, l'opérateur n'est pas connu (méthode AUTRE). */}
                <td className="px-4 py-3 text-slate-600">{METHOD_LABELS[p.methode] ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUT_BADGE[p.statut].className}`}>
                    {STATUT_BADGE[p.statut].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => loadPayments({ append: true, afterCursor: cursor })}
            disabled={isLoadingMore}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:border-slate-300 disabled:opacity-60"
          >
            {isLoadingMore ? 'Chargement…' : 'Charger plus'}
          </button>
        </div>
      )}
    </div>
  );
}
