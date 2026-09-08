import React, { useEffect, useRef } from 'react';

// Barre de progression de scroll : anime uniquement `transform: scaleX()`
// (jamais `width`), pour rester sur le compositeur GPU.
export const ScrollProgressBar: React.FC = () => {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const h = document.documentElement;
      const scrollable = h.scrollHeight - h.clientHeight || 1;
      const progress = Math.min(Math.max(h.scrollTop / scrollable, 0), 1);
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${progress})`;
      }
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => window.removeEventListener('scroll', update);
  }, []);

  return <div ref={barRef} className="scroll-progress" />;
};
