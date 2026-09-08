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
  ChevronRight,
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

  if (settings.planStatus !== 'TRIAL') return null;

  return (
    <div
      id="banner-trial"
      onClick={() => {
        setActiveTab('more');
        setActiveMoreSubTab('subscription');
      }}
      className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-indigo-500/10 border-b border-indigo-100 px-4 py-2 flex items-center justify-between text-xs text-indigo-950 cursor-pointer hover:bg-indigo-50/80 transition-all"
    >
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
        <span className="font-semibold text-indigo-900">
          Période d'essai gratuit active — {settings.trialDaysLeft} jours restants
        </span>
      </div>
      <div className="flex items-center gap-1 font-bold text-indigo-600 text-[11px] hover:underline">
        <span>Gérer l'offre</span>
        <ChevronRight className="w-3.5 h-3.5" />
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
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] sm:max-w-md w-full px-4 animate-in fade-in slide-in-from-top-4 duration-200">
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
        pattern="[0-9]*"
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
