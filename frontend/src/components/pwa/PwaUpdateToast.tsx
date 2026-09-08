import React, { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, CloudCheck } from 'lucide-react';

/**
 * Le Service Worker se télécharge et se met en cache tout seul dès qu'une
 * nouvelle version est déployée (aucune action requise). On n'active
 * volontairement PAS cette nouvelle version automatiquement : ça reviendrait
 * à recharger l'app sous les pieds d'un commerçant en pleine vente. On lui
 * montre donc ce bandeau et c'est SON clic sur "Mettre à jour" qui recharge.
 */
export const PwaUpdateToast: React.FC = () => {
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  const [showOfflineReady, setShowOfflineReady] = useState(false);

  useEffect(() => {
    if (!offlineReady) return;
    setShowOfflineReady(true);
    const timeout = setTimeout(() => {
      setShowOfflineReady(false);
      setOfflineReady(false);
    }, 4000);
    return () => clearTimeout(timeout);
  }, [offlineReady, setOfflineReady]);

  if (needRefresh) {
    return (
      <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[92vw] max-w-sm">
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900 text-white shadow-xl border border-slate-800">
          <RefreshCw className="w-4 h-4 text-indigo-300 shrink-0" />
          <span className="flex-1 text-xs font-medium">Nouvelle version disponible.</span>
          <button
            id="btn-update-app"
            onClick={() => updateServiceWorker(true)}
            className="px-3 py-1.5 rounded-xl bg-white text-slate-900 text-xs font-bold cursor-pointer hover:bg-slate-100 active:scale-95 transition-all shrink-0"
          >
            Mettre à jour
          </button>
        </div>
      </div>
    );
  }

  if (showOfflineReady) {
    return (
      <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[92vw] max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-600 text-white shadow-xl border border-emerald-500">
          <CloudCheck className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-xs font-medium">Application prête pour un usage hors-ligne.</span>
        </div>
      </div>
    );
  }

  return null;
};
