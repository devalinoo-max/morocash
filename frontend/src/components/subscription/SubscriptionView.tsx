import React, { useState } from 'react';
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
  Clock,
  HeartHandshake,
} from 'lucide-react';
import { formatMoney } from '../../utils/formatters';
import {
  PLANS,
  getAnnualSavings,
  calculateProrataUpgrade,
  PRICING_JUSTIFICATION,
} from '../../data/plans';

interface SubscriptionViewProps {
  onBack?: () => void;
}

export const SubscriptionView: React.FC<SubscriptionViewProps> = ({ onBack }) => {
  const { settings, showToast } = useApp();

  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  // Formule que l'utilisateur vient de choisir — le paiement en ligne n'existe
  // pas encore (voir Plan/Subscription/SubscriptionPayment côté backend,
  // aucune route ne les alimente), donc on capte l'intérêt honnêtement au
  // lieu de simuler une activation qui ne correspondrait à rien de réel.
  const [interestedPlan, setInterestedPlan] = useState<'SOLO' | 'BUSINESS' | null>(null);

  const currentPlan = settings.planStatus; // 'TRIAL' | 'SOLO' | 'BUSINESS' | 'EXPIRED'
  const trialDaysLeft = settings.trialDaysLeft || 14;

  const prorataAmount = calculateProrataUpgrade(trialDaysLeft);
  const soloSavings = getAnnualSavings('SOLO');
  const businessSavings = getAnnualSavings('BUSINESS');

  const handleSelectPlan = (targetPlan: 'SOLO' | 'BUSINESS') => {
    if (targetPlan === currentPlan) {
      showToast(`Tu es déjà sur la formule ${PLANS[targetPlan].nom}`, 'info');
      return;
    }
    setInterestedPlan(targetPlan);
  };

  const notifyWhenPaymentReady = () => {
    setInterestedPlan(null);
    showToast('Le paiement en ligne arrive bientôt : on te préviendra dès son ouverture.', 'info');
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-200">
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
            onClick={() => handleSelectPlan('SOLO')}
            disabled={currentPlan === 'SOLO'}
            className={`w-full py-3.5 rounded-2xl font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-2 ${
              currentPlan === 'SOLO'
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-white hover:bg-slate-50 text-slate-800 border-2 border-slate-200 hover:border-slate-300 shadow-xs'
            }`}
          >
            <span>{currentPlan === 'SOLO' ? 'Formule déjà active' : 'Choisir la formule Solo'}</span>
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
            onClick={() => handleSelectPlan('BUSINESS')}
            disabled={currentPlan === 'BUSINESS'}
            className={`w-full py-3.5 rounded-2xl font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md ${
              currentPlan === 'BUSINESS'
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                : 'bg-[#4F46E5] hover:bg-indigo-700 text-white shadow-indigo-200'
            }`}
          >
            {currentPlan === 'BUSINESS' ? (
              <span>Formule active</span>
            ) : currentPlan === 'SOLO' ? (
              <span>
                Passer en Business (Prorata : {formatMoney(prorataAmount)} pour {trialDaysLeft} j)
              </span>
            ) : (
              <span>Choisir la formule Business</span>
            )}
            {currentPlan !== 'BUSINESS' && <ArrowRight className="w-4 h-4" />}
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
          Paiement local sécurisé par Mobile Money (Côte d'Ivoire, Sénégal, Mali, Burkina, Guinée...)
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

      {/* Le paiement en ligne n'est pas encore branché (Wave/Orange Money/MoMo affichés
          plus haut à titre indicatif) — on capte l'intérêt honnêtement plutôt que de
          simuler une activation de plan qui ne correspondrait à rien de réel. */}
      {interestedPlan && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 space-y-4 shadow-2xl border border-slate-100">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="font-extrabold text-base text-slate-900">
                {PLANS[interestedPlan].nom} — bientôt disponible
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Le paiement en ligne par Mobile Money arrive bientôt. En attendant, continue de profiter de ton
                essai gratuit — aucune donnée n'est perdue et tu ne payes rien tant que ce n'est pas ouvert.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setInterestedPlan(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Retour
              </button>
              <button
                onClick={notifyWhenPaymentReady}
                className="flex-1 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 text-white text-xs font-bold shadow-md cursor-pointer"
              >
                Me prévenir à l'ouverture
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
