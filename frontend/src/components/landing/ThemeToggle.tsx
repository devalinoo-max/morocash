import React from 'react';
import { Moon, Sun } from 'lucide-react';
import type { LandingTheme } from './useLandingTheme';

interface ThemeToggleProps {
  theme: LandingTheme;
  onToggle: () => void;
  className?: string;
}

/**
 * Pastille de thème.
 *
 * L'icône est posée DANS la bille blanche et annonce le mode actif : lune
 * quand on est en sombre, soleil quand on est en clair. Le libellé (aria et
 * infobulle) annonce lui l'action, pas l'état — « Passer en mode clair »
 * quand on est dans le sombre. Les deux ne disent pas la même chose exprès :
 * l'un décrit ce qu'on voit, l'autre ce qui arrivera au clic.
 */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onToggle, className = '' }) => {
  const estSombre = theme === 'dark';
  const libelle = estSombre ? 'Passer en mode clair' : 'Passer en mode sombre';

  return (
    <button
      type="button"
      onClick={onToggle}
      data-theme={theme}
      role="switch"
      aria-checked={estSombre}
      aria-label={libelle}
      className={`theme-pill ${className}`}
    >
      <span className="theme-pill-knob">
        {estSombre ? (
          <Moon className="theme-pill-icon" strokeWidth={2.5} />
        ) : (
          <Sun className="theme-pill-icon" strokeWidth={2.5} />
        )}
      </span>
      <span className="theme-pill-tip" aria-hidden="true">
        {libelle}
      </span>
    </button>
  );
};
