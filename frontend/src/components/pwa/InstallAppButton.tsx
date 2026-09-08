import React, { useState } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

interface InstallAppButtonProps {
  variant?: 'floating' | 'inline';
  className?: string;
}

/**
 * Bouton "Installer l'application" (PWA) : déclenche le prompt natif sur
 * Chrome/Edge (desktop & Android). Sur iOS Safari, aucune API d'installation
 * n'existe — on affiche à la place les instructions manuelles (Partager >
 * Sur l'écran d'accueil). Ne s'affiche jamais si l'app tourne déjà en mode
 * installé (standalone).
 */
export const InstallAppButton: React.FC<InstallAppButtonProps> = ({ variant = 'inline', className = '' }) => {
  const { canPromptInstall, isIosManualInstall, isInstalled, promptInstall } = useInstallPrompt();
  const [showIosHelp, setShowIosHelp] = useState(false);

  if (isInstalled || (!canPromptInstall && !isIosManualInstall)) return null;

  const baseClasses =
    variant === 'floating'
      ? 'fixed bottom-20 md:bottom-6 right-4 z-30 shadow-xl'
      : '';

  const handleClick = () => {
    if (canPromptInstall) {
      promptInstall();
    } else {
      setShowIosHelp(true);
    }
  };

  return (
    <>
      <button
        id="btn-install-pwa"
        onClick={handleClick}
        className={`${baseClasses} ${className} inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#4338CA] hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer transition-all active:scale-95 shadow-md`}
      >
        <Download className="w-4 h-4" />
        <span>Installer l'application</span>
      </button>

      {showIosHelp && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl p-6 space-y-4 shadow-2xl border border-slate-100 relative">
            <button
              onClick={() => setShowIosHelp(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="font-extrabold text-base text-slate-900 pr-6">
              Installer MoroCash sur iPhone/iPad
            </h3>
            <ol className="space-y-3 text-xs text-slate-700 font-medium">
              <li className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-indigo-50 text-[#4338CA] flex items-center justify-center font-black shrink-0">1</span>
                <span className="flex items-center gap-1.5">
                  Appuie sur <Share className="w-4 h-4 text-sky-600" /> <strong>Partager</strong> dans Safari
                </span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-indigo-50 text-[#4338CA] flex items-center justify-center font-black shrink-0">2</span>
                <span className="flex items-center gap-1.5">
                  Choisis <SquarePlus className="w-4 h-4 text-slate-700" /> <strong>Sur l'écran d'accueil</strong>
                </span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-indigo-50 text-[#4338CA] flex items-center justify-center font-black shrink-0">3</span>
                <span>Confirme avec <strong>Ajouter</strong></span>
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
};
