'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, adminErrorMessage } from '../../../_lib/adminApi';
import { capitalizeName, countryLabel, formatAmount } from '../../../_lib/format';
import type { AdminAffiliateDetail, AffiliateAccountStatus } from '../../../_lib/types';

const PLAN_LABELS: Record<string, string> = { SOLO: 'Solo', BUSINESS: 'Business' };

function statusBadge(statut: AffiliateAccountStatus, planCode: string | null): { label: string; className: string } {
  if (statut === 'ABONNE') {
    return {
      label: `Abonné ${planCode ? PLAN_LABELS[planCode] ?? planCode : ''}`.trim(),
      className: 'bg-emerald-100 text-emerald-800',
    };
  }
  if (statut === 'ESSAI') return { label: 'Essai', className: 'bg-amber-100 text-amber-800' };
  return { label: 'Inactif', className: 'bg-slate-200 text-slate-600' };
}

export default function AdminAffiliateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [affiliate, setAffiliate] = useState<AdminAffiliateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .get<{ affiliate: AdminAffiliateDetail }>(`/affiliates/${id}`)
      .then((d) => setAffiliate(d.affiliate))
      .catch((err) => setError(adminErrorMessage(err)));
  }, [id]);

  return (
    <div className="space-y-6">
      <Link href="/admin/affilies" className="text-xs font-semibold text-slate-500 hover:text-slate-800">
        ← Affiliés
      </Link>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {!affiliate && !error && <p className="text-sm text-slate-400">Chargement…</p>}

      {affiliate && (
        <>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {affiliate.nom ? capitalizeName(affiliate.nom) : affiliate.telephone}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Code {affiliate.code} · {affiliate.telephone} · {countryLabel(affiliate.pays)}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: 'Inscrits', value: String(affiliate.inscrits) },
              { label: 'Payants', value: String(affiliate.payants) },
              { label: 'Solde', value: formatAmount(affiliate.solde) },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{stat.label}</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Compte</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 text-right">Paiements</th>
                  <th className="px-4 py-3 text-right">Commission générée</th>
                </tr>
              </thead>
              <tbody>
                {affiliate.comptes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      Aucun compte inscrit avec ce code.
                    </td>
                  </tr>
                )}
                {affiliate.comptes.map((c) => {
                  const badge = statusBadge(c.statut, c.planCode);
                  return (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{c.nom}</p>
                        <p className="text-xs text-slate-500">
                          Inscrit le {new Date(c.createdAt).toLocaleDateString('fr-FR')}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{c.paiements}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">
                        {formatAmount(c.commission)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
