import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Sparkles, Check, ArrowRight, Crown, PartyPopper } from 'lucide-react';
import { formatMoney } from '../../utils/formatters';
import { PLANS } from '../../data/plans';

/**
 * Affiché une seule fois, juste après une inscription réussie (voir
 * AppContext.justRegistered) — l'essai de 14 jours est déjà actif côté
 * serveur dans tous les cas (register.ts), cet écran ne fait que proposer de
 * regarder les formules payantes avant d'entrer dans l'app.
 */
export const WelcomeChoiceScreen: React.FC = () => {
  const { settings, dismissWelcomeChoice, showToast } = useApp();
  const [showPlans, setShowPlans] = useState(false);

  const notifyWhenReady = () => {
    showToast('Le paiement en ligne arrive bientôt : on te préviendra dès son ouverture.', 'info');
    dismissWelcomeChoice();
  };

  return (
    <div className="min-h-screen bg-[#F4F4F8] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
        <div className="p-7 pb-6 text-center bg-gradient-to-br from-[#4338CA] to-[#6366F1] text-white space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-white/15 flex items-center justify-center">
            <PartyPopper className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-black tracking-tight">
            {settings.shopName} est prête !
          </h2>
          <p className="text-xs text-indigo-100 max-w-xs mx-auto leading-relaxed">
            Tes {settings.trialDaysLeft} jours d'essai gratuit ont démarré automatiquement. Aucune carte bancaire requise.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {!showPlans ? (
            <>
              <button
                onClick={dismissWelcomeChoice}
                className="w-full py-4 rounded-2xl bg-[#10B981] hover:bg-emerald-600 text-white font-extrabold text-sm shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99]"
              >
                <Sparkles className="w-4 h-4" />
                <span>Démarrer mes 14 jours gratuits</span>
              </button>

              <button
                onClick={() => setShowPlans(true)}
                className="w-full py-3.5 rounded-2xl border-2 border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <Crown className="w-4 h-4 text-amber-500" />
                <span>Voir les formules & payer maintenant</span>
              </button>

              <p className="text-center text-[11px] text-slate-400 pt-1">
                Tu pourras changer de formule à tout moment depuis Menu → Abonnement.
              </p>
            </>
          ) : (
            <>
              <button
                onClick={() => setShowPlans(false)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                ← Retour
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['SOLO', 'BUSINESS'] as const).map((code) => {
                  const plan = PLANS[code];
                  return (
                    <div
                      key={code}
                      className={`p-4 rounded-2xl border-2 space-y-3 ${
                        code === 'BUSINESS' ? 'border-[#4338CA]' : 'border-slate-200'
                      }`}
                    >
                      <div>
                        <h3 className="text-sm font-black text-slate-900">{plan.nom}</h3>
                        <p className="text-[11px] text-slate-500">{plan.baseline}</p>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-black text-slate-900">{formatMoney(plan.prixMensuel)}</span>
                        <span className="text-[11px] text-slate-500">/ mois</span>
                      </div>
                      <ul className="space-y-1.5 text-[11px] text-slate-600">
                        {plan.features.slice(0, 3).map((f) => (
                          <li key={f} className="flex items-start gap-1.5">
                            <Check className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
                Le paiement en ligne (Wave, Orange Money, MoMo) arrive bientôt. En attendant, profite de ton essai gratuit — tu ne perds rien.
              </div>

              <button
                onClick={notifyWhenReady}
                className="w-full py-3.5 rounded-2xl bg-[#4338CA] hover:bg-indigo-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-all"
              >
                <span>Continuer avec mon essai gratuit</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
