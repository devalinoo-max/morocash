import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Crown,
  Check,
  ArrowRight,
  ArrowLeft,
  HeartHandshake,
  Loader2,
  CheckCircle2,
  XCircle,
  Gift,
  CalendarClock,
  Eye,
  Ban,
  ShieldCheck,
} from 'lucide-react';
import { formatMoney, formatPaymentMethod } from '../../utils/formatters';
import {
  PLANS,
  BILLING_PERIODS,
  PRICING_JUSTIFICATION,
  TRIAL_DAYS,
  getFullPrice,
  getSavings,
  type BillingPeriod,
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

type PlanId = 'SOLO' | 'BUSINESS';

export const SubscriptionView: React.FC<SubscriptionViewProps> = () => {
  const { settings, showToast, refreshPlanStatus } = useApp();

  // Formule dont on choisit la durée (page « Choisis ta durée »), puis durée
  // dont le paiement est en cours d'ouverture.
  const [durationPlan, setDurationPlan] = useState<PlanId | null>(null);
  const [checkoutPeriod, setCheckoutPeriod] = useState<BillingPeriod | null>(null);
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
  // On ne repropose jamais la formule payée : Solo laisse voir Business,
  // Business (la plus complète) ne laisse plus aucune formule à choisir.
  const planRank = PLAN_RANK[currentPlan];
  const showSoloCard = planRank < PLAN_RANK.SOLO;
  const showBusinessCard = planRank < PLAN_RANK.BUSINESS;
  const trialDaysLeft = settings.trialDaysLeft ?? TRIAL_DAYS;

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

  const openDurationPicker = (targetPlan: PlanId) => {
    if (targetPlan === currentPlan) {
      showToast(`Tu es déjà sur la formule ${PLANS[targetPlan].nom}`, 'info');
      return;
    }
    setDurationPlan(targetPlan);
    window.scrollTo({ top: 0 });
  };

  const startPayment = async (periode: BillingPeriod) => {
    if (!durationPlan || checkoutPeriod) return;
    setCheckoutPeriod(periode);
    try {
      const { redirectUrl } = await startSubscriptionCheckout(durationPlan, periode);
      window.location.assign(redirectUrl);
    } catch (error) {
      setCheckoutPeriod(null);
      showToast(error instanceof Error ? error.message : 'Impossible de lancer le paiement.', 'error');
    }
  };

  if (durationPlan) {
    return (
      <DurationPicker
        planId={durationPlan}
        pendingPeriod={checkoutPeriod}
        onBack={() => setDurationPlan(null)}
        onPay={(periode) => void startPayment(periode)}
      />
    );
  }

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
                ? `Essai gratuit de ${TRIAL_DAYS} jours`
                : currentPlan === 'BUSINESS'
                ? `Formule active : Business`
                : currentPlan === 'SOLO'
                ? `Formule active : Solo`
                : `Ton abonnement a expiré`}
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
              {currentPlan === 'TRIAL' ? (
                <>
                  Il te reste <strong className="text-amber-400">{trialDaysLeft} jour{trialDaysLeft > 1 ? 's' : ''}</strong> d'essai.
                  Pendant l'essai, tu profites de tout ce que propose la formule{' '}
                  <strong className="text-white">Solo ({formatMoney(PLANS.SOLO.prixMensuel)} / mois)</strong>.
                </>
              ) : currentPlan === 'BUSINESS' ? (
                <>
                  Accès complet pour toute ton équipe (jusqu'à {PLANS.BUSINESS.maxUsers} personnes), commandes et produits illimités.
                </>
              ) : currentPlan === 'SOLO' ? (
                <>
                  Jusqu'à {PLANS.SOLO.maxUsers} utilisateurs, {PLANS.SOLO.maxCommandesMois} commandes par mois et{' '}
                  {PLANS.SOLO.maxProduits.toLocaleString('fr-FR')} produits.
                </>
              ) : (
                <>
                  Ton compte est en lecture seule. Choisis une formule ci-dessous pour le réactiver — ton historique
                  reste 100% intact.
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
              {currentPlan === 'TRIAL' ? 'Période d’essai' : currentPlan === 'EXPIRED' ? 'Lecture seule' : 'Abonnement actif'}
            </span>
            <span className="text-[11px] text-slate-300 mt-1 block">
              Historique 100% garanti à vie
            </span>
          </div>
        </div>
      </div>

      {/* Mon abonnement : visible dès qu'une formule a été payée */}
      {overview?.current && <MySubscriptionCard overview={overview} />}

      {/* Formule la plus complète : plus de choix, on détaille ce qu'elle apporte */}
      {!showBusinessCard && <BusinessAdvantages overview={overview} />}

      {showBusinessCard && (
        <>
          <div
            className={`grid grid-cols-1 gap-6 mx-auto items-stretch pt-3 ${
              showSoloCard ? 'lg:grid-cols-2 max-w-5xl' : 'max-w-xl'
            }`}
          >
            {showSoloCard && (
              <PlanCard planId="SOLO" ctaLabel="Choisir la formule Solo" onSelect={() => openDurationPicker('SOLO')} />
            )}
            <PlanCard
              planId="BUSINESS"
              highlighted
              ctaLabel={currentPlan === 'SOLO' ? 'Passer en Business' : 'Choisir la formule Business'}
              onSelect={() => openDurationPicker('BUSINESS')}
            />
          </div>

          {/* Justifier le prix : encadré discret */}
          <div className="max-w-4xl mx-auto p-5 sm:p-6 rounded-2xl bg-[#F8FAFC] border border-slate-200 text-slate-800 space-y-2 text-center sm:text-left">
            <p className="text-xs sm:text-sm font-semibold leading-relaxed text-slate-700">
              "{PRICING_JUSTIFICATION.quote}"
            </p>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              MoroCash s'autofinance dès ta première semaine d'utilisation.
            </p>
          </div>

          <MobileMoneyMethods />
        </>
      )}

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

const MobileMoneyMethods: React.FC = () => (
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
);

/** Carte d'une formule : prix au mois, rappel du prix à l'année et avantages. */
const PlanCard: React.FC<{
  planId: PlanId;
  highlighted?: boolean;
  ctaLabel: string;
  onSelect: () => void;
}> = ({ planId, highlighted = false, ctaLabel, onSelect }) => {
  const plan = PLANS[planId];
  const isBusiness = planId === 'BUSINESS';

  return (
    <div
      className={`bg-white rounded-3xl p-6 sm:p-7 transition-all flex flex-col justify-between space-y-6 relative ${
        highlighted ? 'border-2 border-[#4F46E5] shadow-xl' : 'border border-slate-200/90 hover:border-slate-300 shadow-xs'
      }`}
    >
      {isBusiness && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[#4F46E5] text-white text-[11px] font-black tracking-wide shadow-md whitespace-nowrap">
          ⭐ RECOMMANDÉ POUR ÉQUIPES
        </div>
      )}

      <div className="space-y-5">
        <div>
          <span className={`text-[11px] font-extrabold uppercase tracking-wider ${isBusiness ? 'text-indigo-600' : 'text-slate-400'}`}>
            {isBusiness ? 'Formule Équipe' : 'Formule Solo'}
          </span>
          <h3 className="text-2xl font-black text-slate-900 mt-0.5">{plan.nom}</h3>
          <p className={`text-xs font-bold mt-1 ${isBusiness ? 'text-emerald-600' : 'text-[#4F46E5]'}`}>"{plan.baseline}"</p>
        </div>

        <div className={`p-4 rounded-2xl space-y-1 border ${isBusiness ? 'bg-indigo-50/60 border-indigo-100' : 'bg-slate-50/80 border-slate-200/70'}`}>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl sm:text-4xl font-black text-slate-900">{formatMoney(plan.prixMensuel)}</span>
            <span className="text-xs font-bold text-slate-500">/ mois</span>
          </div>
          <p className="text-[11px] text-slate-600">
            Paiement pour 1, 3, 6 ou 12 mois ·{' '}
            <strong className="text-emerald-700">
              {formatMoney(plan.prix.ANNUEL)} l’année, 2 mois offerts
            </strong>
          </p>
        </div>

        <ul className="space-y-2.5 text-xs text-slate-700 font-medium pt-1">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5">
              <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[2.5] mt-px" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <button
        onClick={onSelect}
        className={`w-full py-3.5 rounded-2xl font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-2 ${
          highlighted
            ? 'bg-[#4F46E5] hover:bg-indigo-700 text-white shadow-md shadow-indigo-200'
            : 'bg-white hover:bg-slate-50 text-slate-800 border-2 border-slate-200 hover:border-slate-300 shadow-xs'
        }`}
      >
        <span>{ctaLabel}</span>
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
};

/**
 * Page « Choisis ta durée » : 1, 3, 6 ou 12 mois pour la formule choisie. Le
 * montant affiché est indicatif — le serveur relit toujours le prix en base.
 */
const DurationPicker: React.FC<{
  planId: PlanId;
  pendingPeriod: BillingPeriod | null;
  onBack: () => void;
  onPay: (periode: BillingPeriod) => void;
}> = ({ planId, pendingPeriod, onBack, onPay }) => {
  const plan = PLANS[planId];
  const [selected, setSelected] = useState<BillingPeriod>('ANNUEL');
  const selectedPeriod = BILLING_PERIODS.find((p) => p.id === selected) ?? BILLING_PERIODS[0];
  const isPending = pendingPeriod !== null;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20 animate-in fade-in duration-200">
      <button
        onClick={onBack}
        disabled={isPending}
        className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer disabled:opacity-50"
      >
        <ArrowLeft className="w-4 h-4" /> Retour aux formules
      </button>

      <div className="space-y-1">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#4F46E5]">{plan.nom}</span>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Choisis ta durée</h2>
        <p className="text-sm text-slate-500">
          Tu paies une seule fois par Mobile Money, sans prélèvement automatique. Plus la durée est longue, moins chaque
          mois te coûte.
        </p>
      </div>

      <div role="radiogroup" aria-label="Durée de l'abonnement" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {BILLING_PERIODS.map((period) => {
          const total = plan.prix[period.id];
          const savings = getSavings(planId, period.id);
          const isSelected = selected === period.id;
          const isYear = period.id === 'ANNUEL';

          return (
            <button
              key={period.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={isPending}
              onClick={() => setSelected(period.id)}
              className={`relative text-left p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer disabled:cursor-not-allowed ${
                isSelected ? 'border-[#4F46E5] bg-[#EEF2FF]' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              {isYear && (
                <span className="absolute -top-2.5 right-4 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wide shadow-sm">
                  <Gift className="w-3 h-3" /> 2 mois offerts
                </span>
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <span className="block text-sm font-black text-slate-900">{period.label}</span>
                  <span className="block text-2xl font-black text-slate-900 leading-none">{formatMoney(total)}</span>
                  <span className="block text-[11px] text-slate-500">
                    {period.mois > 1 ? `soit ${formatMoney(Math.round(total / period.mois))} / mois` : 'sans engagement'}
                  </span>
                </div>
                <span
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    isSelected ? 'border-[#4F46E5] bg-[#4F46E5] text-white' : 'border-slate-300'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3" strokeWidth={3.5} />}
                </span>
              </div>
              {savings > 0 && (
                <span className="mt-3 inline-block px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-extrabold">
                  {isYear
                    ? `Au lieu de ${formatMoney(getFullPrice(planId, period.id))} : tu économises ${formatMoney(savings)}`
                    : `Tu économises ${formatMoney(savings)}`}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-600">
            {plan.nom} · {selectedPeriod.label}
          </span>
          <span className="font-black text-slate-900">{formatMoney(plan.prix[selected])}</span>
        </div>
        <button
          onClick={() => onPay(selected)}
          disabled={isPending}
          className="w-full py-3.5 rounded-full bg-[#4F46E5] hover:bg-indigo-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all disabled:opacity-60 disabled:cursor-wait"
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Ouverture du paiement…</span>
            </>
          ) : (
            <>
              <span>Payer {formatMoney(plan.prix[selected])}</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      <MobileMoneyMethods />
    </div>
  );
};

const formatLongDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

const formatShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

const periodeLabel = (periode: BillingPeriod | null) =>
  BILLING_PERIODS.find((p) => p.id === periode)?.label ?? '—';

const methodLabel = (methode: string) => (methode === 'AUTRE' ? 'Mobile Money' : formatPaymentMethod(methode));

const planLabel = (code: 'SOLO' | 'BUSINESS' | null) =>
  code === 'BUSINESS' ? 'Business' : code === 'SOLO' ? 'Solo' : '—';

/** Détail de la formule payée : dates, jours restants, dernier paiement et historique. */
const PLAN_RANK: Record<'TRIAL' | 'EXPIRED' | 'SOLO' | 'BUSINESS', number> = {
  TRIAL: 0,
  EXPIRED: 0,
  SOLO: 1,
  BUSINESS: 2,
};

/** Formule Business active : tous ses avantages et l'usage des comptes. */
const BusinessAdvantages: React.FC<{ overview: SubscriptionOverview | null }> = ({ overview }) => {
  const plan = PLANS.BUSINESS;
  const utilisateurs = overview?.utilisateurs ?? null;
  const placesLibres = utilisateurs === null ? null : Math.max(0, plan.maxUsers - utilisateurs);

  return (
    <section className="max-w-5xl mx-auto bg-white rounded-3xl border border-slate-200/90 shadow-xs p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Mes avantages</span>
          <h3 className="text-lg font-black text-slate-900">Tu es déjà sur la formule la plus complète</h3>
        </div>
        <span className="self-start sm:self-auto px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
          {plan.nom}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InfoTile
          label="Utilisateurs"
          value={`${utilisateurs ?? '—'} / ${plan.maxUsers}`}
          sub={
            placesLibres === null
              ? undefined
              : placesLibres === 0
              ? 'Toutes les places sont prises'
              : `${placesLibres} place${placesLibres > 1 ? 's' : ''} libre${placesLibres > 1 ? 's' : ''}`
          }
        />
        <InfoTile label="Produits" value="Illimités" sub="Aucun plafond" />
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-xs text-slate-700 font-medium">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5">
            <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[2.5] mt-px" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

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
  // Ce qui compte pour le commerçant : jusqu'à quand il peut travailler, donc la
  // fin d'accès réelle — périodes déjà payées d'avance comprises.
  const endIso = subscriptionEndsAt ?? current.dateFin;

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
        {/*
          Une date seule oblige à compter dans sa tête. Le compte à rebours dit
          d'abord le nombre de jours — ce qui décide d'agir — et la date ensuite,
          pour qui veut la noter.
        */}
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 ${
            expired
              ? 'bg-rose-50 border-rose-200'
              : joursRestants !== null && joursRestants <= 7
              ? 'bg-amber-50 border-amber-200'
              : 'bg-indigo-50/70 border-indigo-100'
          }`}
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white ${
              expired
                ? 'bg-rose-600'
                : joursRestants !== null && joursRestants <= 7
                ? 'bg-amber-600'
                : 'bg-[#4F46E5]'
            }`}
          >
            <CalendarClock className="w-5 h-5" />
          </div>
          <p className="text-sm font-black text-slate-900 leading-snug">
            {expired || joursRestants === null
              ? `Terminé le ${formatShortDate(endIso)}`
              : `Expire dans ${joursRestants} jour${joursRestants > 1 ? 's' : ''} — le ${formatShortDate(endIso)}`}
          </p>
        </div>

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

        <NonRenewalNotice />
      </div>
    </section>
  );
};

/**
 * Ce qui se passe si l'abonnement n'est pas renouvelé, dit avant l'échéance et
 * sans détour : deux pertes réelles, et la garantie qui ne bouge jamais. Mieux
 * vaut l'annoncer ici que le laisser découvrir le jour où le bouton ne répond plus.
 */
const NonRenewalNotice: React.FC = () => (
  <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
    <h4 className="text-xs font-extrabold text-slate-900">Si tu n’es pas renouvelé</h4>
    <ul className="space-y-2 text-xs text-slate-700">
      <li className="flex items-start gap-2.5">
        <Eye className="w-4 h-4 text-slate-500 shrink-0 mt-px" />
        <span>
          Ton compte passe en <strong>lecture seule</strong> : tu vois tout, tu ne modifies plus rien.
        </span>
      </li>
      <li className="flex items-start gap-2.5">
        <Ban className="w-4 h-4 text-rose-500 shrink-0 mt-px" />
        <span>
          Impossible d’<strong>ajouter une commande</strong> ou un <strong>produit</strong> tant que tu n’as pas repris une formule.
        </span>
      </li>
      <li className="flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-px" />
        <span>
          Ton <strong>historique est garanti à vie</strong> et reste <strong>exportable</strong> — il ne t’est jamais retiré.
        </span>
      </li>
    </ul>
  </div>
);

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
