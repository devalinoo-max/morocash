import React from 'react';
import { Lock } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface PaywallOverlayProps {
  children: React.ReactNode;
  title?: string;
  message?: string;
}

/**
 * Floute le contenu (analyses détaillées, graphiques) quand l'abonnement est
 * expiré, sans jamais toucher au chiffre "Ce que tu as gagné" ni aux actions
 * de base — celles-ci restent gratuites à vie (voir data/plans.ts).
 */
export const PaywallOverlay: React.FC<PaywallOverlayProps> = ({
  children,
  title = 'Débloque cette analyse',
  message = "Cette vue détaillée fait partie de ton abonnement. Réactive ton compte pour la retrouver.",
}) => {
  const { settings, setActiveTab, setActiveMoreSubTab } = useApp();
  const isLocked = settings.planStatus === 'EXPIRED';

  if (!isLocked) return <>{children}</>;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-[6px] opacity-60" aria-hidden="true">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="max-w-xs w-full bg-white/95 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-xl p-5 text-center space-y-3">
          <div className="w-10 h-10 mx-auto rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-extrabold text-slate-900">{title}</h4>
            <p className="text-xs text-slate-500 leading-relaxed">{message}</p>
          </div>
          <button
            onClick={() => {
              setActiveTab('more');
              setActiveMoreSubTab('subscription');
            }}
            className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-all"
          >
            Réactiver mon compte
          </button>
        </div>
      </div>
    </div>
  );
};
