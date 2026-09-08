'use client';

import { useEffect, useState } from 'react';
import { adminApi, adminErrorMessage } from '../../../_lib/adminApi';
import type { AdminBusiness, AdminBusinessUser, AdminPlan } from '../../../_lib/types';

export type ActionMode = 'extend-trial' | 'change-plan' | 'reset-pin';

const MODE_TITLES: Record<ActionMode, string> = {
  'extend-trial': "Prolonger l'essai",
  'change-plan': "Changer d'offre",
  'reset-pin': 'Réinitialiser un code PIN',
};

export function BusinessActionsModal({
  mode,
  business,
  plans,
  onClose,
  onDone,
}: {
  mode: ActionMode;
  business: AdminBusiness;
  plans: AdminPlan[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [jours, setJours] = useState(15);
  const [planId, setPlanId] = useState(business.planId ?? plans[0]?.id ?? '');
  const [users, setUsers] = useState<AdminBusinessUser[]>([]);
  const [userId, setUserId] = useState('');
  const [newPin, setNewPin] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'reset-pin') return;
    setIsLoadingUsers(true);
    adminApi
      .get<{ users: AdminBusinessUser[] }>(`/businesses/${business.id}/users`)
      .then((d) => {
        setUsers(d.users);
        setUserId(d.users[0]?.id ?? '');
      })
      .catch((err) => setError(adminErrorMessage(err)))
      .finally(() => setIsLoadingUsers(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, business.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (mode === 'extend-trial') {
        await adminApi.post(`/businesses/${business.id}/extend-trial`, { jours });
      } else if (mode === 'change-plan') {
        await adminApi.post(`/businesses/${business.id}/change-plan`, { planId });
      } else {
        await adminApi.post(`/businesses/${business.id}/reset-code`, { userId, newPin });
      }
      onDone();
    } catch (err) {
      setError(adminErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h2 className="text-base font-bold text-slate-900">{MODE_TITLES[mode]}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{business.nom}</p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}

          {mode === 'extend-trial' && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Nombre de jours</label>
              <input
                type="number"
                min={1}
                required
                value={jours}
                onChange={(e) => setJours(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </div>
          )}

          {mode === 'change-plan' && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Nouvelle offre</label>
              <select
                required
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {plans.length === 0 && <option value="">Aucune offre disponible</option>}
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom} — {p.prixMensuel.toLocaleString('fr-FR')} F/mois
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === 'reset-pin' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Utilisateur</label>
                <select
                  required
                  disabled={isLoadingUsers}
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {isLoadingUsers && <option value="">Chargement…</option>}
                  {!isLoadingUsers && users.length === 0 && <option value="">Aucun utilisateur</option>}
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nom} ({u.telephone}) — {u.role}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Nouveau code (4 chiffres)</label>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-center font-mono text-sm tracking-widest text-slate-900"
                  placeholder="0000"
                />
              </div>
            </>
          )}

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
              disabled={isSubmitting}
              className="flex-1 rounded-lg bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {isSubmitting ? 'Enregistrement…' : 'Confirmer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
