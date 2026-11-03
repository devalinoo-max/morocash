import React, { useState } from 'react';
import { ProductPhotoLightbox } from '../products/ProductPhotoLightbox';

/**
 * Une vignette que l'on peut ouvrir en grand.
 *
 * Partout dans l'application les photos sont minuscules — 34 à 56 px — parce
 * que l'écran d'un téléphone doit montrer beaucoup de lignes à la fois. À
 * cette taille on devine l'article, on ne le reconnaît pas. Un appui ouvre
 * donc la photo par-dessus l'écran, comme dans la grille de « Nouvelle
 * commande », le temps d'un coup d'œil : rien n'est modifié, rien n'est
 * enregistré.
 *
 * La vignette vit souvent à l'intérieur d'une ligne déjà cliquable (la fiche
 * produit s'ouvre quand on touche la carte) : l'appui sur la photo est donc
 * arrêté ici et n'atteint pas la ligne.
 */
export const ZoomablePhoto: React.FC<{
  /** L'adresse de l'image. */
  photo: string;
  /** Le nom affiché sous la photo agrandie, et lu par les lecteurs d'écran. */
  nom: string;
  /** Une seconde ligne sous le nom : le prix, la date, la quantité… */
  legende?: string;
  /** La forme de la vignette (taille, arrondi, bordure). */
  className?: string;
  /** Le texte alternatif, vide quand le nom est déjà écrit juste à côté. */
  alt?: string;
}> = ({ photo, nom, legende, className = '', alt = '' }) => {
  const [ouverte, setOuverte] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={`Voir la photo de ${nom} en grand`}
        onClick={(e) => {
          e.stopPropagation();
          setOuverte(true);
        }}
        className={`overflow-hidden bg-slate-100 cursor-zoom-in ${className}`}
      >
        <img
          src={photo}
          alt={alt}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      </button>

      {ouverte && (
        <ProductPhotoLightbox
          photo={photo}
          nom={nom}
          prix={legende}
          onClose={() => setOuverte(false)}
        />
      )}
    </>
  );
};
