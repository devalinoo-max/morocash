import React, { useEffect, useRef, useState } from 'react';

export type RevealVariant = 'up' | 'left' | 'right' | 'zoom' | 'blur';

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  delayMs?: number;
  variant?: RevealVariant;
  onReveal?: () => void;
}

// Révélation au scroll : un seul IntersectionObserver par bloc, déclenché
// une fois, qui bascule .is-visible. Toute l'animation (translate/scale/
// opacity/blur) vit dans index.css sous .morocash-landing .reveal* pour
// garantir des transitions GPU-only (transform + opacity, jamais
// width/height/top/left) sur une unique courbe d'accélération partagée.
export const Reveal: React.FC<RevealProps> = ({ children, className = '', style, delayMs = 0, variant = 'up', onReveal }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          onReveal?.();
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      style={{ ...style, transitionDelay: isVisible ? `${delayMs}ms` : '0ms' }}
      className={`reveal reveal-${variant} ${isVisible ? 'is-visible' : ''} ${className}`}
    >
      {children}
    </div>
  );
};
