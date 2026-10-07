'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { adminApi, adminErrorMessage } from '../../_lib/adminApi';
import type { AdminAffiliationSettings } from '../../_lib/types';

/** « Formule Business » → « Business ». */
function shortPlanName(nom: string): string {
  return nom.replace(/^Formule\s+/i, '');
}

/** Champ texte → entier FCFA, null si la saisie n'est pas un entier positif. */
function parseAmount(value: string): number | null {
  const clean = value.replace(/\s/g, '');
  return /^\d+$/.test(clean) ? Number(clean) : null;
}

export default function AdminAffiliationPage() {
  const [settings, setSettings] = useState<AdminAffiliationSettings | null>(null);
  const [commissions, setCommissions] = useState<Record<string, string>>({});
  const [seuil, setSeuil] = useState('');
  const [joursOfferts, setJoursOfferts] = useState('');
  const [reduction, setReduction] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const apply = (s: AdminAffiliationSettings) => {
    setSettings(s);
    setCommissions(Object.fromEntries(s.plans.map((p) => [p.code, String(p.commissionAffilie)])));
    setSeuil(String(s.seuilRetrait));
    setJoursOfferts(String(s.joursEssaiOfferts));
    setReduction(String(s.reductionPremierPaiement));
  };

  useEffect(() => {
    adminApi
      .get<{ settings: AdminAffiliationSettings }>('/affiliation')
      .then((d) => apply(d.settings))
      .catch((err) => setError(adminErrorMessage(err)))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const parsedCommissions: Record<string, number> = {};
    for (const [code, value] of Object.entries(commissions)) {
      const amount = parseAmount(value);
      if (amount === null) {
        setError('Les commissions doivent être des montants entiers en FCFA.');
        return;
      }
      parsedCommissions[code] = amount;
    }
    const seuilRetrait = parseAmount(seuil);
    if (seuilRetrait === null) {
      setError('Le seuil de retrait doit être un montant entier en FCFA.');
      return;
    }
    const joursEssaiOfferts = parseAmount(joursOfferts);
    if (joursEssaiOfferts === null || joursEssaiOfferts > 365) {
      setError('Les jours offerts doivent être un nombre entier entre 0 et 365.');
      return;
    }
    const reductionPremierPaiement = parseAmount(reduction);
    if (reductionPremierPaiement === null || reductionPremierPaiement > 100) {
      setError('La réduction doit être un pourcentage entier entre 0 et 100.');
      return;
    }

    setIsSaving(true);
    try {
      const d = await adminApi.post<{ settings: AdminAffiliationSettings }>('/affiliation', {
        commissions: parsedCommissions,
        seuilRetrait,
        joursEssaiOfferts,
        reductionPremierPaiement,
      });
      apply(d.settings);
      setSaved(true);
    } catch (err) {
      setError(adminErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Affiliation</h1>
        <p className="mt-1 text-sm text-slate-500">
          Commission versée aux affiliés pour chaque mois d&apos;abonnement payé par une boutique qu&apos;ils ont amenée.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}
      {saved && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Réglages enregistrés. Ils s&apos;appliquent aux prochains paiements.
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : settings ? (
        <form onSubmit={handleSave} className="max-w-xl space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-900">Commission par mois d&apos;abonnement payé</legend>
            {settings.plans.map((plan) => (
              <label key={plan.code} className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-700">{shortPlanName(plan.nom)}</span>
                <span className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={commissions[plan.code] ?? ''}
                    onChange={(e) => setCommissions((prev) => ({ ...prev, [plan.code]: e.target.value }))}
                    className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                  />
                  <span className="text-sm text-slate-500">F</span>
                </span>
              </label>
            ))}
            <p className="text-xs text-slate-400">
              Un changement ne vaut que pour les paiements futurs : les commissions déjà créditées ne bougent pas.
            </p>
          </fieldset>

          <fieldset className="space-y-3 border-t border-slate-100 pt-5">
            <legend className="text-sm font-semibold text-slate-900">Seuil minimum de retrait</legend>
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-700">Retrait possible dès</span>
              <span className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={seuil}
                  onChange={(e) => setSeuil(e.target.value)}
                  className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                />
                <span className="text-sm text-slate-500">F</span>
              </span>
            </label>
          </fieldset>

          <fieldset className="space-y-3 border-t border-slate-100 pt-5">
            <legend className="text-sm font-semibold text-slate-900">Avantage pour les inscrits avec un code</legend>
            {[
              { label: 'Jours offerts', value: joursOfferts, set: setJoursOfferts, unit: 'jours' },
              { label: 'Réduction sur le premier paiement', value: reduction, set: setReduction, unit: '%' },
            ].map((field) => (
              <label key={field.label} className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-700">{field.label}</span>
                <span className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={field.value}
                    onChange={(e) => field.set(e.target.value)}
                    className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                  />
                  <span className="w-10 text-sm text-slate-500">{field.unit}</span>
                </span>
              </label>
            ))}
            <p className="text-xs text-slate-400">
              Les jours s&apos;ajoutent aux 30 jours d&apos;essai. Un changement ne vaut que pour les inscriptions
              futures ; la commission de l&apos;affilié ne change pas avec la réduction.
            </p>
          </fieldset>

          <button
            type="submit"
            disabled={isSaving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {isSaving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      ) : null}
    </div>
  );
}
