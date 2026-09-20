import React from 'react';
import { RefreshCw } from 'lucide-react';

interface ListSentinelProps {
  /** Repère observé : son entrée dans l'écran déclenche la tranche suivante. */
  sentinelRef: React.Ref<HTMLDivElement>;
  hasMore: boolean;
  shown: number;
  total: number;
  /** Nom de ce qu'on compte, au pluriel : « articles », « journées »… */
  label: string;
}

/**
 * Bas d'une liste affichée par tranches (voir useIncrementalList) : un repère
 * invisible tant qu'il reste des lignes à venir, puis le compte total une fois
 * tout affiché — pour qu'on sache qu'on est arrivé au bout, et pas devant une
 * liste tronquée.
 */
export const ListSentinel: React.FC<ListSentinelProps> = ({
  sentinelRef,
  hasMore,
  shown,
  total,
  label,
}) => {
  if (!hasMore) {
    if (total === 0) return null;
    return (
      <p className="py-4 text-center text-[11px] font-semibold text-slate-400">
        {total} {label} · c’est tout
      </p>
    );
  }

  return (
    <div ref={sentinelRef} className="py-5 flex items-center justify-center gap-2 text-slate-400">
      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
      <span className="text-[11px] font-semibold">
        {shown} sur {total} {label}…
      </span>
    </div>
  );
};
