import Link from 'next/link';
import { getMetrics } from '@/server/modules/admin/service';

const STATUT_LABELS: Record<string, string> = {
  ESSAI: 'À l’essai',
  ACTIF: 'Actives',
  IMPAYE: 'Impayées',
  SUSPENDU: 'Suspendues',
  RESILIE: 'Résiliées',
};

const STATUT_ORDER = ['ESSAI', 'ACTIF', 'IMPAYE', 'SUSPENDU', 'RESILIE'];

const ACTIVITE_LABELS = {
  INSCRIPTION: { label: 'Inscription', className: 'bg-indigo-100 text-indigo-800' },
  PAIEMENT_REUSSI: { label: 'Paiement réussi', className: 'bg-emerald-100 text-emerald-800' },
  PAIEMENT_ECHOUE: { label: 'Paiement échoué', className: 'bg-rose-100 text-rose-800' },
  ANNULATION: { label: 'Annulation', className: 'bg-slate-200 text-slate-700' },
} as const;

function formatMoney(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} F CFA`;
}

// Server Component : appelle le service admin directement (même process,
// même garantie d'auth que le layout parent) — pas besoin d'un aller-retour
// HTTP pour une vue de lecture seule affichée une fois par chargement de page.
export default async function AdminDashboardPage() {
  const metrics = await getMetrics();
  const totalBusinesses = Object.values(metrics.businessesParStatut).reduce((a, b) => a + b, 0);
  const { conversion30j } = metrics;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Vue d&apos;ensemble</h1>
        <p className="mt-1 text-sm text-slate-500">Métriques globales de toutes les boutiques MoroCash.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Boutiques</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{totalBusinesses}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Utilisateurs actifs</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{metrics.totalUsersActifs}</p>
        </div>
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">MRR estimé</p>
          <p className="mt-2 text-3xl font-bold text-indigo-700">{formatMoney(metrics.mrrEstime)}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-bold text-slate-900">Répartition par statut</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {STATUT_ORDER.map((statut) => (
            <div key={statut} className="rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-2xl font-bold text-slate-900">{metrics.businessesParStatut[statut] ?? 0}</p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">{STATUT_LABELS[statut] ?? statut}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">Boutiques actives par formule</h2>
          <p className="mb-4 mt-1 text-xs text-slate-500">MRR = montant payé ramené au mois.</p>
          {metrics.actifsParFormule.length === 0 ? (
            <p className="text-sm text-slate-400">Aucune boutique active.</p>
          ) : (
            <div className="space-y-2">
              {metrics.actifsParFormule.map((f) => (
                <div key={f.formule} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{f.formule}</p>
                    <p className="text-xs text-slate-500">
                      {f.boutiques} boutique{f.boutiques > 1 ? 's' : ''}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-indigo-700">{formatMoney(f.mrr)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">Conversion essai → payant (30 jours)</h2>
          <p className="mb-4 mt-1 text-xs text-slate-500">Boutiques inscrites ces 30 derniers jours qui ont déjà payé.</p>
          <p className="text-3xl font-bold text-slate-900">
            {conversion30j.taux === null ? '—' : `${Math.round(conversion30j.taux * 100)} %`}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {conversion30j.converties} sur {conversion30j.inscrites} inscription{conversion30j.inscrites > 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-bold text-slate-900">Essais qui expirent dans les 7 prochains jours</h2>
        {metrics.essaisExpirant7j.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun essai n&apos;expire dans les 7 prochains jours.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {metrics.essaisExpirant7j.map((e) => (
              <li key={e.businessId} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium text-slate-900">{e.nom}</span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                  {e.joursRestants === 0
                    ? 'Expire aujourd’hui'
                    : `${e.joursRestants} jour${e.joursRestants > 1 ? 's' : ''} restant${e.joursRestants > 1 ? 's' : ''}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Activité récente</h2>
          <Link href="/admin/audit-logs" className="text-xs font-semibold text-indigo-600 hover:text-indigo-500">
            Journal d&apos;audit →
          </Link>
        </div>
        {metrics.activiteRecente.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune activité.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {metrics.activiteRecente.map((a) => (
              <li key={`${a.type}-${a.businessId}-${a.date.getTime()}`} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-32 shrink-0 whitespace-nowrap text-xs text-slate-500">
                  {a.date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${ACTIVITE_LABELS[a.type].className}`}>
                  {ACTIVITE_LABELS[a.type].label}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                  {a.businessNom}
                  {a.montant !== null && <span className="font-normal text-slate-500"> · {formatMoney(a.montant)}</span>}
                </span>
                <Link
                  href={`/admin/audit-logs?businessId=${a.businessId}`}
                  className="shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-500"
                >
                  Détail
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
