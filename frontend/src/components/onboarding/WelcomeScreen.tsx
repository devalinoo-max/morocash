import React from 'react';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { formatMoney } from '../../utils/formatters';
import { PLANS, TRIAL_DAYS } from '../../data/plans';

interface WelcomeScreenProps {
  shopName: string;
  onContinue: () => void;
}

/**
 * Écran affiché une seule fois, entre « Créer ma boutique » et le tableau de
 * bord.
 *
 * Il répond aux trois questions qu'on se pose à cette seconde précise : est-ce
 * que ça a marché, combien de temps j'ai devant moi, et combien ça coûtera
 * ensuite. Les formules sont données au prix seulement : le détail se lit plus
 * tard, dans « Mon abonnement », quand la question se posera vraiment.
 */
export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ shopName, onContinue }) => (
  <div className="min-h-screen bg-[#F4F4F8] flex items-center justify-center p-5 sm:p-8">
    <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-200/60 p-7 sm:p-8 space-y-6 text-center animate-in fade-in zoom-in-95 duration-300">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
        <CheckCircle2 className="w-9 h-9" strokeWidth={2.2} />
      </div>

      <div className="space-y-2">
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-snug">
          Bienvenue chez {shopName} !
        </h1>
        <p className="text-sm font-semibold text-slate-600">
          Ton essai de {TRIAL_DAYS} jours a commencé aujourd’hui.
        </p>
      </div>

      <div className="space-y-2 text-left">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block">
          Ensuite, à toi de choisir
        </span>
        <div className="grid grid-cols-2 gap-2.5">
          <PlanPreview name="Solo" price={PLANS.SOLO.prixMensuel} />
          <PlanPreview name="Business" price={PLANS.BUSINESS.prixMensuel} highlighted />
        </div>
        <p className="text-[11px] text-slate-400 pt-0.5">
          Rien à payer maintenant, aucune carte demandée.
        </p>
      </div>

      <button
        type="button"
        onClick={onContinue}
        autoFocus
        className="w-full py-3.5 rounded-2xl bg-[#4F46E5] hover:bg-indigo-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 cursor-pointer transition-all"
      >
        <span>Aller à mon tableau de bord</span>
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  </div>
);

const PlanPreview: React.FC<{ name: string; price: number; highlighted?: boolean }> = ({
  name,
  price,
  highlighted = false,
}) => (
  <div
    className={`p-3.5 rounded-2xl border text-left ${
      highlighted ? 'bg-indigo-50/70 border-indigo-200' : 'bg-slate-50/80 border-slate-200'
    }`}
  >
    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">
      {name}
    </span>
    <span className="text-base font-black text-slate-900 block mt-0.5">{formatMoney(price)}</span>
    <span className="text-[11px] text-slate-500">/ mois</span>
  </div>
);
