import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { IosInstallGuide } from './IosInstallGuide';

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
      ? // Téléphone seulement : sur ordinateur, c'est la bannière d'installation.
        'md:hidden fixed bottom-20 right-4 z-30 shadow-xl'
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

      {showIosHelp && <IosInstallGuide onClose={() => setShowIosHelp(false)} />}
    </>
  );
};
