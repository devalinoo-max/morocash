import React from 'react';

interface LogoMarkProps {
  size?: number;
  className?: string;
}

// Pictogramme seul (carré indigo arrondi + "M" stylisé + pastille émeraude) —
// couleurs de marque fixes, inchangées quel que soit le fond ou le thème.
export const LogoMark: React.FC<LogoMarkProps> = ({ size = 36, className = '' }) => (
  <svg viewBox="0 0 36 36" width={size} height={size} fill="none" className={className} role="img" aria-label="MoroCash">
    <rect width="36" height="36" rx="10" fill="#4338CA" />
    <path d="M10 23V13L18 20L26 13V23" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="26" cy="9" r="3" fill="#10B981" />
  </svg>
);

interface LogoProps {
  size?: number;
  onDark?: boolean;
  showWordmark?: boolean;
  className?: string;
}

// Logo complet (pictogramme + nom). onDark passe "Moro" en blanc sur les
// fonds sombres fixes (écran de connexion, back-office, bandeau final de la
// landing) ; "Cash" reste toujours indigo, couleur de marque.
export const Logo: React.FC<LogoProps> = ({ size = 36, onDark = false, showWordmark = true, className = '' }) => (
  <div className={`flex items-center gap-2 ${className}`}>
    <LogoMark size={size} />
    {showWordmark && (
      <span className="font-extrabold tracking-tight leading-none" style={{ fontSize: size * 0.6 }}>
        <span style={{ color: onDark ? '#FFFFFF' : '#0B1C30' }}>Moro</span>
        <span style={{ color: '#4F46E5' }}>Cash</span>
      </span>
    )}
  </div>
);
