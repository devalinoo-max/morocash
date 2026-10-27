import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * La photo d'un produit en grand, par-dessus l'écran.
 *
 * Les vignettes de la grille de vente restent petites pour garder beaucoup de
 * produits sous les yeux : un appui sur la photo l'ouvre ici en grand, le temps
 * de reconnaître le bon article. Un appui n'importe où, la croix ou Échap
 * referment. Rien n'est modifié : c'est un simple coup d'œil.
 */
export const ProductPhotoLightbox: React.FC<{
  photo: string;
  nom: string;
  prix?: string;
  onClose: () => void;
}> = ({ photo, nom, prix, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo de ${nom}`}
      className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer la photo"
        className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center cursor-pointer"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="w-full max-w-sm flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <img
          src={photo}
          alt={nom}
          referrerPolicy="no-referrer"
          className="w-full max-h-[70vh] object-contain rounded-2xl bg-white/5"
        />
        <div className="text-center">
          <p className="text-[15px] font-bold text-white leading-snug">{nom}</p>
          {prix && <p className="text-[14px] font-bold text-white/70 tabular-nums mt-0.5">{prix}</p>}
        </div>
      </div>
    </div>
  );
};
