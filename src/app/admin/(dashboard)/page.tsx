import { getMetrics } from '@/server/modules/admin/service';

const STATUT_LABELS: Record<string, string> = {
  ESSAI: 'À l’essai',
  ACTIF: 'Actives',
  IMPAYE: 'Impayées',
  SUSPENDU: 'Suspendues',
  RESILIE: 'Résiliées',
};

const STATUT_ORDER = ['ESSAI', 'ACTIF', 'IMPAYE', 'SUSPENDU', 'RESILIE'];

function formatMoney(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} F CFA`;
}

// Server Component : appelle le service admin directement (même process,
// même garantie d'auth que le layout parent) — pas besoin d'un aller-retour
// HTTP pour une vue de lecture seule affichée une fois par chargement de page.
export default async function AdminDashboardPage() {
  const metrics = await getMetrics();
  const totalBusinesses = Object.values(metrics.businessesParStatut).reduce((a, b) => a + b, 0);

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
    </div>
  );
}
