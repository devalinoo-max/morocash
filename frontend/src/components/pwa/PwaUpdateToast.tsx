import React, { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { CloudCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { isRequestInFlight } from '../../api/client';

/**
 * Le Service Worker se télécharge et se met en cache tout seul dès qu'une
 * nouvelle version est déployée (aucune action requise). On l'active
 * automatiquement (silencieux, pas de bandeau/clic) mais seulement à un
 * instant sans danger : session authentifiée (jamais pendant l'écran de
 * connexion/inscription — un panier vide y est vrai en permanence et ne veut
 * rien dire), panier vide, aucune modale de vente/reçu ouverte, ET aucune
 * requête réseau en vol. Ce dernier point est indispensable — sans lui, un
 * rechargement pendant une connexion/inscription en cours annule net la
 * requête, ce qui ressemblait à une panne serveur alors que ce n'en était pas
 * une (et faisait aussi revenir l'écran "Essayer" à la case départ). Vérifié
 * en boucle courte tant que ce n'est pas encore sûr.
 */
export const PwaUpdateToast: React.FC = () => {
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();
  const { authStatus, cart, isNewSaleOpen, selectedSaleForReceipt, saleSuccessReceipt } = useApp();

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

    const trySafeUpdate = () => {
      const safeToUpdate =
        authStatus === 'authenticated' &&
        cart.length === 0 &&
        !isNewSaleOpen &&
        !selectedSaleForReceipt &&
        !saleSuccessReceipt &&
        !isRequestInFlight();
      if (safeToUpdate) {
        updateServiceWorker(true);
      }
    };

    trySafeUpdate();
    // Une requête en vol au premier passage (ex. connexion en cours) peut se
    // terminer juste après : on recontrôle à intervalle court plutôt que de
    // dépendre uniquement des changements de panier/modale.
    const interval = setInterval(trySafeUpdate, 2000);
    return () => clearInterval(interval);
  }, [needRefresh, authStatus, cart.length, isNewSaleOpen, selectedSaleForReceipt, saleSuccessReceipt, updateServiceWorker]);

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
