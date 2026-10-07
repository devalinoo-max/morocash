'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, adminErrorMessage } from '../../_lib/adminApi';
import type { AdminBusiness, AdminPushAudience, AdminPushBroadcast } from '../../_lib/types';

const TITRE_MAX = 60;
const MESSAGE_MAX = 240;

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Valeur d'un champ datetime-local (heure de l'ordinateur de l'admin) : « 2026-10-04T09:30 ». */
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Destinataires sans boutique précise. Les relances partent toutes seules (voir sendInactivityReminders). */
const CIBLE_LABELS: Partial<Record<AdminPushBroadcast['cible'], string>> = {
  TOUS: 'Toutes les boutiques',
  RELANCE_INACTIF: 'Relance auto : app pas ouverte depuis 3 jours',
  RELANCE_SANS_VENTE: 'Relance auto : aucune vente depuis 3 jours',
  RELANCE_EXPIRE: 'Relance auto : abonnement expiré',
};

const STATUT_BADGE: Record<AdminPushBroadcast['statut'], { label: string; className: string }> = {
  PROGRAMME: { label: 'Programmée', className: 'bg-amber-100 text-amber-800' },
  EN_COURS: { label: 'En cours', className: 'bg-indigo-100 text-indigo-800' },
  ENVOYE: { label: 'Envoyée', className: 'bg-emerald-100 text-emerald-800' },
  ANNULE: { label: 'Annulée', className: 'bg-slate-200 text-slate-600' },
};

export default function AdminNotificationsPage() {
  const [audience, setAudience] = useState<AdminPushAudience | null>(null);
  const [broadcasts, setBroadcasts] = useState<AdminPushBroadcast[]>([]);
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cible, setCible] = useState<'TOUS' | 'BOUTIQUE'>('TOUS');
  const [businessId, setBusinessId] = useState('');
  const [titre, setTitre] = useState('');
  const [message, setMessage] = useState('');
  const [lien, setLien] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<AdminPushBroadcast | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [quand, setQuand] = useState<'MAINTENANT' | 'PROGRAMMER'>('MAINTENANT');
  const [programmeLe, setProgrammeLe] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await adminApi.get<{ audience: AdminPushAudience; broadcasts: AdminPushBroadcast[] }>(
        '/notifications'
      );
      setAudience(data.audience);
      setBroadcasts(data.broadcasts);
    } catch (err) {
      setError(adminErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    adminApi
      .get<{ businesses: AdminBusiness[] }>('/businesses?limit=200')
      .then((d) => setBusinesses(d.businesses))
      .catch(() => setBusinesses([]));
  }, [load]);

  const canSend =
    titre.trim() !== '' &&
    message.trim() !== '' &&
    (cible === 'TOUS' || businessId !== '') &&
    (quand === 'MAINTENANT' || programmeLe !== '');

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    const destinataire =
      cible === 'TOUS'
        ? `toutes les boutiques (${audience?.appareils ?? 0} appareil(s) abonné(s))`
        : `la boutique « ${businesses.find((b) => b.id === businessId)?.nom ?? ''} »`;

    let programmeIso: string | undefined;
    if (quand === 'PROGRAMMER') {
      const date = new Date(programmeLe);
      if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
        setSendError('Choisis une date d’envoi dans le futur.');
        return;
      }
      programmeIso = date.toISOString();
      if (!window.confirm(`Programmer cette notification pour ${destinataire}, le ${formatDateTime(programmeIso)} ?`)) return;
    } else if (!window.confirm(`Envoyer cette notification à ${destinataire} ? Elle ne pourra pas être annulée.`)) {
      return;
    }

    setIsSending(true);
    setSendError(null);
    setLastResult(null);
    setLastError(null);
    try {
      const { broadcast, premiereErreur } = await adminApi.post<{
        broadcast: AdminPushBroadcast;
        premiereErreur: string | null;
      }>('/notifications', {
        titre,
        message,
        lien,
        cible,
        ...(cible === 'BOUTIQUE' ? { businessId } : {}),
        ...(programmeIso ? { programmeLe: programmeIso } : {}),
      });
      setLastResult(broadcast);
      setLastError(premiereErreur);
      setTitre('');
      setMessage('');
      setLien('');
      setProgrammeLe('');
      await load();
    } catch (err) {
      setSendError(adminErrorMessage(err));
    } finally {
      setIsSending(false);
    }
  }

  async function handleCancel(b: AdminPushBroadcast) {
    if (!window.confirm(`Annuler la notification « ${b.titre} » programmée le ${formatDateTime(b.programmeLe!)} ?`)) return;
    setCancellingId(b.id);
    setError(null);
    try {
      await adminApi.post(`/notifications/${b.id}/cancel`);
      await load();
    } catch (err) {
      setError(adminErrorMessage(err));
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Notifications</h1>
        <p className="mt-1 text-sm text-slate-500">
          Envoie une notification sur les téléphones et ordinateurs des commerçants qui les ont activées.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <form
          onSubmit={handleSend}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2"
        >
          <h2 className="text-sm font-bold text-slate-900">Nouvelle notification</h2>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Destinataires</label>
            <div className="flex flex-wrap items-center gap-2">
              {(['TOUS', 'BOUTIQUE'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCible(value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    cible === value
                      ? 'bg-indigo-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {value === 'TOUS' ? 'Toutes les boutiques' : 'Une boutique'}
                </button>
              ))}
              {cible === 'BOUTIQUE' && (
                <select
                  value={businessId}
                  onChange={(e) => setBusinessId(e.target.value)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                >
                  <option value="">Choisir une boutique…</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nom}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="notif-titre" className="text-xs font-semibold text-slate-600">
                Titre
              </label>
              <span className="text-[11px] text-slate-400">
                {titre.length}/{TITRE_MAX}
              </span>
            </div>
            <input
              id="notif-titre"
              type="text"
              value={titre}
              maxLength={TITRE_MAX}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="Nouvelle fonctionnalité disponible"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="notif-message" className="text-xs font-semibold text-slate-600">
                Message
              </label>
              <span className="text-[11px] text-slate-400">
                {message.length}/{MESSAGE_MAX}
              </span>
            </div>
            <textarea
              id="notif-message"
              value={message}
              maxLength={MESSAGE_MAX}
              rows={3}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tu peux maintenant ajouter des frais de livraison à tes commandes."
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="notif-lien" className="text-xs font-semibold text-slate-600">
              Page à ouvrir au clic <span className="font-normal text-slate-400">(facultatif, sinon l&apos;accueil)</span>
            </label>
            <input
              id="notif-lien"
              type="text"
              value={lien}
              onChange={(e) => setLien(e.target.value)}
              placeholder="/abonnement"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Envoi</label>
            <div className="flex flex-wrap items-center gap-2">
              {(['MAINTENANT', 'PROGRAMMER'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setQuand(value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    quand === value
                      ? 'bg-indigo-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {value === 'MAINTENANT' ? 'Maintenant' : 'Programmer'}
                </button>
              ))}
              {quand === 'PROGRAMMER' && (
                <input
                  type="datetime-local"
                  value={programmeLe}
                  min={toLocalInputValue(new Date())}
                  onChange={(e) => setProgrammeLe(e.target.value)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                />
              )}
            </div>
            {quand === 'PROGRAMMER' && (
              <p className="text-[11px] text-slate-400">
                Heure de ton ordinateur. L&apos;envoi part dans les 5 à 10 minutes qui suivent l&apos;heure choisie.
              </p>
            )}
          </div>

          {sendError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{sendError}</div>
          )}
          {lastResult && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {lastResult.statut === 'PROGRAMME'
                ? `Notification programmée pour le ${formatDateTime(lastResult.programmeLe!)}.`
                : lastResult.appareils === 0
                  ? 'Notification enregistrée, mais aucun appareil abonné pour ces destinataires.'
                  : `Notification envoyée à ${lastResult.envoyes} appareil(s) sur ${lastResult.appareils}.`}
              {lastResult.echecs > 0 && ` ${lastResult.echecs} échec(s).`}
            </div>
          )}
          {lastError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Motif du premier échec : <span className="font-mono">{lastError}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!canSend || isSending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSending ? 'Envoi…' : quand === 'PROGRAMMER' ? 'Programmer la notification' : 'Envoyer la notification'}
            </button>
          </div>
        </form>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Appareils abonnés</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{isLoading ? '…' : (audience?.appareils ?? 0)}</p>
            <p className="mt-1 text-xs text-slate-500">
              dans {isLoading ? '…' : (audience?.boutiques ?? 0)} boutique(s). Les commerçants activent les
              notifications dans Réglages &gt; Mon compte.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Aperçu</p>
            <div className="mt-3 flex gap-3 rounded-xl bg-slate-100 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://www.morocash.net/icons/icon-192.png" alt="" className="h-9 w-9 rounded-lg" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{titre || 'Titre de la notification'}</p>
                <p className="line-clamp-3 text-xs text-slate-600">{message || 'Le message apparaîtra ici.'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-bold text-slate-900">Historique des envois</h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Notification</th>
                <th className="px-4 py-3">Destinataires</th>
                <th className="px-4 py-3 text-right">Reçues</th>
                <th className="px-4 py-3 text-right">Échecs</th>
                <th className="px-4 py-3">Statut</th>
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
              {!isLoading && broadcasts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Aucune notification pour l&apos;instant.
                  </td>
                </tr>
              )}
              {broadcasts.map((b) => (
                <tr key={b.id} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatDateTime(b.envoyeLe ?? b.programmeLe ?? b.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{b.titre}</p>
                    <p className="text-xs text-slate-500">{b.message}</p>
                    {b.lien && <p className="mt-0.5 font-mono text-[11px] text-indigo-600">{b.lien}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {CIBLE_LABELS[b.cible] ?? b.businessNom ?? 'Boutique supprimée'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {b.statut === 'ENVOYE' ? `${b.envoyes}/${b.appareils}` : '—'}
                  </td>
                  <td className={`px-4 py-3 text-right ${b.echecs > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>
                    {b.statut === 'ENVOYE' ? b.echecs : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUT_BADGE[b.statut].className}`}>
                      {STATUT_BADGE[b.statut].label}
                    </span>
                    {b.statut === 'PROGRAMME' && (
                      <button
                        type="button"
                        onClick={() => handleCancel(b)}
                        disabled={cancellingId === b.id}
                        className="mt-1.5 block text-[11px] font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
                      >
                        {cancellingId === b.id ? 'Annulation…' : 'Annuler'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
