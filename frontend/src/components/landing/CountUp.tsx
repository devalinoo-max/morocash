import React, { useEffect, useRef, useState } from 'react';
import { landingEase } from './lib/easing';

interface CountUpProps {
  target: number;
  duration?: number;
  suffix?: string;
  trigger: boolean;
  className?: string;
}

// Compteur numérique GPU-friendly : ne touche à aucune mise en page, se
// contente de réécrire du texte à chaque frame via la même courbe
// d'accélération que le reste de la landing. Ne démarre qu'une seule fois,
// au premier passage de `trigger` à true (ex : révélation au scroll).
export const CountUp: React.FC<CountUpProps> = ({ target, duration = 1200, suffix = '', trigger, className }) => {
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (!trigger || started.current) return;
    started.current = true;
    let raf = 0;
    let start: number | null = null;

    const frame = (now: number) => {
      if (start === null) start = now;
      const t = Math.min((now - start) / duration, 1);
      setValue(Math.round(landingEase(t) * target));
      if (t < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [trigger, target, duration]);

  return (
    <span className={className}>
      {value.toLocaleString('fr-FR')}
      {suffix}
    </span>
  );
};
