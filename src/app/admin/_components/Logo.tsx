interface LogoMarkProps {
  size?: number;
  className?: string;
}

// Pictogramme seul (carré indigo arrondi + "M" stylisé + pastille émeraude) —
// couleurs de marque fixes, inchangées quel que soit le fond.
export function LogoMark({ size = 32, className = '' }: LogoMarkProps) {
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} fill="none" className={className} role="img" aria-label="MoroCash">
      <rect width="36" height="36" rx="10" fill="#4338CA" />
      <path d="M10 23V13L18 20L26 13V23" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="26" cy="9" r="3" fill="#10B981" />
    </svg>
  );
}

interface LogoProps {
  size?: number;
  onDark?: boolean;
  className?: string;
}

// Logo complet (pictogramme + nom). Le back-office est toujours sur fond
// sombre (slate-950) : onDark passe "Moro" en blanc, "Cash" reste toujours
// indigo, couleur de marque.
export function Logo({ size = 32, onDark = true, className = '' }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span className="font-extrabold tracking-tight leading-none" style={{ fontSize: size * 0.5 }}>
        <span style={{ color: onDark ? '#FFFFFF' : '#0F172A' }}>Moro</span>
        <span style={{ color: '#4F46E5' }}>Cash</span>
      </span>
    </div>
  );
}
