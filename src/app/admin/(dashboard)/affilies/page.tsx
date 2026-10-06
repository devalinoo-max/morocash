'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, adminErrorMessage } from '../../_lib/adminApi';
import { PAYOUT_OPERATOR_LABELS, capitalizeName, countryLabel, formatAmount } from '../../_lib/format';
import type { AdminAffiliate, AdminAffiliatesOverview } from '../../_lib/types';

/** « Orange Money · 0708091011 » : où verser le retrait. */
function destination(retrait: NonNullable<AdminAffiliate['retraitDemande']>): string {
  const operateur = retrait.operateur
    ? (PAYOUT_OPERATOR_LABELS[retrait.operateur] ?? retrait.operateur)
    : 'Opérateur non précisé';
  return `${operateur} · ${retrait.numeroReception ?? '—'}`;
}

export default function AdminAffiliatesPage() {
  const [overview, setOverview] = useState<AdminAffiliatesOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOverview(await adminApi.get<AdminAffiliatesOverview>('/affiliates'));
    } catch (err) {
      setError(adminErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markPaid = async (affiliate: AdminAffiliate) => {
    const retrait = affiliate.retraitDemande;
    if (!retrait) return;
    const confirmed = window.confirm(
      `Confirmer le versement de ${formatAmount(retrait.montant)} sur ${destination(retrait)} (${affiliate.code}) ?`,
    );
    if (!confirmed) return;

    setPayingId(retrait.id);
    setError(null);
    try {
      await adminApi.post(`/affiliates/payouts/${retrait.id}/mark-paid`);
      await load();
    } catch (err) {
      setError(adminErrorMessage(err));
    } finally {
      setPayingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Affiliés</h1>
        <p className="mt-1 text-sm text-slate-500">Verse les retraits en mobile money, puis marque-les payés ici.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Retraits demandés</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{overview?.retraitsDemandes ?? '—'}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total à verser</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {overview ? formatAmount(overview.totalAVerser) : '—'}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Affilié</th>
              <th className="px-4 py-3 text-right">Inscrits</th>
              <th className="px-4 py-3 text-right">Payants</th>
              <th className="px-4 py-3 text-right">Solde</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Chargement…
                </td>
              </tr>
            )}
            {!isLoading && overview?.affiliates.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Aucun affilié pour l&apos;instant.
                </td>
              </tr>
            )}
            {overview?.affiliates.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/affilies/${a.id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                    {a.nom ? capitalizeName(a.nom) : a.telephone}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {a.code} · {a.telephone} · {countryLabel(a.pays)}
                  </p>
                </td>
                <td className="px-4 py-3 text-right text-slate-600">{a.inscrits}</td>
                <td className="px-4 py-3 text-right text-slate-600">{a.payants}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                  {formatAmount(a.solde)}
                </td>
                <td className="px-4 py-3 text-right">
                  {a.retraitDemande ? (
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-slate-500 whitespace-nowrap">{destination(a.retraitDemande)}</span>
                      <button
                        onClick={() => markPaid(a)}
                        disabled={payingId === a.retraitDemande.id}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 whitespace-nowrap"
                      >
                        {payingId === a.retraitDemande.id
                          ? 'Enregistrement…'
                          : `Marquer payé · ${formatAmount(a.retraitDemande.montant)}`}
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
