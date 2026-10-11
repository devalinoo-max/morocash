import React, { useEffect, useRef, useState } from 'react';
import { Share, SquarePlus, X } from 'lucide-react';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

const DISMISS_KEY = 'morocash_install_banner_dismissed_at';
const HIDE_AFTER_DISMISS_MS = 14 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 20_000;

// Si le stockage du téléphone est indisponible, le « × » vaut au moins pour la
// session en cours.
let dismissedThisSession = false;

function wasDismissedRecently(): boolean {
  if (dismissedThisSession) return true;
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return at > 0 && Date.now() - at < HIDE_AFTER_DISMISS_MS;
  } catch {
    return false;
  }
}

function rememberDismissal(): void {
  dismissedThisSession = true;
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Stockage indisponible : la bannière reste cachée pour cette session.
  }
}

export interface InstallBannerState {
  visible: boolean;
  /** Android / ordinateur : la fenêtre d'installation du navigateur est disponible. */
  canPrompt: boolean;
  install: () => Promise<boolean>;
  dismiss: () => void;
}

/**
 * Quand afficher la bannière « Installer MoroCash » : 20 s après l'ouverture,
 * une seule fois par visite, jamais si l'app est installée, et plus pendant
 * 14 jours après un « × ». `eligible` dit si l'écran courant l'accepte.
 */
export function useInstallBanner(eligible: boolean): InstallBannerState {
  const { canPromptInstall, isIosManualInstall, isInstalled, promptInstall } = useInstallPrompt();
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(wasDismissedRecently);
  // Elle a déjà été montrée puis a quitté l'écran : pas de second passage.
  const [finished, setFinished] = useState(false);
  const wasVisible = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const visible =
    ready && eligible && !dismissed && !finished && !isInstalled && (canPromptInstall || isIosManualInstall);

  useEffect(() => {
    if (wasVisible.current && !visible) setFinished(true);
    wasVisible.current = visible;
  }, [visible]);

  return {
    visible,
    canPrompt: canPromptInstall,
    install: promptInstall,
    dismiss: () => {
      rememberDismissal();
      setDismissed(true);
    },
  };
}

/**
 * La barre d'installation, sur ordinateur seulement (le téléphone garde son
 * bouton flottant, voir InstallAppButton). Elle occupe sa place dans la page :
 * une ligne compacte en bas à gauche du contenu, qui ne recouvre rien.
 */
export const InstallBanner: React.FC<{ banner: InstallBannerState }> = ({ banner }) => {
  const [showIosSteps, setShowIosSteps] = useState(false);

  if (!banner.visible) return null;

  const handleInstall = () => {
    if (banner.canPrompt) void banner.install();
    else setShowIosSteps(true);
  };

  return (
    <>
      <div id="install-banner" className="hidden md:flex md:justify-start shrink-0 px-6 pb-4">
        <div
          className="h-14 bg-white flex items-center gap-2 pl-3"
          style={{ border: '1px solid #E5E7EB', borderRadius: 12 }}
        >
          <img
            src="/icons/icon-192.png"
            alt=""
            className="w-8 h-8 rounded-lg shrink-0"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <p className="flex-1 min-w-0 text-xs font-bold text-slate-800 leading-tight">
            Installe MoroCash sur ton écran d’accueil
          </p>
          <button
            type="button"
            id="btn-install-pwa"
            onClick={handleInstall}
            className="h-12 px-4 shrink-0 rounded-lg text-white text-xs font-bold cursor-pointer active:scale-95 transition-transform"
            style={{ backgroundColor: '#4F46E5' }}
          >
            Installer
          </button>
          <button
            type="button"
            onClick={banner.dismiss}
            aria-label="Fermer"
            className="w-12 h-12 shrink-0 flex items-center justify-center text-slate-500 hover:text-slate-900 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* iPhone : Apple ne permet pas d'installer par code, on montre les deux gestes. */}
      {showIosSteps && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50"
          onClick={() => setShowIosSteps(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Installer MoroCash"
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-sm rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-extrabold text-slate-900">Installer MoroCash</h3>
              <button
                type="button"
                onClick={() => setShowIosSteps(false)}
                aria-label="Fermer"
                className="w-12 h-12 -mr-3 -my-2 flex items-center justify-center text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <ol className="space-y-3 text-sm font-bold text-slate-800">
              <li className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                  <Share className="w-4 h-4 text-sky-600" />
                </span>
                <span>1. Touche Partager</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                  <SquarePlus className="w-4 h-4 text-slate-700" />
                </span>
                <span>2. Touche Sur l’écran d’accueil</span>
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
};
