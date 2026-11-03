import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  SPOTLIGHT_PAD,
  SPOTLIGHT_RADIUS_BONUS,
  useAnchorRect,
  type AnchorRect,
} from './useAnchorRect';
import type { TourStep } from './types';

const VOILE = 'rgba(15, 23, 42, 0.72)';
const INDIGO = '#4F46E5';
/** Courbe commune à toutes les transitions de la visite. */
const EASE = [0.22, 1, 0.36, 1] as const;
/** Un battement de halo, au repos. */
const RESPIRATION_MS = 1600;
/** Battement accéléré, quand on insiste au bout de 8 secondes. */
const RESPIRATION_PRESSEE_MS = 900;
/** Sans réaction pendant ce temps, le halo s'accélère — une fois, pas plus. */
const DELAI_INSISTANCE_MS = 8000;
/** Trois battements pressés, puis on reprend le rythme normal. */
const DUREE_INSISTANCE_MS = RESPIRATION_PRESSEE_MS * 3;

const LARGEUR_BULLE = 300;
const MARGE_ECRAN = 16;
const FLECHE = 10;
/** Vide entre l'élément éclairé et la bulle. */
const ECART_BULLE = 14;

/**
 * Relit la validité d'un champ à ce rythme, en plus des événements de saisie.
 *
 * Les événements seuls ne suffisent pas : un clavier de téléphone, un
 * remplissage automatique ou un collage n'émettent pas toujours `input`, et le
 * bouton « Suivant » resterait gris devant un champ pourtant rempli.
 */
const RELECTURE_VALIDITE_MS = 200;

/** Découpe le texte d'une bulle sur ses `**gras**`. */
function morceaux(texte: string): { texte: string; gras: boolean }[] {
  return texte
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((part) => part.length > 0)
    .map((part) =>
      part.startsWith('**') && part.endsWith('**')
        ? { texte: part.slice(2, -2), gras: true }
        : { texte: part, gras: false }
    );
}

/** Le texte de la bulle, avec le nom du bouton à presser mis en évidence. */
const TexteBulle: React.FC<{ texte: string }> = ({ texte }) => (
  <>
    {morceaux(texte).map((m, i) =>
      m.gras ? (
        <strong key={i} style={{ fontWeight: 800, color: 'inherit' }}>
          {m.texte}
        </strong>
      ) : (
        <React.Fragment key={i}>{m.texte}</React.Fragment>
      )
    )}
  </>
);

/** Rectangle de la découpe : l'élément plus sa marge de pleine lumière. */
function decoupe(rect: AnchorRect) {
  return {
    top: rect.top - SPOTLIGHT_PAD,
    left: rect.left - SPOTLIGHT_PAD,
    width: rect.width + SPOTLIGHT_PAD * 2,
    height: rect.height + SPOTLIGHT_PAD * 2,
    radius: rect.radius + SPOTLIGHT_RADIUS_BONUS,
  };
}

type Decoupe = ReturnType<typeof decoupe>;

interface TourOverlayProps {
  step: TourStep;
  index: number;
  total: number;
  /** Clé de l'étape : relance le suivi de l'élément et l'horloge d'insistance. */
  cle: string;
  onSuivant: () => void;
  onPasser: () => void;
  /** L'élément visé n'existe pas sur cet écran : la bulle doit être sautée. */
  onCibleAbsente: () => void;
  /** Remonte l'élément visé, pour que le moteur puisse lire un champ en frappe. */
  onCible: (el: Element | null) => void;
}

export const TourOverlay: React.FC<TourOverlayProps> = ({
  step,
  index,
  total,
  cle,
  onSuivant,
  onPasser,
  onCibleAbsente,
  onCible,
}) => {
  const reduire = useReducedMotion();
  const { rect, element, prete } = useAnchorRect(step.target, cle);
  const [presse, setPresse] = useState(false);
  const [valide, setValide] = useState(false);

  useEffect(() => {
    onCible(element);
  }, [element, onCible]);

  // Cible introuvable : on saute la bulle, sans rien afficher et sans erreur.
  useEffect(() => {
    if (step.target && prete && rect === null) onCibleAbsente();
  }, [step.target, prete, rect, onCibleAbsente]);

  // ── Bulle « Remplis » ───────────────────────────────────────────────────
  // Le champ prend le focus dès que la bulle s'affiche, pour que le clavier
  // s'ouvre sans un appui de plus. `preventScroll` est essentiel : sans lui le
  // navigateur refait défiler l'écran par-dessus le défilement d'approche déjà
  // terminé, la découpe se décale et la bulle se pose à côté du champ.
  useEffect(() => {
    if (step.kind !== 'remplis' || !prete) return;
    if (!(element instanceof HTMLElement)) return;
    element.focus({ preventScroll: true });
  }, [step.kind, element, prete]);

  // La validité du champ pilote le seul bouton « Suivant » — et rien d'autre.
  // Une bulle « Remplis » n'avance JAMAIS toute seule : autrement la bulle
  // saute au bout de deux lettres, le voile recouvre le champ en cours de
  // frappe, et le commerçant ne peut plus écrire.
  useEffect(() => {
    if (step.kind !== 'remplis') {
      setValide(false);
      return;
    }
    const relire = () => setValide(step.valide?.(element) === true);
    relire();

    const horloge = window.setInterval(relire, RELECTURE_VALIDITE_MS);
    element?.addEventListener('input', relire);
    element?.addEventListener('change', relire);
    return () => {
      window.clearInterval(horloge);
      element?.removeEventListener('input', relire);
      element?.removeEventListener('change', relire);
    };
  }, [step, element]);

  // On insiste une fois : au bout de 8 secondes sans réaction, le halo
  // s'accélère pendant trois battements, puis reprend son rythme. Réservé aux
  // bulles « Appuie » : sur un champ à remplir, presser la personne pendant
  // qu'elle cherche ses mots n'aide personne.
  useEffect(() => {
    setPresse(false);
    if (step.kind !== 'appuie' || reduire) return;
    let fin: number | undefined;
    const debut = window.setTimeout(() => {
      setPresse(true);
      fin = window.setTimeout(() => setPresse(false), DUREE_INSISTANCE_MS);
    }, DELAI_INSISTANCE_MS);
    return () => {
      window.clearTimeout(debut);
      if (fin) window.clearTimeout(fin);
    };
  }, [cle, step.kind, reduire]);

  // Une bulle est-elle réellement à l'écran ? Tant que la cible n'est pas
  // trouvée, la visite n'affiche rien — et ne doit alors rien intercepter.
  const bulleAffichee = !step.target || (rect !== undefined && rect !== null);

  // On ne sort que par « Passer » ou par Échap : un appui à côté ne ferme
  // rien. Et quand la visite s'efface derrière une fenêtre ouverte par-dessus,
  // Échap appartient à cette fenêtre, pas à la visite.
  useEffect(() => {
    if (!bulleAffichee) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onPasser();
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [onPasser, bulleAffichee]);

  // Tant qu'on cherche l'élément, rien à l'écran : ni voile à moitié posé, ni
  // bulle au mauvais endroit.
  if (!bulleAffichee) return null;

  const trou = rect ? decoupe(rect) : null;
  const battement = presse ? RESPIRATION_PRESSEE_MS : RESPIRATION_MS;

  return (
    <div
      data-tour-overlay=""
      data-tour-step={step.id}
      data-tour-kind={step.kind}
      className="fixed inset-0 z-[96] pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label="Visite guidée"
    >
      {trou ? (
        <>
          {/* Le voile, et la découpe qui laisse l'élément en pleine lumière.
              L'ombre portée géante EST le voile : la découpe garde ainsi ses
              coins arrondis et se redimensionne d'un seul tenant. Elle suit le
              champ tant que la bulle est affichée, donc le voile ne vient
              jamais recouvrir ce qu'on demande de remplir. */}
          <motion.div
            className="absolute pointer-events-none"
            initial={reduire ? false : { opacity: 0 }}
            animate={{
              opacity: 1,
              top: trou.top,
              left: trou.left,
              width: trou.width,
              height: trou.height,
              borderRadius: trou.radius,
            }}
            transition={
              reduire
                ? { duration: 0 }
                : { opacity: { duration: 0.3 }, default: { duration: 0.32, ease: EASE } }
            }
            style={{ boxShadow: `0 0 0 9999px ${VOILE}` }}
          />

          {/* L'anneau qui respire, collé à la découpe. */}
          {!reduire && (
            <motion.div
              className="absolute pointer-events-none"
              animate={{
                top: trou.top,
                left: trou.left,
                width: trou.width,
                height: trou.height,
                borderRadius: trou.radius,
                scale: [1, 1.06, 1],
                opacity: [1, 0.5, 1],
              }}
              transition={{
                default: { duration: 0.32, ease: EASE },
                scale: { duration: battement / 1000, repeat: Infinity, ease: 'easeInOut' },
                opacity: { duration: battement / 1000, repeat: Infinity, ease: 'easeInOut' },
              }}
              style={{ border: `2px solid ${INDIGO}` }}
            />
          )}

          {/* Bulle « Appuie » : une seconde onde part du centre et se dissipe,
              pour dire que c'est à l'utilisateur de presser le bouton. */}
          {!reduire && step.kind === 'appuie' && (
            <motion.div
              className="absolute pointer-events-none"
              animate={{
                top: trou.top,
                left: trou.left,
                width: trou.width,
                height: trou.height,
                borderRadius: trou.radius,
                scale: [1, 1.4],
                opacity: [0.35, 0],
              }}
              transition={{
                default: { duration: 0.32, ease: EASE },
                scale: { duration: battement / 1000, repeat: Infinity, delay: 0.4, ease: 'easeOut' },
                opacity: {
                  duration: battement / 1000,
                  repeat: Infinity,
                  delay: 0.4,
                  ease: 'easeOut',
                },
              }}
              style={{ border: `2px solid ${INDIGO}` }}
            />
          )}

          {/* Rien ne réagit au clic, sauf l'élément éclairé : quatre panneaux
              qui entourent la découpe sans la couvrir. Ils avalent le clic
              sans rien fermer — on ne sort que par « Passer » ou Échap. */}
          <Bloqueurs trou={trou} />
        </>
      ) : (
        /* Bulle centrée, sans projecteur : le voile couvre tout l'écran. */
        <motion.div
          className="absolute inset-0 pointer-events-auto"
          initial={reduire ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduire ? 0 : 0.3 }}
          style={{ background: VOILE }}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      <Bulle
        step={step}
        index={index}
        total={total}
        trou={trou}
        reduire={!!reduire}
        valide={valide}
        onSuivant={onSuivant}
        onPasser={onPasser}
      />
    </div>
  );
};

/** Les quatre panneaux qui rendent tout inerte sauf la découpe. */
const Bloqueurs: React.FC<{ trou: Decoupe }> = ({ trou }) => {
  const avaler = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <>
      <div
        className="absolute pointer-events-auto"
        style={{ top: 0, left: 0, right: 0, height: Math.max(0, trou.top) }}
        onClick={avaler}
      />
      <div
        className="absolute pointer-events-auto"
        style={{ top: trou.top + trou.height, left: 0, right: 0, bottom: 0 }}
        onClick={avaler}
      />
      <div
        className="absolute pointer-events-auto"
        style={{ top: trou.top, left: 0, width: Math.max(0, trou.left), height: trou.height }}
        onClick={avaler}
      />
      <div
        className="absolute pointer-events-auto"
        style={{ top: trou.top, left: trou.left + trou.width, right: 0, height: trou.height }}
        onClick={avaler}
      />
    </>
  );
};

interface BulleProps {
  step: TourStep;
  index: number;
  total: number;
  trou: Decoupe | null;
  reduire: boolean;
  /** Bulle « Remplis » : le champ pointé est-il valide ? */
  valide: boolean;
  onSuivant: () => void;
  onPasser: () => void;
}

const Bulle: React.FC<BulleProps> = ({
  step,
  index,
  total,
  trou,
  reduire,
  valide,
  onSuivant,
  onPasser,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [hauteur, setHauteur] = useState(0);

  // La bulle va au-dessus ou en dessous selon la place : il faut sa hauteur
  // réelle, mesurée après le rendu, pour décider sans la faire sortir.
  useLayoutEffect(() => {
    if (ref.current) setHauteur(ref.current.offsetHeight);
  }, [step.id, step.texte]);

  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const vw = typeof window === 'undefined' ? 390 : window.innerWidth;
  const largeur = Math.min(LARGEUR_BULLE, vw - MARGE_ECRAN * 2);

  const centree = !trou || step.variante === 'plein-ecran' || step.variante === 'panneau-bas';
  // En dessous si l'élément est dans la moitié haute de l'écran, au-dessus
  // sinon — et jamais hors de l'écran.
  const dessous = trou ? trou.top + trou.height / 2 < vh / 2 : true;

  let top = 0;
  let left = 0;
  if (trou && !centree) {
    top = dessous ? trou.top + trou.height + ECART_BULLE : trou.top - ECART_BULLE - hauteur;
    top = Math.min(Math.max(top, MARGE_ECRAN), Math.max(MARGE_ECRAN, vh - hauteur - MARGE_ECRAN));
    left = trou.left + trou.width / 2 - largeur / 2;
    left = Math.min(Math.max(left, MARGE_ECRAN), Math.max(MARGE_ECRAN, vw - largeur - MARGE_ECRAN));
  }

  const apparition = reduire
    ? { initial: false as const, animate: {}, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.22, ease: EASE },
      };

  const fondIndigo = step.variante === 'panneau-bas';

  const position: React.CSSProperties = centree
    ? {
        left: '50%',
        marginLeft: -largeur / 2,
        ...(step.variante === 'panneau-bas'
          ? { bottom: 24 }
          : { top: '50%', marginTop: -hauteur / 2 }),
      }
    : { top, left };

  // Une bulle « Appuie » n'a pas de bouton : l'appui réel la fait passer.
  // Une bulle « Remplis » en a un, mais il reste éteint tant que le champ ne
  // vaut rien — le commerçant finit d'écrire, puis appuie.
  const aBouton = step.kind !== 'appuie';
  const actif = step.kind !== 'remplis' || valide;

  return (
    <motion.div
      ref={ref}
      {...apparition}
      className="absolute pointer-events-auto"
      style={{
        width: largeur,
        borderRadius: 16,
        padding: 16,
        background: fondIndigo ? INDIGO : '#FFFFFF',
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)',
        ...position,
      }}
    >
      {/* La flèche qui désigne l'élément. */}
      {trou && !centree && (
        <span
          aria-hidden
          className="absolute"
          style={{
            left: Math.min(
              Math.max(trou.left + trou.width / 2 - left - FLECHE, 14),
              Math.max(14, largeur - 14 - FLECHE * 2)
            ),
            [dessous ? 'top' : 'bottom']: -FLECHE,
            width: 0,
            height: 0,
            borderLeft: `${FLECHE}px solid transparent`,
            borderRight: `${FLECHE}px solid transparent`,
            ...(dessous
              ? { borderBottom: `${FLECHE}px solid #FFFFFF` }
              : { borderTop: `${FLECHE}px solid #FFFFFF` }),
          }}
        />
      )}

      {step.titre && (
        <p
          className="font-bold"
          style={{ fontSize: 15, color: fondIndigo ? '#FFFFFF' : '#0F172A', margin: 0 }}
        >
          {step.titre}
        </p>
      )}
      <p
        style={{
          fontSize: 14,
          lineHeight: 1.5,
          color: fondIndigo ? 'rgba(255,255,255,0.92)' : '#475569',
          margin: step.titre ? '6px 0 0' : 0,
          // 320 px de large : un mot long ne doit pas déborder de la bulle.
          overflowWrap: 'anywhere',
        }}
      >
        <TexteBulle texte={step.texte} />
      </p>

      <div className="flex items-center justify-between gap-3" style={{ marginTop: 14 }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <Points index={index} total={total} reduire={reduire} sombre={fondIndigo} />
          {/* « Passer » est là sur toutes les bulles, sans exception : qui ne
              peut pas sortir se sent piégé, et c'est pire que de ne pas guider. */}
          <button
            type="button"
            onClick={onPasser}
            className="cursor-pointer hover:underline shrink-0"
            style={{
              fontSize: 13,
              color: fondIndigo ? 'rgba(255,255,255,0.75)' : '#94A3B8',
              background: 'none',
              border: 0,
              padding: 0,
            }}
          >
            Passer
          </button>
        </div>

        {aBouton ? (
          <button
            type="button"
            onClick={actif ? onSuivant : undefined}
            disabled={!actif}
            aria-disabled={!actif}
            // Le focus reste au champ sur une bulle « Remplis » : le prendre
            // ici fermerait le clavier au moment où il vient de s'ouvrir.
            autoFocus={step.kind === 'regarde'}
            className={`shrink-0 font-bold ${actif ? 'cursor-pointer' : 'cursor-not-allowed'}`}
            style={{
              fontSize: 14,
              padding: '8px 16px',
              borderRadius: 999,
              background: fondIndigo ? '#FFFFFF' : INDIGO,
              color: fondIndigo ? INDIGO : '#FFFFFF',
              border: 0,
              opacity: actif ? 1 : 0.4,
              transition: reduire ? 'none' : 'opacity 160ms ease',
            }}
          >
            {step.bouton ?? 'Suivant'}
          </button>
        ) : (
          /* Pas de bouton : la bulle attend l'appui réel sur l'élément éclairé. */
          <span style={{ fontSize: 13, color: '#94A3B8' }} className="shrink-0">
            Appuie sur le bouton
          </span>
        )}
      </div>
    </motion.div>
  );
};

/**
 * Points de progression : le point courant devient une pilule.
 *
 * Au-delà de six étapes les points ne tiennent plus dans la largeur de la
 * bulle et mangent la place de l'indice d'attente. Le parcours en 3 actes en
 * compte une vingtaine : on écrit alors le rang en toutes lettres, qui se lit
 * mieux.
 */
const MAX_POINTS = 6;

const Points: React.FC<{ index: number; total: number; reduire: boolean; sombre: boolean }> = ({
  index,
  total,
  reduire,
  sombre,
}) =>
  total > MAX_POINTS ? (
    <span
      className="font-bold tabular-nums shrink-0"
      style={{ fontSize: 12, color: sombre ? 'rgba(255,255,255,0.75)' : '#94A3B8' }}
    >
      {index + 1} / {total}
    </span>
  ) : (
    <div className="flex items-center gap-1.5 shrink-0">
      {Array.from({ length: total }, (_, i) => (
        <motion.span
          key={i}
          animate={{ width: i === index ? 18 : 6 }}
          transition={{ duration: reduire ? 0 : 0.22, ease: EASE }}
          style={{
            height: 6,
            borderRadius: 999,
            display: 'block',
            background:
              i === index
                ? sombre
                  ? '#FFFFFF'
                  : INDIGO
                : sombre
                  ? 'rgba(255,255,255,0.4)'
                  : '#CBD5E1',
          }}
        />
      ))}
    </div>
  );
