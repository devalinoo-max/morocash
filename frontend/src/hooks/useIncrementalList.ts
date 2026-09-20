import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Affichage progressif d'une liste longue.
 *
 * Un catalogue de 900 articles ou un an d'historique de commandes construit
 * autant de lignes dans le navigateur, d'un coup : sur les téléphones d'entrée
 * de gamme qui font tourner MoroCash, c'est plusieurs secondes d'écran figé
 * alors que seules les dix premières lignes sont regardées. On n'en rend donc
 * qu'une tranche, et on avance quand le repère de fin entre dans l'écran.
 *
 * La liste complète reste disponible pour tout ce qui n'est pas de l'affichage
 * (totaux, exports, recherche) : ne pas dessiner n'est pas ne pas compter.
 */
export function useIncrementalList<T>(items: T[], step = 24) {
  const [visibleCount, setVisibleCount] = useState(step);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Un changement de filtre ou de recherche repart du haut : garder l'ancien
  // compteur ferait apparaître 300 lignes d'un coup après une saisie.
  useEffect(() => {
    setVisibleCount(step);
  }, [items, step]);

  const hasMore = visibleCount < items.length;

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !hasMore) return;

    // IntersectionObserver manque sur quelques très vieux navigateurs : on
    // montre alors tout plutôt que de bloquer la liste sur ses 24 premiers.
    if (typeof IntersectionObserver === 'undefined') {
      setVisibleCount(items.length);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((current) => Math.min(current + step, items.length));
        }
      },
      // Marge basse : la tranche suivante est prête avant d'arriver au bout.
      { rootMargin: '400px 0px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, items.length, step]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  return { visibleItems, hasMore, sentinelRef, visibleCount, total: items.length };
}
