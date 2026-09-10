import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, UploadCloud, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

/**
 * Bande basse de synchronisation.
 *
 * C'est le SEUL endroit ou l'app parle de reseau apres un clic. Jamais au
 * milieu de l'ecran, jamais en bloquant : le commercant a un client devant lui,
 * son ecran doit rester utilisable pendant que la requete part (point 1).
 *
 * Trois etats seulement :
 *   - envoi en cours      : discret, gris
 *   - envoi reussi        : "4 elements envoyes" 3 secondes, puis plus rien
 *   - refus du serveur    : bande rouge, motif en clair, bouton "Reessayer"
 */
export const PendingSyncBar: React.FC = () => {
  const {
    pendingMutations,
    isSyncing,
    pendingFailure,
    dismissPendingFailure,
    lastSyncedCount,
    syncPendingOperations,
  } = useApp();

  // "Tout est a jour" ne s'affiche qu'apres un envoi effectif, et brievement :
  // un bandeau permanent qui dit que tout va bien est du bruit.
  const [showAllDone, setShowAllDone] = useState(false);
  useEffect(() => {
    if (lastSyncedCount === null) return;
    setShowAllDone(false);
    const timer = setTimeout(() => setShowAllDone(true), 3000);
    const hide = setTimeout(() => setShowAllDone(false), 6000);
    return () => {
      clearTimeout(timer);
      clearTimeout(hide);
    };
  }, [lastSyncedCount]);

  if (pendingFailure) {
    return (
      <div className="fixed bottom-20 md:bottom-3 inset-x-0 z-[90] px-3 pointer-events-none">
        <div className="pointer-events-auto mx-auto max-w-xl flex items-start gap-3 rounded-2xl bg-rose-600 text-white px-4 py-3 shadow-xl shadow-rose-900/30">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold leading-snug">{pendingFailure.message}</p>
            <p className="text-[11px] text-rose-100 mt-0.5">
              Rien n’est perdu : tes données sont toujours sur cet appareil.
            </p>
          </div>
          {pendingFailure.canRetry && (
            <button
              type="button"
              onClick={() => void syncPendingOperations()}
              className="shrink-0 bg-white text-rose-700 hover:bg-rose-50 active:scale-95 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all"
            >
              Réessayer
            </button>
          )}
          <button
            type="button"
            onClick={dismissPendingFailure}
            aria-label="Fermer"
            className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-rose-100 hover:bg-white/15 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (lastSyncedCount !== null && !showAllDone) {
    return (
      <SyncPill tone="success" icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
        {lastSyncedCount} élément{lastSyncedCount > 1 ? 's' : ''} envoyé
        {lastSyncedCount > 1 ? 's' : ''}
      </SyncPill>
    );
  }

  if (showAllDone) {
    return (
      <SyncPill tone="success" icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
        Tout est à jour
      </SyncPill>
    );
  }

  if (isSyncing) {
    return (
      <SyncPill tone="neutral" icon={<RefreshCw className="w-3.5 h-3.5 animate-spin" />}>
        Envoi en cours…
      </SyncPill>
    );
  }

  if (pendingMutations.length > 0) {
    return (
      <SyncPill tone="neutral" icon={<UploadCloud className="w-3.5 h-3.5" />}>
        {pendingMutations.length} en attente d’envoi
      </SyncPill>
    );
  }

  return null;
};

const SyncPill: React.FC<{
  tone: 'neutral' | 'success';
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ tone, icon, children }) => (
  <div className="fixed bottom-20 md:bottom-3 inset-x-0 z-[90] px-3 pointer-events-none flex justify-center">
    <div
      className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-bold shadow-lg border ${
        tone === 'success'
          ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-900/20'
          : 'bg-slate-900 text-slate-100 border-slate-800 shadow-slate-900/25'
      }`}
    >
      {icon}
      <span>{children}</span>
    </div>
  </div>
);
