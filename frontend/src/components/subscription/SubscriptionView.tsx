import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Crown,
  Check,
  ArrowRight,
  ShieldCheck,
  Users,
  Sparkles,
  TrendingUp,
  FileSpreadsheet,
  MessageCircle,
  HeartHandshake,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { formatMoney, formatPaymentMethod } from '../../utils/formatters';
import {
  PLANS,
  getAnnualSavings,
  PRICING_JUSTIFICATION,
} from '../../data/plans';
import { ApiError } from '../../api/client';
import {
  fetchSubscriptionOverview,
  fetchSubscriptionPayment,
  startSubscriptionCheckout,
  type SubscriptionOverview,
  type SubscriptionPaymentStatus,
} from '../../api/subscriptions';

interface SubscriptionViewProps {
  onBack?: () => void;
}

/** Paramètre ajouté à l'adresse de retour par le backend (voir startCheckout). */
const RETURN_PARAM = 'paiement';
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 40; // ~2 minutes

type ReturnState =
  | { phase: 'checking' }
  | { phase: 'done'; payment: SubscriptionPaymentStatus }
  | { phase: 'pending' }
  | { phase: 'error'; message: string };

export const SubscriptionView: React.FC<SubscriptionViewProps> = ({ onBack }) => {
  const { settings, showToast, refreshPlanStatus } = useApp();

  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [checkoutPlan, setCheckoutPlan] = useState<'SOLO' | 'BUSINESS' | null>(null);
  const [returnState, setReturnState] = useState<ReturnState | null>(null);
  const [overview, setOverview] = useState<SubscriptionOverview | null>(null);

  const loadOverview = () =>
    fetchSubscriptionOverview()
      .then(setOverview)
      .catch(() => undefined); // hors ligne : la page reste utilisable sans le détail

  useEffect(() => {
    void loadOverview();
  }, []);

  const currentPlan = settings.planStatus; // 'TRIAL' | 'SOLO' | 'BUSINESS' | 'EXPIRED'
  const trialDaysLeft = settings.trialDaysLeft || 14;

  const soloSavings = getAnnualSavings('SOLO');
  const businessSavings = getAnnualSavings('BUSINESS');

  // Retour de la page de paiement pawaPay : /abonnement?paiement=<id>. Le
  // retour seul ne prouve rien — on interroge le serveur, qui relit le statut
  // chez pawaPay, jusqu'à obtenir un résultat final.
  useEffect(() => {
    const paymentId = new URLSearchParams(window.location.search).get(RETURN_PARAM);
    if (!paymentId) return;
    window.history.replaceState(null, '', window.location.pathname);

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setReturnState({ phase: 'checking' });

    const poll = async (attempt: number) => {
      try {
        const payment = await fetchSubscriptionPayment(paymentId);
        if (cancelled) return;
        if (payment.statut !== 'EN_ATTENTE') {
          setReturnState({ phase: 'done', payment });
          if (payment.statut === 'REUSSI') {
            await refreshPlanStatus().catch(() => undefined);
            await loadOverview();
            if (!cancelled) showToast('Paiement reçu : ton abonnement est actif.', 'success');
          }
          return;
        }
      } catch (error) {
        if (cancelled) return;
        if (!(error instanceof ApiError) || error.code !== 'NETWORK_ERROR') {
          setReturnState({ phase: 'error', message: error instanceof Error ? error.message : 'Vérification impossible.' });
          return;
        }
      }
      if (attempt + 1 >= POLL_MAX_ATTEMPTS) {
        setReturnState({ phase: 'pending' });
        return;
      }
      timer = setTimeout(() => void poll(attempt + 1), POLL_INTERVAL_MS);
    };
    void poll(0);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Une seule fois, au retour de pawaPay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectPlan = async (targetPlan: 'SOLO' | 'BUSINESS') => {
    if (targetPlan === currentPlan) {
      showToast(`Tu es déjà sur la formule ${PLANS[targetPlan].nom}`, 'info');
      return;
    }
    if (checkoutPlan) return;

    setCheckoutPlan(targetPlan);
    try {
      const { redirectUrl } = await startSubscriptionCheckout(
        targetPlan,
        billingCycle === 'ANNUAL' ? 'ANNUEL' : 'MENSUEL'
      );
      window.location.assign(redirectUrl);
    } catch (error) {
      setCheckoutPlan(null);
      showToast(error instanceof Error ? error.message : 'Impossible de lancer le paiement.', 'error');
    }
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-200">
      {returnState && (
        <PaymentReturnBanner state={returnState} onClose={() => setReturnState(null)} />
      )}

      {/* Top Header Card */}
      <div className="p-6 sm:p-7 rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-60 h-60 bg-[#4F46E5]/20 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 text-xs font-bold border border-amber-400/30">
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span>Abonnement MoroCash</span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              {currentPlan === 'TRIAL'
                ? `Essai gratuit de 14 jours`
                : currentPlan === 'BUSINESS'
                ? `Formule active : Business`
                : currentPlan === 'SOLO'
                ? `Formule active : Solo`
                : `Abonnement expiré`}
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
              {currentPlan === 'TRIAL' ? (
                <>
                  Il te reste <strong className="text-amber-400">{trialDaysLeft} jours</strong> d'essai complet.
                  Pendant l'essai, le tarif de référence est celui du plan{' '}
                  <strong className="text-white">Solo ({formatMoney(PLANS.SOLO.prixMensuel)} / mois)</strong>.
                </>
              ) : currentPlan === 'BUSINESS' ? (
                <>
                  Accès complet pour toute ton équipe (jusqu'à 5 personnes), produits illimités et export Excel.
                </>
              ) : currentPlan === 'SOLO' ? (
                <>
                  Tu vends tout seul, avec jusqu'à 1 000 produits et toutes les fonctionnalités de caisse.
                </>
              ) : (
                <>
                  La saisie de nouvelles ventes est bloquée. Choisis une formule ci-dessous pour retrouver un accès complet — ton
                  historique reste 100% intact.
                </>
              )}
            </p>
          </div>

          {/* Quick status pill */}
          <div className="p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-center sm:text-right shrink-0">
            <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
              Statut du compte
            </span>
            <span className={`text-base font-black block mt-0.5 ${currentPlan === 'EXPIRED' ? 'text-rose-400' : 'text-amber-400'}`}>
              {currentPlan === 'TRIAL' ? 'Période d’essai' : currentPlan === 'EXPIRED' ? 'Expiré' : 'Abonnement actif'}
            </span>
            <span className="text-[11px] text-slate-300 mt-1 block">
              Historique 100% garanti à vie
            </span>
          </div>
        </div>
      </div>

      {/* Mon abonnement : visible dès qu'une formule a été payée */}
      {overview?.current && <MySubscriptionCard overview={overview} />}

      {/* Billing Cycle Switcher */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <div className="bg-slate-100 p-1.5 rounded-2xl border border-slate-200/90 inline-flex items-center gap-1 shadow-inner">
          <button
            onClick={() => setBillingCycle('MONTHLY')}
            className={`px-5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              billingCycle === 'MONTHLY'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Facturation Mensuelle
          </button>
          <button
            onClick={() => setBillingCycle('ANNUAL')}
            className={`px-5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 ${
              billingCycle === 'ANNUAL'
                ? 'bg-[#4F46E5] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Facturation Annuelle</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                billingCycle === 'ANNUAL'
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              2 mois offerts
            </span>
          </button>
        </div>
      </div>

      {/* Two Offer Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto items-stretch">
        {/* ========================================================
            CARD 1 : SOLO (15 000 F / mois | 150 000 F / an)
           ======================================================== */}
        <div
          className={`bg-white rounded-3xl p-6 sm:p-7 border transition-all flex flex-col justify-between space-y-6 ${
            currentPlan === 'SOLO'
              ? 'border-2 border-[#4F46E5] ring-4 ring-indigo-50 shadow-md'
              : 'border-slate-200/90 hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                  Formule Solo
                </span>
                <h3 className="text-2xl font-black text-slate-900 mt-0.5">
                  {PLANS.SOLO.nom}
                </h3>
                {/* Baseline imposée par les spécifications */}
                <p className="text-xs font-bold text-[#4F46E5] mt-1">
                  "{PLANS.SOLO.baseline}"
                </p>
              </div>

              {currentPlan === 'SOLO' && (
                <span className="px-3 py-1 rounded-full text-xs font-black bg-indigo-50 text-[#4F46E5] border border-indigo-200">
                  Formule actuelle
                </span>
              )}
            </div>

            {/* Price display */}
            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/70 space-y-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl sm:text-4xl font-black text-slate-900">
                  {formatMoney(
                    billingCycle === 'MONTHLY'
                      ? PLANS.SOLO.prixMensuel
                      : PLANS.SOLO.prixAnnuel
                  )}
                </span>
                <span className="text-xs font-bold text-slate-500">
                  {billingCycle === 'MONTHLY' ? '/ mois' : '/ an'}
                </span>
              </div>

              {billingCycle === 'ANNUAL' ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-extrabold">
                  <span>tu économises {formatMoney(soloSavings)} par an</span>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  Renouvelable chaque mois par Mobile Money
                </p>
              )}
            </div>

            {/* Feature List */}
            <div className="space-y-2.5 pt-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Ce qui est inclus :
              </span>
              <ul className="space-y-2.5 text-xs text-slate-700 font-medium">
                <li className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[2.5]" />
                  <span><strong>1 utilisateur unique</strong> (propriétaire)</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[2.5]" />
                  <span>Jusqu’à <strong>1 000 produits</strong> en catalogue</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[2.5]" />
                  <span>Commandes & clients illimités</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[2.5]" />
                  <span><strong>Ce que tu as gagné</strong> inclus pour toujours</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[2.5]" />
                  <span>Caisse, dépenses, reçus WhatsApp et étiquettes</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[2.5]" />
                  <span>Historique illimité (jamais bloqué)</span>
                </li>
                <li className="flex items-center gap-2.5 text-slate-400">
                  <span className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold">
                    ✕
                  </span>
                  <span>Employés et permissions (réservé Business)</span>
                </li>
                <li className="flex items-center gap-2.5 text-slate-400">
                  <span className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold">
                    ✕
                  </span>
                  <span>Export Excel / CSV (réservé Business)</span>
                </li>
              </ul>
            </div>
          </div>

          <button
            onClick={() => void handleSelectPlan('SOLO')}
            disabled={currentPlan === 'SOLO' || checkoutPlan !== null}
            className={`w-full py-3.5 rounded-2xl font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-2 ${
              currentPlan === 'SOLO'
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-white hover:bg-slate-50 text-slate-800 border-2 border-slate-200 hover:border-slate-300 shadow-xs'
            }`}
          >
            {checkoutPlan === 'SOLO' && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>
              {currentPlan === 'SOLO'
                ? 'Formule déjà active'
                : checkoutPlan === 'SOLO'
                ? 'Ouverture du paiement…'
                : 'Choisir la formule Solo'}
            </span>
          </button>
        </div>

        {/* ========================================================
            CARD 2 : BUSINESS (20 000 F / mois | 200 000 F / an)
           ======================================================== */}
        <div
          className={`bg-white rounded-3xl p-6 sm:p-7 border-2 transition-all flex flex-col justify-between space-y-6 relative ${
            currentPlan === 'BUSINESS'
              ? 'border-emerald-500 ring-4 ring-emerald-50 shadow-lg'
              : 'border-[#4F46E5] shadow-xl'
          }`}
        >
          {/* Top highlight badge */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[#4F46E5] text-white text-[11px] font-black tracking-wide shadow-md">
            ⭐ RECOMMANDÉ POUR ÉQUIPES
          </div>

          <div className="space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600">
                  Formule Équipe
                </span>
                <h3 className="text-2xl font-black text-slate-900 mt-0.5">
                  {PLANS.BUSINESS.nom}
                </h3>
                {/* Baseline imposée par les spécifications */}
                <p className="text-xs font-bold text-emerald-600 mt-1">
                  "{PLANS.BUSINESS.baseline}"
                </p>
              </div>

              {currentPlan === 'BUSINESS' ? (
                <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Formule actuelle
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-xs font-black bg-indigo-50 text-[#4F46E5] border border-indigo-200">
                  Équipe
                </span>
              )}
            </div>

            {/* Price display */}
            <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl sm:text-4xl font-black text-slate-900">
                  {formatMoney(
                    billingCycle === 'MONTHLY'
                      ? PLANS.BUSINESS.prixMensuel
                      : PLANS.BUSINESS.prixAnnuel
                  )}
                </span>
                <span className="text-xs font-bold text-slate-500">
                  {billingCycle === 'MONTHLY' ? '/ mois' : '/ an'}
                </span>
              </div>

              {billingCycle === 'ANNUAL' ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-xs font-extrabold">
                  <span>tu économises {formatMoney(businessSavings)} par an</span>
                </div>
              ) : (
                <p className="text-[11px] text-indigo-700 font-medium">
                  Seulement 5 000 F de plus que Solo pour toute ton équipe
                </p>
              )}
            </div>

            {/* Feature List */}
            <div className="space-y-2.5 pt-2">
              <span className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider block">
                Tout ce qui est dans Solo + :
              </span>
              <ul className="space-y-2.5 text-xs text-slate-800 font-medium">
                <li className="flex items-center gap-2.5 font-bold text-slate-950">
                  <Users className="w-4 h-4 text-[#4F46E5] shrink-0 stroke-[2.5]" />
                  <span>Jusqu’à <strong>5 employés et vendeurs</strong> autorisés</span>
                </li>
                <li className="flex items-center gap-2.5 font-bold text-slate-950">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[2.5]" />
                  <span><strong>Produits illimités</strong> (aucun quota)</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[2.5]" />
                  <span>Permissions strictes (marges et bénéfices masqués)</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[2.5]" />
                  <span>Rapports comparatifs de périodes (hier / semaine / mois)</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Export des données sous <strong>Excel / CSV</strong></span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[2.5]" />
                  <span>Suivi des clôtures de caisse par vendeur</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Assistance <strong>WhatsApp prioritaire 7j/7</strong></span>
                </li>
              </ul>
            </div>
          </div>

          <button
            onClick={() => void handleSelectPlan('BUSINESS')}
            disabled={currentPlan === 'BUSINESS' || checkoutPlan !== null}
            className={`w-full py-3.5 rounded-2xl font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md ${
              currentPlan === 'BUSINESS'
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                : 'bg-[#4F46E5] hover:bg-indigo-700 text-white shadow-indigo-200'
            }`}
          >
            {currentPlan === 'BUSINESS' ? (
              <span>Formule active</span>
            ) : checkoutPlan === 'BUSINESS' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Ouverture du paiement…</span>
              </>
            ) : currentPlan === 'SOLO' ? (
              <span>Passer en Business</span>
            ) : (
              <span>Choisir la formule Business</span>
            )}
            {currentPlan !== 'BUSINESS' && checkoutPlan !== 'BUSINESS' && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. JUSTIFIER LE PRIX SUR LA PAGE : ENCADRÉ DISCRET FOND #F8FAFC */}
      {/* ========================================================================= */}
      <div className="max-w-4xl mx-auto p-5 sm:p-6 rounded-2xl bg-[#F8FAFC] border border-slate-200 text-slate-800 space-y-2 text-center sm:text-left">
        <p className="text-xs sm:text-sm font-semibold leading-relaxed text-slate-700">
          "{PRICING_JUSTIFICATION.quote}"
        </p>
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          MoroCash s'autofinance dès ta première semaine d'utilisation.
        </p>
      </div>

      {/* Mobile Money Payment Methods */}
      <div className="max-w-3xl mx-auto text-center space-y-3 pt-2">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
          Paiement local sécurisé par Mobile Money (Côte d'Ivoire, Sénégal, Bénin, Togo, Mali, Burkina Faso)
        </span>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <span className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-black text-sky-600 shadow-2xs">
            Wave (0% frais)
          </span>
          <span className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-black text-orange-600 shadow-2xs">
            Orange Money
          </span>
          <span className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-black text-amber-600 shadow-2xs">
            MTN MoMo
          </span>
          <span className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-black text-blue-600 shadow-2xs">
            Moov Money
          </span>
        </div>
      </div>

      {/* RÈGLE INCHANGÉE : L'historique n'est JAMAIS limité par le plan */}
      <div className="max-w-3xl mx-auto p-5 rounded-2xl bg-amber-50/70 border border-amber-200 text-amber-950 flex items-start gap-3.5">
        <div className="w-8 h-8 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center shrink-0">
          <HeartHandshake className="w-4 h-4" />
        </div>
        <div className="space-y-1 text-xs">
          <h4 className="font-extrabold text-slate-900">
            Règle MoroCash inchangeable :
          </h4>
          <p className="text-slate-700 leading-relaxed">
            <strong>"Ce que tu as gagné"</strong> est inclus dans TOUS les plans. De plus,{' '}
            <strong>l'historique de tes ventes et de tes clients n'est JAMAIS limité</strong> par ton abonnement.
            Même si tu fais une pause, tes données restent toujours consultables gratuitement.
          </p>
        </div>
      </div>

    </div>
  );
};

const formatLongDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

const periodeLabel = (periode: 'MENSUEL' | 'ANNUEL' | null) =>
  periode === 'ANNUEL' ? 'Annuel' : periode === 'MENSUEL' ? 'Mensuel' : '—';

const methodLabel = (methode: string) => (methode === 'AUTRE' ? 'Mobile Money' : formatPaymentMethod(methode));

const planLabel = (code: 'SOLO' | 'BUSINESS' | null) =>
  code === 'BUSINESS' ? 'Business' : code === 'SOLO' ? 'Solo' : '—';

/** Détail de la formule payée : dates, jours restants, dernier paiement et historique. */
const MySubscriptionCard: React.FC<{ overview: SubscriptionOverview }> = ({ overview }) => {
  const { current, payments, joursRestants, subscriptionEndsAt } = overview;
  if (!current) return null;

  const lastPayment = payments[0] ?? null;
  const expired = joursRestants === 0;
  // Barre de progression sur la période en cours uniquement.
  const start = new Date(current.dateDebut).getTime();
  const end = new Date(current.dateFin).getTime();
  const elapsed = end > start ? Math.min(1, Math.max(0, (Date.now() - start) / (end - start))) : 1;
  // Des périodes déjà payées d'avance prolongent au-delà de la période en cours.
  const hasPrepaid = !!subscriptionEndsAt && new Date(subscriptionEndsAt).getTime() > end;

  return (
    <section className="max-w-5xl mx-auto bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
      <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100">
        <div className="space-y-1">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Mon abonnement</span>
          <h3 className="text-xl font-black text-slate-900">
            Formule {overview.planNom ?? planLabel(overview.planCode)}{' '}
            <span className="text-sm font-bold text-slate-500">· {periodeLabel(current.periode)}</span>
          </h3>
        </div>
        <span
          className={`self-start px-3 py-1 rounded-full text-xs font-black border ${
            expired ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }`}
        >
          {expired ? 'Expiré' : 'Actif'}
        </span>
      </div>

      <div className="p-5 sm:p-6 space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <InfoTile label="Début de la période" value={formatLongDate(current.dateDebut)} />
          <InfoTile
            label={expired ? 'Terminé le' : 'Actif jusqu’au'}
            value={subscriptionEndsAt ? formatLongDate(subscriptionEndsAt) : formatLongDate(current.dateFin)}
          />
          <InfoTile
            label="Jours restants"
            value={joursRestants === null ? '—' : `${joursRestants} jour${joursRestants > 1 ? 's' : ''}`}
            highlight={!expired && joursRestants !== null && joursRestants <= 5}
          />
          <InfoTile
            label="Dernier paiement"
            value={lastPayment ? formatMoney(lastPayment.montant) : '—'}
            sub={lastPayment ? `${methodLabel(lastPayment.methode)} · ${formatLongDate(lastPayment.date)}` : undefined}
          />
        </div>

        <div className="space-y-1.5">
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${expired ? 'bg-rose-400' : 'bg-[#4F46E5]'}`}
              style={{ width: `${Math.round(elapsed * 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500">
            Période du {formatLongDate(current.dateDebut)} au {formatLongDate(current.dateFin)}
            {hasPrepaid && subscriptionEndsAt ? ` · déjà payé jusqu’au ${formatLongDate(subscriptionEndsAt)}` : ''}
          </p>
        </div>

        {payments.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-extrabold text-slate-900">Historique des paiements</h4>
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left font-bold px-3 py-2">Date</th>
                    <th className="text-left font-bold px-3 py-2">Formule</th>
                    <th className="text-left font-bold px-3 py-2">Période couverte</th>
                    <th className="text-left font-bold px-3 py-2">Moyen</th>
                    <th className="text-left font-bold px-3 py-2">Référence</th>
                    <th className="text-right font-bold px-3 py-2">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => (
                    <tr key={p.paymentId} className="text-slate-700">
                      <td className="px-3 py-2.5 whitespace-nowrap">{formatLongDate(p.date)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-semibold">
                        {planLabel(p.planCode)} · {periodeLabel(p.periode).toLowerCase()}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {p.dateDebut && p.dateFin ? `${formatLongDate(p.dateDebut)} → ${formatLongDate(p.dateFin)}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{methodLabel(p.methode)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-mono text-[11px] text-slate-500">
                        {p.referencePasserelle ?? p.paymentId.slice(0, 8)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-right font-black text-slate-900">
                        {formatMoney(p.montant)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

const InfoTile: React.FC<{ label: string; value: string; sub?: string; highlight?: boolean }> = ({
  label,
  value,
  sub,
  highlight,
}) => (
  <div className={`p-3 rounded-2xl border ${highlight ? 'bg-amber-50 border-amber-200' : 'bg-slate-50/80 border-slate-200/70'}`}>
    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">{label}</span>
    <span className={`text-sm font-black block mt-0.5 ${highlight ? 'text-amber-800' : 'text-slate-900'}`}>{value}</span>
    {sub && <span className="text-[11px] text-slate-500 block mt-0.5">{sub}</span>}
  </div>
);

const PaymentReturnBanner: React.FC<{ state: ReturnState; onClose: () => void }> = ({ state, onClose }) => {
  let tone = 'bg-slate-50 border-slate-200 text-slate-800';
  let icon = <Loader2 className="w-5 h-5 animate-spin text-[#4F46E5]" />;
  let title = 'Vérification de ton paiement…';
  let text = 'Valide le paiement sur ton téléphone si ce n’est pas encore fait. Ne ferme pas cette page.';
  let closable = false;

  if (state.phase === 'pending') {
    tone = 'bg-amber-50 border-amber-200 text-amber-950';
    icon = <Loader2 className="w-5 h-5 text-amber-600" />;
    title = 'Paiement toujours en cours de traitement';
    text = 'Ton opérateur n’a pas encore confirmé. Ton abonnement s’activera tout seul dès la confirmation : reviens sur cette page dans quelques minutes.';
    closable = true;
  } else if (state.phase === 'error') {
    tone = 'bg-rose-50 border-rose-200 text-rose-900';
    icon = <XCircle className="w-5 h-5 text-rose-600" />;
    title = 'Vérification impossible';
    text = state.message;
    closable = true;
  } else if (state.phase === 'done') {
    closable = true;
    const { payment } = state;
    if (payment.statut === 'REUSSI') {
      tone = 'bg-emerald-50 border-emerald-200 text-emerald-950';
      icon = <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
      title = `Paiement de ${formatMoney(payment.montant)} reçu`;
      text = payment.subscriptionEndsAt
        ? `Ta formule ${payment.planCode === 'BUSINESS' ? 'Business' : 'Solo'} est active jusqu’au ${new Date(payment.subscriptionEndsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.`
        : 'Ton abonnement est actif.';
    } else {
      tone = 'bg-rose-50 border-rose-200 text-rose-900';
      icon = <XCircle className="w-5 h-5 text-rose-600" />;
      title = payment.statut === 'EXPIRE' ? 'Paiement non effectué' : 'Le paiement a échoué';
      text =
        payment.statut === 'EXPIRE'
          ? 'La page de paiement a expiré avant la validation. Aucun montant n’a été prélevé : tu peux réessayer.'
          : 'Aucun abonnement n’a été activé. Vérifie ton solde Mobile Money puis réessaie.';
    }
  }

  return (
    <div className={`max-w-5xl mx-auto p-4 rounded-2xl border flex items-start gap-3 ${tone}`} role="status">
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 space-y-0.5">
        <p className="text-sm font-extrabold">{title}</p>
        <p className="text-xs leading-relaxed">{text}</p>
      </div>
      {closable && (
        <button
          onClick={onClose}
          className="shrink-0 text-xs font-bold underline underline-offset-2 cursor-pointer"
        >
          Fermer
        </button>
      )}
    </div>
  );
};
