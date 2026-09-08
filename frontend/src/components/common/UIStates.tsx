import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  WifiOff,
  RefreshCw,
  AlertTriangle,
  Lock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  UploadCloud,
  Crown,
  ArrowRight,
} from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const { settings, toggleOfflineMode, syncQueue } = useApp();

  if (!settings.isOfflineMode) return null;

  return (
    <div
      id="banner-offline"
      className="bg-amber-500 text-slate-950 px-4 py-2.5 flex items-center justify-between text-xs sm:text-sm font-semibold shadow-md transition-all sticky top-0 z-40"
    >
      <div className="flex items-center gap-2">
        <WifiOff className="w-4 h-4 shrink-0 text-slate-950 animate-pulse" />
        <span>
          <strong>Mode Hors-ligne actif</strong> — Tes ventes sont enregistrées sur cet appareil.
        </span>
      </div>
      <div className="flex items-center gap-2">
        {syncQueue.length > 0 && (
          <span className="bg-slate-950/20 px-2 py-0.5 rounded-full text-[11px] font-bold">
            {syncQueue.length} en attente
          </span>
        )}
        <button
          id="btn-reconnect"
          onClick={toggleOfflineMode}
          className="bg-slate-950 text-white hover:bg-slate-900 active:scale-95 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all"
        >
          Se reconnecter
        </button>
      </div>
    </div>
  );
};

export const SyncStatusBadge: React.FC = () => {
  const { syncQueue, syncPendingOperations, uiState, settings, toggleOfflineMode } = useApp();

  // State 1: Synchronisation en cours
  if (uiState === 'SYNCING') {
    return (
      <div
        id="badge-sync-progress"
        className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 px-2.5 py-1 rounded-full text-xs font-semibold shadow-xs"
      >
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
        <span className="hidden sm:inline">Synchronisation...</span>
      </div>
    );
  }

  // State 2: En attente de synchronisation
  if (syncQueue.length > 0) {
    return (
      <button
        id="btn-sync-pending"
        onClick={syncPendingOperations}
        title="Cliquer pour synchroniser maintenant"
        className="flex items-center gap-1.5 bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 active:scale-95 px-2.5 py-1 rounded-full text-xs font-bold cursor-pointer transition-all shadow-xs"
      >
        <UploadCloud className="w-3.5 h-3.5 text-amber-600 animate-bounce" />
        <span>{syncQueue.length} en attente</span>
      </button>
    );
  }

  // State 3: Hors-ligne (sans éléments dans la queue)
  if (settings.isOfflineMode || uiState === 'OFFLINE') {
    return (
      <button
        id="badge-sync-offline"
        onClick={toggleOfflineMode}
        title="Actuellement hors-ligne (cliquer pour basculer)"
        className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all"
      >
        <WifiOff className="w-3.5 h-3.5 text-slate-500" />
        <span className="hidden sm:inline">Hors-ligne</span>
      </button>
    );
  }

  // State 4: En ligne / Tout est à jour
  return (
    <div
      id="badge-sync-synced"
      className="hidden sm:flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-medium"
      title="Toutes les données sont synchronisées"
    >
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
      <span>À jour</span>
    </div>
  );
};

export const QuotaBanner: React.FC = () => {
  const { products, settings, setActiveTab, setActiveMoreSubTab } = useApp();

  const isQuotaReached = products.length >= settings.quotaMaxProducts;
  if (!isQuotaReached) return null;

  return (
    <div
      id="banner-quota"
      className="bg-indigo-900 text-white px-4 py-3 rounded-2xl mx-4 my-2 flex items-center justify-between gap-3 shadow-lg border border-indigo-700/50"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-700 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-indigo-200" />
        </div>
        <div>
          <p className="text-xs sm:text-sm font-bold">Quota atteint ({products.length}/{settings.quotaMaxProducts} articles)</p>
          <p className="text-[11px] text-indigo-200">Passe en formule Business pour un catalogue illimité.</p>
        </div>
      </div>
      <button
        id="btn-upgrade-quota"
        onClick={() => {
          setActiveTab('more');
          setActiveMoreSubTab('subscription');
        }}
        className="bg-white text-indigo-900 hover:bg-indigo-50 active:scale-95 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-all shadow-sm"
      >
        Passer Business
      </button>
    </div>
  );
};

export const ReadOnlyBanner: React.FC = () => {
  const { settings, setActiveTab, setActiveMoreSubTab } = useApp();

  if (settings.planStatus !== 'EXPIRED') return null;

  return (
    <div
      id="banner-readonly"
      className="bg-rose-50 border-y border-rose-200 text-rose-950 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 shadow-xs"
    >
      <div className="flex items-center gap-2 text-xs sm:text-sm">
        <Lock className="w-4 h-4 text-rose-600 shrink-0" />
        <span>
          <strong>Abonnement expiré (Lecture seule) :</strong> La saisie de nouvelles ventes est bloquée.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          id="btn-export-expired"
          onClick={() => {
            setActiveTab('more');
            setActiveMoreSubTab('export');
          }}
          className="text-xs text-rose-700 hover:underline font-medium px-2 py-1"
        >
          Exporter mes données
        </button>
        <button
          id="btn-reactivate-plan"
          onClick={() => {
            setActiveTab('more');
            setActiveMoreSubTab('subscription');
          }}
          className="bg-rose-600 text-white hover:bg-rose-700 active:scale-95 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
        >
          Réactiver mon compte
        </button>
      </div>
    </div>
  );
};

export const TrialBanner: React.FC = () => {
  const { settings, setActiveTab, setActiveMoreSubTab } = useApp();
  const [dismissed, setDismissed] = useState(false);

  if (settings.planStatus !== 'TRIAL' || dismissed) return null;

  const goToOffers = () => {
    setActiveTab('more');
    setActiveMoreSubTab('subscription');
  };

  return (
    <div
      id="banner-trial"
      className="mx-3 sm:mx-4 my-2.5 flex items-center justify-between gap-3 rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 via-amber-50/60 to-white px-3.5 sm:px-4 py-3 shadow-xs"
    >
      <div className="flex items-center gap-3 min-w-0 cursor-pointer" onClick={goToOffers}>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-400 to-yellow-500 flex items-center justify-center shrink-0 shadow-sm shadow-amber-500/30">
          <Crown className="w-5 h-5 text-white" fill="currentColor" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-slate-900 truncate">Passez en Premium</p>
          <p className="text-[11px] sm:text-xs text-slate-500 truncate">
            <span className="hidden sm:inline">Plus de produits, plus de ventes, et toutes les fonctionnalités avancées. · </span>
            {settings.trialDaysLeft} {settings.trialDaysLeft > 1 ? 'jours' : 'jour'} d'essai restants
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          id="btn-trial-see-offers"
          onClick={goToOffers}
          className="flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-full bg-slate-900 hover:bg-black active:scale-95 text-white text-xs font-bold shadow-sm transition-all cursor-pointer whitespace-nowrap"
        >
          <span className="hidden sm:inline">Voir les offres</span>
          <span className="sm:hidden">Offres</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          id="btn-trial-dismiss"
          onClick={() => setDismissed(true)}
          aria-label="Fermer"
          className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-900/5 transition-all cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export const ToastNotification: React.FC = () => {
  const { toastMessage } = useApp();

  if (!toastMessage) return null;

  const bgClasses = {
    success: 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-900/20',
    warning: 'bg-amber-500 text-slate-950 border-amber-400 shadow-amber-900/20',
    error: 'bg-rose-600 text-white border-rose-500 shadow-rose-900/20',
    info: 'bg-slate-900 text-white border-slate-800 shadow-slate-900/30',
  };

  const icons = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-100 shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-slate-950 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-rose-100 shrink-0" />,
    info: <UploadCloud className="w-4 h-4 text-indigo-300 shrink-0" />,
  };

  return (
    // z-[100] : doit toujours passer au-dessus de TOUT, y compris les modales
    // imbriquées (z-60, ex. DiscountModal/CustomerPickerModal ouvertes depuis
    // NewSaleModal). Avant, ce toast était en z-50 — le même niveau que
    // NewSaleModal — et comme ce dernier est monté plus tard dans le DOM, il
    // passait visuellement dessus : un toast d'erreur ("Caisse fermée...",
    // "Sélectionne un client...", etc.) déclenché en cliquant "Valider la
    // commande" existait bien dans le DOM mais restait invisible, caché
    // derrière la modale — l'action semblait "ne rien faire".
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] max-w-[90vw] sm:max-w-md w-full px-4 animate-in fade-in slide-in-from-top-4 duration-200">
      <div
        id="toast-notification"
        className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border text-sm font-medium ${bgClasses[toastMessage.type]}`}
      >
        {icons[toastMessage.type]}
        <span className="flex-1 text-xs sm:text-sm leading-snug">{toastMessage.text}</span>
      </div>
    </div>
  );
};

interface MoneyInputProps {
  id: string;
  value: number;
  onChange: (val: number) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  min?: number;
  max?: number;
}

export const MoneyInput: React.FC<MoneyInputProps> = ({
  id,
  value,
  onChange,
  placeholder = '0',
  className = '',
  autoFocus = false,
}) => {
  const [displayValue, setDisplayValue] = useState<string>(
    value ? value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : ''
  );

  useEffect(() => {
    setDisplayValue(value ? value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only accept numbers
    const raw = e.target.value.replace(/\D/g, '');
    const num = raw === '' ? 0 : parseInt(raw, 10);
    onChange(num);
    setDisplayValue(raw ? raw.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : '');
  };

  return (
    <div className="relative w-full">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`w-full text-right font-bold pr-16 pl-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-lg transition-all ${className}`}
      />
      <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-extrabold text-slate-400 pointer-events-none select-none">
        FCFA
      </div>
    </div>
  );
};
