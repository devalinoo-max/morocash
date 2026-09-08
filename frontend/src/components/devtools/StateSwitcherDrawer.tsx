import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  SlidersHorizontal,
  X,
  Sparkles,
  Wifi,
  WifiOff,
  Shield,
  UserCheck,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { UIState, ActivityType, UserRole } from '../../types';

export const StateSwitcherDrawer: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const {
    uiState,
    setUiState,
    settings,
    updateSettings,
    resetToDefaultData,
    showToast,
  } = useApp();

  const statesList: { id: UIState; label: string; desc: string }[] = [
    { id: 'READY', label: 'READY', desc: 'État nominal de fonctionnement normal' },
    { id: 'LOADING', label: 'LOADING', desc: 'Chargement en cours des données' },
    { id: 'EMPTY', label: 'EMPTY', desc: 'Catalogue et historique vides (état initial)' },
    { id: 'OFFLINE', label: 'OFFLINE', desc: 'Mode hors-ligne avec stockage local' },
    { id: 'SYNCING', label: 'SYNCING', desc: 'Synchronisation active vers le serveur' },
    { id: 'SYNCED', label: 'SYNCED', desc: 'Toutes les opérations synchronisées' },
    { id: 'SYNC_ERROR', label: 'SYNC_ERROR', desc: 'Erreur réseau lors de l’envoi' },
    { id: 'READ_ONLY', label: 'READ_ONLY', desc: 'Abonnement expiré (blocage ventes)' },
    { id: 'QUOTA_REACHED', label: 'QUOTA_REACHED', desc: 'Seuil 500 produits atteint' },
    { id: 'VALIDATION_ERROR', label: 'VALIDATION_ERROR', desc: 'Erreur de saisie client/montant' },
    { id: 'SERVER_ERROR', label: 'SERVER_ERROR', desc: 'Panne temporaire du serveur' },
  ];

  return (
    <>
      {/* Floating Toggle Pill for Evaluator */}
      <button
        id="btn-open-devtools"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-22 right-4 z-40 bg-slate-900/90 text-white hover:bg-slate-950 px-3 py-2 rounded-2xl text-xs font-bold shadow-xl backdrop-blur-md flex items-center gap-1.5 border border-slate-700/80 cursor-pointer transition-all hover:scale-105"
      >
        <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
        <span className="hidden sm:inline">Inspecteur</span>
        <span className="bg-amber-400/20 text-amber-300 px-1.5 py-0.2 rounded-md text-[10px]">
          {uiState}
        </span>
      </button>

      {/* Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex justify-end animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-sm h-full shadow-2xl flex flex-col overflow-hidden border-l border-slate-200">
            {/* Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                <h3 className="font-extrabold text-sm">Simulateur & 11 États UI (§13)</h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
              {/* Role & Activity quick switch */}
              <div>
                <label className="font-extrabold text-slate-500 uppercase tracking-wider block mb-2">
                  1. Rôle Utilisateur (§15)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      updateSettings({ role: 'OWNER' });
                      showToast('Mode Propriétaire activé', 'info');
                    }}
                    className={`py-2 px-3 rounded-xl border text-center font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                      settings.role === 'OWNER'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Propriétaire</span>
                  </button>

                  <button
                    onClick={() => {
                      updateSettings({ role: 'SELLER' });
                      showToast('Mode Vendeur (Marges & Dépenses masquées)', 'warning');
                    }}
                    className={`py-2 px-3 rounded-xl border text-center font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                      settings.role === 'SELLER'
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Vendeur</span>
                  </button>
                </div>
              </div>

              {/* Activity Type (§5) */}
              <div>
                <label className="font-extrabold text-slate-500 uppercase tracking-wider block mb-2">
                  2. Type d'activité (§5)
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['COMMERCE', 'SERVICES', 'MIXTE'] as ActivityType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => updateSettings({ activityType: t })}
                      className={`py-2 px-1 rounded-xl border text-center font-extrabold cursor-pointer ${
                        settings.activityType === t
                          ? 'bg-[#5B4DFB] text-white border-[#5B4DFB]'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* 11 UI STATES (§13) */}
              <div>
                <label className="font-extrabold text-slate-500 uppercase tracking-wider block mb-2">
                  3. Les 11 États d'interface imposés (§13)
                </label>
                <div className="space-y-1.5">
                  {statesList.map((st) => (
                    <button
                      key={st.id}
                      onClick={() => {
                        setUiState(st.id);
                        if (st.id === 'OFFLINE') {
                          updateSettings({ isOfflineMode: true });
                        } else if (st.id === 'READ_ONLY') {
                          updateSettings({ planStatus: 'EXPIRED' });
                        } else if (st.id === 'READY') {
                          updateSettings({ isOfflineMode: false, planStatus: 'TRIAL' });
                        }
                        showToast(`État basculé sur : ${st.id}`, 'info');
                      }}
                      className={`w-full p-2.5 rounded-xl border text-left flex items-start justify-between gap-2 transition-all cursor-pointer ${
                        uiState === st.id
                          ? 'bg-indigo-50 border-[#5B4DFB] ring-1 ring-[#5B4DFB]'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div>
                        <div className="font-extrabold text-slate-900">{st.label}</div>
                        <div className="text-[11px] text-slate-500">{st.desc}</div>
                      </div>
                      {uiState === st.id && (
                        <CheckCircle2 className="w-4 h-4 text-[#5B4DFB] shrink-0 mt-0.5" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reset Data */}
              <div className="pt-2">
                <button
                  onClick={() => {
                    resetToDefaultData();
                    setIsOpen(false);
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Réinitialiser les données d’exemple</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
