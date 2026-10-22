import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarCheck, Crown, Loader2, X } from 'lucide-react';
import { formatMoney } from '../../utils/formatters';
import { PLANS } from '../../data/plans';
import { generateClientUuid } from '../../api/client';
import {
  fetchRenewalQuote,
  startSubscriptionCheckout,
  type RenewalQuote,
  type SubscriptionPeriod,
} from '../../api/subscriptions';

/** Durées proposées pour prolonger : 1, 3 et 12 mois. */
const DUREES: SubscriptionPeriod[] = ['MENSUEL', 'TRIMESTRIEL', 'ANNUEL'];
const PLUS_CHOISI: SubscriptionPeriod = 'ANNUEL';

/** 05/11/2026 */
export const formatDateCourte = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');

interface RenewSheetProps {
  planCode: 'SOLO' | 'BUSINESS';
  onClose: () => void;
  onError: (message: string) => void;
  /** Formule Solo : ouvre le passage à Business (jours restants convertis au prorata). */
  onUpgrade?: () => void;
}

/**
 * « Prolonger mon abonnement » : même formule, 1, 3 ou 12 mois.
 *
 * Tout ce qui est affiché — prix, nouvelle date de fin, durée bloquée par le
 * plafond de 12 mois d'avance — vient du devis du serveur. L'écran ne calcule
 * aucune date : il relit celle que le serveur appliquera.
 */
export const RenewSheet: React.FC<RenewSheetProps> = ({ planCode, onClose, onError, onUpgrade }) => {
  const [quote, setQuote] = useState<RenewalQuote | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SubscriptionPeriod>('TRIMESTRIEL');
  const [paying, setPaying] = useState(false);
  // Un identifiant par durée, tiré une seule fois : deux clics sur « Payer »
  // envoient le même, et le serveur n'ouvre qu'un seul paiement.
  const clientUuids = useRef<Partial<Record<SubscriptionPeriod, string>>>({});

  useEffect(() => {
    let cancelled = false;
    fetchRenewalQuote(planCode)
      .then((q) => {
        if (cancelled) return;
        setQuote(q);
        // Durée par défaut : 3 mois, ou la première encore possible.
        const possibles = q.options.filter((o) => DUREES.includes(o.periode) && !o.bloque);
        if (!possibles.some((o) => o.periode === 'TRIMESTRIEL') && possibles[0]) setSelected(possibles[0].periode);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Impossible de calculer la prolongation.');
      });
    return () => {
      cancelled = true;
    };
  }, [planCode]);

  const options = quote?.options.filter((o) => DUREES.includes(o.periode)) ?? [];
  const choix = options.find((o) => o.periode === selected) ?? null;

  const pay = async () => {
    if (!choix || choix.bloque || paying) return;
    setPaying(true);
    const clientUuid = (clientUuids.current[choix.periode] ??= generateClientUuid());
    try {
      const { redirectUrl } = await startSubscriptionCheckout(planCode, choix.periode, clientUuid);
      window.location.assign(redirectUrl);
    } catch (error) {
      setPaying(false);
      onError(error instanceof Error ? error.message : 'Impossible de lancer le paiement.');
    }
  };

  const planLabel = planCode === 'BUSINESS' ? 'Business' : 'Solo';
  const rappel = !quote
    ? null
    : quote.enEssai
    ? `Formule ${planLabel} · essai gratuit en cours (il prend fin au paiement)`
    : quote.joursRestants > 0 && quote.dateFinActuelle
    ? `Formule ${planLabel} · active jusqu’au ${formatDateCourte(quote.dateFinActuelle)} (${quote.joursRestants} jour${quote.joursRestants > 1 ? 's' : ''} restant${quote.joursRestants > 1 ? 's' : ''})`
    : quote.dateFinActuelle
    ? `Formule ${planLabel} · expirée le ${formatDateCourte(quote.dateFinActuelle)}`
    : `Formule ${planLabel}`;

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
      onClick={() => !paying && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="renew-sheet-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 space-y-5 max-h-[92vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 id="renew-sheet-title" className="text-lg font-extrabold text-mc-ink">
              Prolonger mon abonnement
            </h3>
            {rappel && <p className="text-xs font-semibold text-mc-soft">{rappel}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={paying}
            aria-label="Fermer"
            className="shrink-0 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        {loadError ? (
          <p className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-900">{loadError}</p>
        ) : !quote ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#5B4BF0]" />
          </div>
        ) : (
          <>
            <div role="radiogroup" aria-label="Durée" className="grid grid-cols-3 gap-2.5">
              {options.map((o) => {
                const isSelected = o.periode === selected;
                return (
                  <button
                    key={o.periode}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={o.bloque || paying}
                    onClick={() => setSelected(o.periode)}
                    className={`relative pt-4 pb-3 px-2 rounded-2xl border-2 text-center transition-all ${
                      o.bloque
                        ? 'border-mc-line bg-slate-50 text-slate-400 cursor-not-allowed'
                        : isSelected
                        ? 'border-[#5B4BF0] bg-[#EEF2FF] cursor-pointer'
                        : 'border-mc-line bg-white hover:border-slate-300 cursor-pointer'
                    }`}
                  >
                    {o.periode === PLUS_CHOISI && !o.bloque && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-extrabold uppercase tracking-wide">
                        Le plus choisi
                      </span>
                    )}
                    <span className="block text-xs font-extrabold">{o.mois} mois</span>
                    <span className={`block text-sm font-extrabold mt-1 ${o.bloque ? '' : 'text-mc-ink'}`}>
                      {formatMoney(o.montant)}
                    </span>
                    {o.bloque && <span className="block text-[10px] font-semibold mt-1 leading-tight">Déjà 12 mois d’avance</span>}
                  </button>
                );
              })}
            </div>

            {choix && !choix.bloque && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
                <CalendarCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                <p className="text-sm text-emerald-950">
                  Ton abonnement ira jusqu’au <strong>{formatDateCourte(choix.dateFinApres)}</strong>
                </p>
              </div>
            )}
            {options.length > 0 && options.every((o) => o.bloque) && (
              <p className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-950">
                Tu as déjà près de 12 mois payés d’avance : reviens plus près de ta date de fin pour prolonger.
              </p>
            )}

            <button
              type="button"
              onClick={() => void pay()}
              disabled={!choix || choix.bloque || paying}
              className="w-full py-3.5 rounded-full bg-mc-primary hover:bg-mc-primary-dark text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {paying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Ouverture du paiement…</span>
                </>
              ) : (
                <>
                  <span>Payer {choix ? formatMoney(choix.montant) : ''}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            <p className="text-[11px] text-center text-mc-soft">
              Paiement unique par Mobile Money, sans prélèvement automatique. Les jours qui te restent ne sont jamais perdus.
            </p>
          </>
        )}

        {/* Montée en gamme : visible sur Solo, même si le devis n'a pas pu se charger. */}
        {onUpgrade && (
          <div className="p-4 rounded-2xl border-2 border-[#DAD6FC] bg-mc-primary-tint space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#5B4BF0] text-white flex items-center justify-center shrink-0">
                <Crown className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-extrabold text-mc-ink">
                  Passe à Business · {formatMoney(PLANS.BUSINESS.prixMensuel)} / mois
                </p>
                <p className="text-[11px] text-slate-600 leading-snug">
                  Jusqu’à {PLANS.BUSINESS.maxUsers} utilisateurs, commandes et produits illimités, export Excel. Tes jours
                  de Solo restants sont convertis en jours de Business.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onUpgrade}
              disabled={paying}
              className="w-full py-2.5 rounded-full bg-white border-2 border-[#5B4BF0] text-[#5B4BF0] font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[#EEF2FF] disabled:opacity-50"
            >
              <span>Voir la formule Business</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
