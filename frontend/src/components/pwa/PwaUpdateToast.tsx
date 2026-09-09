import React, { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { CloudCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';

/**
 * Le Service Worker se télécharge et se met en cache tout seul dès qu'une
 * nouvelle version est déployée (aucune action requise). On l'active
 * automatiquement (silencieux, pas de bandeau/clic) mais seulement au premier
 * instant où c'est sans danger : panier vide et aucune modale de vente/reçu
 * ouverte — sinon on attendrait de recharger l'app sous les pieds d'un
 * commerçant en pleine vente. Tant que ce n'est pas sûr, l'effet se recontrôle
 * à chaque changement de panier/modale jusqu'à ce que ce soit le cas.
 */
export const PwaUpdateToast: React.FC = () => {
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();
  const { cart, isNewSaleOpen, selectedSaleForReceipt, saleSuccessReceipt } = useApp();

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

  useEffect(() => {
    if (!needRefresh) return;
    const safeToUpdate =
      cart.length === 0 && !isNewSaleOpen && !selectedSaleForReceipt && !saleSuccessReceipt;
    if (safeToUpdate) {
      updateServiceWorker(true);
    }
  }, [needRefresh, cart.length, isNewSaleOpen, selectedSaleForReceipt, saleSuccessReceipt, updateServiceWorker]);

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
