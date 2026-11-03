import { useEffect, useState } from 'react';

export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
  /** Rayon des coins de l'élément, lu sur ses styles calculés. */
  radius: number;
}

/** Marge de pleine lumière autour de l'élément éclairé. */
export const SPOTLIGHT_PAD = 8;
/** Supplément de rayon de la découpe, par-dessus celui de l'élément. */
export const SPOTLIGHT_RADIUS_BONUS = 4;
/**
 * Temps laissé à l'élément pour apparaître avant de le déclarer absent.
 *
 * Généreux à dessein : ouvrir la fenêtre de vente ou le formulaire produit
 * demande un changement d'onglet et un chargement différé. Trop court, et la
 * bulle qui compte se faisait sauter sur un écran qui arrivait juste après.
 */
export const DELAI_ABANDON_MS = 6000;

/** Temps laissé au défilement avant de poser la bulle. */
export const SCROLL_SETTLE_MS = 150;

function mesurer(el: Element): AnchorRect {
  const r = el.getBoundingClientRect();
  // Un élément replié ou masqué occupe un rectangle vide : il n'est pas
  // montrable, et le traiter comme absent fait sauter la bulle plutôt que
  // d'éclairer un carré d'un pixel au coin de l'écran.
  const brut = getComputedStyle(el).borderTopLeftRadius;
  const radius = Number.parseFloat(brut) || 0;
  return { top: r.top, left: r.left, width: r.width, height: r.height, radius };
}

/**
 * L'élément occupe une place à l'écran et répond au doigt.
 *
 * Distinct de `estMontrable` : un élément affiché mais momentanément recouvert
 * par une fenêtre existe bel et bien, il faut l'attendre, pas le sauter.
 */
function estAffiche(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const style = getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  // Un bouton désactivé est pire qu'un bouton absent : la bulle dit « appuie »
  // et rien ne se passe, personne ne comprend pourquoi. On le tient donc pour
  // introuvable — soit il s'active et le traqueur l'adopte, soit la bulle est
  // sautée, et dans les deux cas le commerçant n'est pas bloqué.
  if ('disabled' in el && (el as { disabled?: boolean }).disabled === true) return false;
  return el.getAttribute('aria-disabled') !== 'true';
}

function estMontrable(el: Element): boolean {
  if (!estAffiche(el)) return false;
  const r = el.getBoundingClientRect();
  // Un bouton désactivé est pire qu'un bouton absent : la bulle dit « appuie »
  // et rien ne se passe, personne ne comprend pourquoi. On le tient donc pour
  // introuvable — soit il s'active et le traqueur l'adopte aussitôt, soit la
  // bulle est sautée, et dans les deux cas le commerçant n'est pas bloqué.
  // Une fenêtre peut s'ouvrir PAR-DESSUS la cible (choisir un client, scanner
  // un code). Le voile de la visite découpe alors un trou sur un élément
  // inatteignable, et ses panneaux rendent la fenêtre inutilisable : le
  // commerçant est piégé. On tient donc une cible recouverte pour non
  // montrable — la visite s'efface, la fenêtre s'utilise, et la bulle revient
  // d'elle-même quand la cible redevient accessible.
  // On interroge le centre de la PARTIE VISIBLE de l'élément, pas son centre
  // tout court : une grande carte dont le milieu tombe sous le bas de l'écran
  // ferait sinon désigner un tout autre élément, et la bulle ne s'afficherait
  // jamais — alors qu'il suffit de faire défiler jusqu'à elle.
  const gauche = Math.max(r.left, 0);
  const droite = Math.min(r.right, window.innerWidth);
  const haut = Math.max(r.top, 0);
  const bas = Math.min(r.bottom, window.innerHeight);

  // Entièrement hors écran : rien à interroger, et le défilement d'approche
  // va justement l'amener à l'écran. On le tient pour atteignable.
  if (droite <= gauche || bas <= haut) return true;

  const dessus = document
    .elementsFromPoint((gauche + droite) / 2, (haut + bas) / 2)
    .find((noeud) => !noeud.closest('[data-tour-overlay]'));
  if (!dessus) return false;
  return el.contains(dessus) || dessus.contains(el);
}

/**
 * Suit en continu le rectangle de l'élément désigné par `selector`.
 *
 * Rend `undefined` tant que la recherche est en cours (l'écran peut mettre
 * quelques images à monter la fenêtre visée), et `null` dès qu'on sait que
 * l'élément n'existe pas : c'est ce `null` qui fait sauter la bulle, sans
 * écran noir ni blocage.
 *
 * `prête` ne passe à vrai qu'après le défilement d'approche, pour que la bulle
 * n'apparaisse pas en route puis saute à l'arrivée.
 */
export function useAnchorRect(
  selector: string | null,
  /** Relance la recherche quand l'étape change, même pour le même sélecteur. */
  cle: string
): { rect: AnchorRect | null | undefined; element: Element | null; prete: boolean } {
  const [rect, setRect] = useState<AnchorRect | null | undefined>(undefined);
  const [element, setElement] = useState<Element | null>(null);
  const [prete, setPrete] = useState(false);
  // Clé à laquelle se rapportent les trois valeurs ci-dessus. Sans elle, le
  // premier rendu d'une nouvelle étape lit encore le résultat de l'ancienne —
  // et une bulle centrée (pas de cible, donc rect null et prete vrai) faisait
  // aussitôt déclarer « cible absente » à l'étape suivante, qui se sautait.
  const [cleRapportee, setCleRapportee] = useState(cle);

  useEffect(() => {
    setCleRapportee(cle);
  }, [cle]);

  useEffect(() => {
    // Bulle centrée : pas d'élément à suivre, rien à attendre.
    if (!selector) {
      setRect(null);
      setElement(null);
      setPrete(true);
      return;
    }

    setRect(undefined);
    setElement(null);
    setPrete(false);

    let vivant = true;
    let cible: Element | null = null;
    let settleTimer: number | undefined;
    let abandonTimer: number | undefined;

    const rafraichir = () => {
      if (!vivant || !cible) return;
      if (!cible.isConnected || !estMontrable(cible)) {
        // L'élément a disparu en cours d'étape (fenêtre fermée, accordéon
        // replié) : on repart en recherche plutôt que d'éclairer du vide.
        cible = null;
        setElement(null);
        setRect(undefined);
        chercher();
        return;
      }
      setRect(mesurer(cible));
    };

    const adopter = (el: Element) => {
      cible = el;
      setElement(el);
      // D'abord amener l'élément dans l'écran, puis laisser le défilement se
      // terminer : la bulle se pose sur une position stable.
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      setRect(mesurer(el));
      settleTimer = window.setTimeout(() => {
        if (!vivant) return;
        rafraichir();
        setPrete(true);
      }, SCROLL_SETTLE_MS);
    };

    const chercher = () => {
      if (!vivant || cible) return;
      // Le même repère existe souvent en deux exemplaires — la barre du bas sur
      // téléphone, la barre latérale sur ordinateur — dont un seul est affiché.
      // On retient le premier réellement montrable, pas le premier du document.
      for (const candidat of document.querySelectorAll(selector)) {
        if (estMontrable(candidat)) {
          adopter(candidat);
          return;
        }
      }
    };

    chercher();

    // L'élément visé peut n'apparaître qu'après un changement d'écran ou
    // l'ouverture d'une fenêtre : on guette le DOM pendant un temps borné.
    const observer = new MutationObserver(() => {
      if (cible) rafraichir();
      else chercher();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    const resize = new ResizeObserver(() => rafraichir());
    resize.observe(document.body);

    window.addEventListener('scroll', rafraichir, true);
    window.addEventListener('resize', rafraichir);

    // Au bout de ce délai sans avoir rien trouvé, l'élément n'existe pas sur
    // cet écran : on le déclare absent et la bulle est sautée.
    const armerAbandon = () => {
      abandonTimer = window.setTimeout(() => {
        if (!vivant || cible) return;
        // Un élément existe, il est simplement caché derrière une fenêtre
        // ouverte par-dessus : on patiente au lieu de sauter l'étape. C'est ce
        // qui évite de brûler trois bulles pendant qu'on choisit un client.
        const attendu = [...document.querySelectorAll(selector)].some(estAffiche);
        if (attendu) {
          armerAbandon();
          return;
        }
        setRect(null);
        setPrete(true);
      }, DELAI_ABANDON_MS);
    };
    armerAbandon();

    return () => {
      vivant = false;
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener('scroll', rafraichir, true);
      window.removeEventListener('resize', rafraichir);
      if (settleTimer) window.clearTimeout(settleTimer);
      if (abandonTimer) window.clearTimeout(abandonTimer);
    };
  }, [selector, cle]);

  // Tant que l'effet de réinitialisation n'a pas tourné, les valeurs en
  // mémoire décrivent encore l'étape précédente : on rend l'état de départ
  // (« on cherche encore »), jamais un verdict qui n'est pas le sien.
  if (cleRapportee !== cle) {
    return { rect: undefined, element: null, prete: false };
  }

  return { rect, element, prete };
}
