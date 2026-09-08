'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi, adminErrorMessage } from '../../_lib/adminApi';
import type { AdminBusiness, AdminPlan, BusinessStatus } from '../../_lib/types';
import { BusinessActionsModal, type ActionMode } from './_components/BusinessActionsModal';

const STATUT_FILTERS: { value: BusinessStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Toutes' },
  { value: 'ESSAI', label: 'À l’essai' },
  { value: 'ACTIF', label: 'Actives' },
  { value: 'IMPAYE', label: 'Impayées' },
  { value: 'SUSPENDU', label: 'Suspendues' },
  { value: 'RESILIE', label: 'Résiliées' },
];

const STATUT_BADGE: Record<BusinessStatus, string> = {
  ESSAI: 'bg-amber-100 text-amber-800',
  ACTIF: 'bg-emerald-100 text-emerald-800',
  IMPAYE: 'bg-orange-100 text-orange-800',
  SUSPENDU: 'bg-rose-100 text-rose-800',
  RESILIE: 'bg-slate-200 text-slate-600',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('fr-FR');
}

export default function AdminBusinessesPage() {
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [statutFilter, setStatutFilter] = useState<BusinessStatus | 'ALL'>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: ActionMode; business: AdminBusiness } | null>(null);

  const loadBusinesses = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const query = statutFilter === 'ALL' ? '' : `?statut=${statutFilter}`;
      const data = await adminApi.get<{ businesses: AdminBusiness[] }>(`/businesses${query}`);
      setBusinesses(data.businesses);
    } catch (err) {
      setError(adminErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [statutFilter]);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);

  useEffect(() => {
    adminApi
      .get<{ plans: AdminPlan[] }>('/plans')
      .then((d) => setPlans(d.plans))
      .catch(() => setPlans([]));
  }, []);

  const handleToggleSuspend = async (business: AdminBusiness) => {
    setBusyId(business.id);
    try {
      const action = business.statut === 'SUSPENDU' ? 'reactivate' : 'suspend';
      await adminApi.post(`/businesses/${business.id}/${action}`);
      await loadBusinesses();
    } catch (err) {
      setError(adminErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Boutiques</h1>
        <p className="mt-1 text-sm text-slate-500">Gérer les offres, essais et statuts de toutes les boutiques.</p>
      </div>

      <div className="flex flex-wrap gap-2">
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
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Boutique</th>
              <th className="px-4 py-3">Offre</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Essai jusqu&apos;au</th>
              <th className="px-4 py-3">Créée le</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Chargement…
                </td>
              </tr>
            )}
            {!isLoading && businesses.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Aucune boutique pour ce filtre.
                </td>
              </tr>
            )}
            {businesses.map((b) => (
              <tr key={b.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {b.nom}
                  <div className="text-xs font-normal text-slate-400">{b.ville ?? '—'}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">{b.plan?.nom ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUT_BADGE[b.statut]}`}>
                    {b.statut}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{formatDate(b.trialEndsAt)}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(b.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() => setModal({ mode: 'extend-trial', business: b })}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
                    >
                      Essai
                    </button>
                    <button
                      onClick={() => setModal({ mode: 'change-plan', business: b })}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
                    >
                      Offre
                    </button>
                    <button
                      onClick={() => setModal({ mode: 'reset-pin', business: b })}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
                    >
                      Code PIN
                    </button>
                    <button
                      onClick={() => handleToggleSuspend(b)}
                      disabled={busyId === b.id}
                      className={`rounded-md px-2 py-1 text-xs font-semibold disabled:opacity-60 ${
                        b.statut === 'SUSPENDU'
                          ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                          : 'bg-rose-600 text-white hover:bg-rose-500'
                      }`}
                    >
                      {b.statut === 'SUSPENDU' ? 'Réactiver' : 'Suspendre'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <BusinessActionsModal
          mode={modal.mode}
          business={modal.business}
          plans={plans}
          onClose={() => setModal(null)}
          onDone={async () => {
            setModal(null);
            await loadBusinesses();
          }}
        />
      )}
    </div>
  );
}
