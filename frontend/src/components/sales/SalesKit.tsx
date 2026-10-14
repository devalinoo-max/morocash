import React, { useEffect, useRef, useState } from 'react';
import { animate, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { countLabel } from '../../utils/plural';
import type { DateInterval, PeriodFilter } from '../../utils/salesFilters';
import type { SaleStatusKey } from '../../utils/saleStatus';

/** La courbe de tout le tableau de bord : cubic-bezier(.22,1,.36,1). */
export const MC_EASE = [0.22, 1, 0.36, 1] as const;

/** Pastilles de statut des listes, aux couleurs du nouveau tableau de bord. */
export const PASTILLES_STATUT: Record<SaleStatusKey, { bg: string; fg: string }> = {
  PAID: { bg: '#E8F8EE', fg: '#15803D' },
  PARTIAL: { bg: '#FEF3E0', fg: '#B45309' },
  CREDIT: { bg: '#FEECEC', fg: '#DC2626' },
  CANCELLED: { bg: '#F3F4FA', fg: '#6B7194' },
};

/** Cartes : fondu + montée de 16 px, 400 ms, 60 ms d'écart entre deux cartes. */
export const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
export const staggerChild = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: MC_EASE } },
};

/**
 * Période juste avant celle affichée, de même durée : c'est elle qui sert de
 * base aux pastilles « +12 % ». « Ce mois » se compare au mois précédent arrêté
 * au même jour — un mois entamé contre un mois entier donnerait toujours une
 * baisse.
 */
export function previousInterval(
  period: PeriodFilter,
  interval: DateInterval,
  now: Date = new Date()
): DateInterval {
  if (period === 'thisMonth') {
    const dernierJourMoisPrecedent = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    const jour = Math.min(now.getDate(), dernierJourMoisPrecedent);
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0),
      end: new Date(now.getFullYear(), now.getMonth() - 1, jour, 23, 59, 59, 999),
    };
  }
  const jours = Math.round((interval.end.getTime() - interval.start.getTime()) / 86_400_000);
  const s = interval.start;
  const e = interval.end;
  return {
    start: new Date(s.getFullYear(), s.getMonth(), s.getDate() - jours, 0, 0, 0, 0),
    end: new Date(e.getFullYear(), e.getMonth(), e.getDate() - jours, 23, 59, 59, 999),
  };
}

/** Variation en %, ou null quand il n'y a pas de base honnête pour comparer. */
export function variationPct(
  current: number | null | undefined,
  previous: number | null | undefined
): number | null {
  if (current == null || previous == null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/* --------------------------------------------------------------------------
   Chiffre qui compte jusqu'à sa valeur, 800 ms
   -------------------------------------------------------------------------- */
export const CountUp: React.FC<{ value: number; format?: (n: number) => string }> = ({
  value,
  format = (n) => n.toLocaleString('fr-FR'),
}) => {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(0);

  useEffect(() => {
    if (reduce) {
      from.current = value;
      setShown(value);
      return;
    }
    const controls = animate(from.current, value, {
      duration: 0.8,
      ease: MC_EASE,
      onUpdate: (v) => setShown(Math.round(v)),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, reduce]);

  return <>{format(shown)}</>;
};

/* --------------------------------------------------------------------------
   Sélecteur segmenté, avec la pastille qui glisse d'une option à l'autre
   -------------------------------------------------------------------------- */
interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  count?: number;
}

interface SegmentedProps<T extends string> {
  /** Sert d'identifiant à la pastille : unique par sélecteur. */
  id: string;
  label: string;
  options: readonly SegmentedOption<T>[];
  /** Peut ne correspondre à aucune option (période libre) : pas de pastille. */
  value: string;
  onChange: (value: T) => void;
  /** Teinte de la pastille : primaire pour le choix principal, encre pour les autres. */
  tone?: 'primary' | 'ink';
}

export function Segmented<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
  tone = 'primary',
}: SegmentedProps<T>) {
  // Jusqu'à quatre options, tout tient sur un téléphone : chacune prend la
  // place de son texte. Au-delà, la rangée défile — et elle l'annonce par son
  // bord droit estompé, puis amène d'elle-même l'option choisie à l'écran.
  const defile = options.length > 4;
  const rangee = useRef<HTMLDivElement | null>(null);
  // La rangée a quitté son début : le bord gauche s'estompe à son tour.
  const [avancee, setAvancee] = useState(false);

  useEffect(() => {
    if (!defile) return;
    const el = rangee.current;
    const actif = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el || !actif) return;
    // On ne bouge la rangée que si l'option choisie n'est pas entièrement
    // visible : tant qu'elle l'est, le début de la rangée reste lisible.
    const marge = 32;
    if (actif.offsetLeft < el.scrollLeft + marge) {
      el.scrollLeft = Math.max(0, actif.offsetLeft - marge);
    } else if (actif.offsetLeft + actif.offsetWidth > el.scrollLeft + el.clientWidth - marge) {
      el.scrollLeft = actif.offsetLeft + actif.offsetWidth - el.clientWidth + marge;
    }
    setAvancee(el.scrollLeft > 4);
  }, [defile, value]);

  return (
    <div
      ref={rangee}
      role="group"
      aria-label={label}
      onScroll={defile ? (e) => setAvancee(e.currentTarget.scrollLeft > 4) : undefined}
      className={`flex md:inline-flex w-full md:w-auto max-w-full p-1 rounded-full bg-white border border-mc-line overflow-x-auto scrollbar-none ${
        defile ? (avancee ? 'mc-fade-both' : 'filter-pill-row') : ''
      }`}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            id={`${id}-${opt.id.toLowerCase()}`}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.id)}
            className={`relative md:flex-none shrink-0 h-10 md:h-9 md:px-4 rounded-full text-[12px] md:text-[14px] font-semibold whitespace-nowrap cursor-pointer transition-colors duration-200 active:scale-[0.97] ${
              defile ? 'px-3.5' : 'flex-auto px-1.5'
            } ${active ? 'text-white' : 'text-mc-soft hover:text-mc-ink'}`}
          >
            {active && (
              <motion.span
                layoutId={`${id}-pastille`}
                transition={{ duration: 0.4, ease: MC_EASE }}
                className={`absolute inset-0 rounded-full ${
                  tone === 'primary' ? 'bg-mc-primary' : 'bg-mc-ink'
                }`}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {opt.label}
              {opt.count != null && (
                <span className={`tabular-nums ${active ? 'text-white/75' : 'text-mc-soft/70'}`}>
                  {opt.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Carte KPI
   -------------------------------------------------------------------------- */
interface KpiCardProps {
  label: string;
  /** null tant que le serveur n'a pas répondu : la carte montre son squelette. */
  value: number | null;
  format?: (n: number) => string;
  /** Variation en % par rapport à la période précédente ; null = pas de pastille. */
  variation?: number | null;
  /** Une hausse des dépenses est une mauvaise nouvelle : la pastille passe alors au rouge. */
  variationGoodWhen?: 'up' | 'down';
  hint?: React.ReactNode;
  /** Pastille libre à côté de la variation (« 3 en retard », « Session active »). */
  badge?: React.ReactNode;
  /** Couleur du chiffre quand il porte lui-même un sens (dette, annulation). */
  tone?: 'default' | 'danger' | 'warning' | 'muted';
  featured?: boolean;
  onOpen: () => void;
  className?: string;
  /** Carte basse, pour les pages où la liste doit rester visible sans défiler. */
  compact?: boolean;
  openLabel: string;
}

const TONS_CHIFFRE = {
  default: '',
  danger: 'text-[#DC2626]',
  warning: 'text-[#B45309]',
  muted: 'text-mc-soft',
} as const;

/** 40 px tant que le chiffre tient ; un montant long descend d'un cran plutôt que d'être coupé. */
function tailleChiffre(texte: string): string {
  if (texte.length <= 7) return 'text-[24px] md:text-[32px] xl:text-[40px]';
  if (texte.length <= 9) return 'text-[22px] md:text-[28px] xl:text-[34px]';
  if (texte.length <= 11) return 'text-[20px] md:text-[24px] xl:text-[28px]';
  return 'text-[18px] md:text-[20px] xl:text-[24px]';
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  format = (n) => n.toLocaleString('fr-FR'),
  variation = null,
  variationGoodWhen = 'up',
  hint,
  badge,
  tone = 'default',
  featured = false,
  onOpen,
  openLabel,
  className = '',
  compact = false,
}) => {
  const enHausse = variation != null && variation >= 0;
  const bonneNouvelle = variationGoodWhen === 'up' ? enHausse : !enHausse;

  return (
    <motion.div
      variants={staggerChild}
      onClick={compact ? onOpen : undefined}
      title={compact ? openLabel : undefined}
      className={`mc-lift relative min-w-0 rounded-mc shadow-mc-card ${compact ? "p-3 md:p-4 cursor-pointer" : "p-4 md:p-6"} ${className} ${
        featured ? 'mc-gradient text-white' : 'bg-white border border-mc-line text-mc-ink'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`text-[12px] md:text-[14px] font-semibold ${
            featured ? 'text-white/80' : 'text-mc-soft'
          }`}
        >
          {label}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          aria-label={openLabel}
          title={openLabel}
          className={`shrink-0 -mt-1 -mr-1 w-8 h-8 rounded-full ${compact ? "hidden md:flex" : "flex"} items-center justify-center cursor-pointer transition-all duration-200 active:scale-[0.97] ${
            featured
              ? 'bg-white/15 hover:bg-white/25 text-white'
              : 'bg-mc-bg hover:bg-mc-primary-tint text-mc-ink hover:text-mc-primary'
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>

      {value == null ? (
        <div
          className={`mt-3 h-9 md:h-11 w-3/4 rounded-xl ${featured ? 'bg-white/20 animate-pulse' : 'mc-shimmer'}`}
          aria-label="Lecture du serveur…"
        />
      ) : (
        <p
          className={`${compact ? "mt-0.5" : "mt-2"} font-extrabold tabular-nums tracking-tight leading-tight whitespace-nowrap ${
            featured ? '' : TONS_CHIFFRE[tone]
          } ${compact ? "text-[20px] md:text-[24px]" : tailleChiffre(format(value))}`}
        >
          <CountUp value={value} format={format} />
        </p>
      )}

      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${compact ? "mt-1 empty:hidden" : "mt-2 min-h-[22px]"}`}>
        {variation != null && variation !== 0 && (
          <span
            title="Par rapport à la période précédente"
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-bold tabular-nums ${
              featured
                ? 'bg-white/20 text-white'
                : bonneNouvelle
                  ? 'bg-mc-success-bg text-[#15803D]'
                  : 'bg-mc-danger-bg text-[#DC2626]'
            }`}
          >
            {enHausse ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {enHausse ? '+' : ''}
            {variation}%
          </span>
        )}
        {badge}
        {hint && (
          <span
            className={`text-[12px] font-medium line-clamp-2 md:truncate md:line-clamp-none tabular-nums ${
              featured ? 'text-white/75' : 'text-mc-soft'
            }`}
          >
            {hint}
          </span>
        )}
      </div>
    </motion.div>
  );
};

/* --------------------------------------------------------------------------
   Pastille « Essai · 30 jours » — remplace le bandeau d'essai sur cette page
   -------------------------------------------------------------------------- */
export const TrialPill: React.FC = () => {
  const { settings, setActiveTab, setActiveMoreSubTab } = useApp();
  if (settings.planStatus !== 'TRIAL') return null;

  const jours = settings.trialDaysLeft;
  // Mêmes paliers que le bandeau : la couleur monte le ton quand l'échéance approche.
  const ton =
    jours < 3
      ? 'bg-mc-danger-bg text-[#DC2626] border-[#FBCACA]'
      : jours <= 7
        ? 'bg-mc-warning-bg text-[#B45309] border-[#FAD9A1]'
        : 'bg-mc-primary-tint text-mc-primary-dark border-[#DAD6FC]';

  return (
    <button
      id="pill-trial"
      type="button"
      onClick={() => {
        setActiveTab('more');
        setActiveMoreSubTab('subscription');
      }}
      title="Voir les formules"
      className={`shrink-0 inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-[12px] font-bold whitespace-nowrap cursor-pointer transition-transform active:scale-[0.97] ${ton}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      Essai · {countLabel(jours, 'jour')}
    </button>
  );
};

/* --------------------------------------------------------------------------
   État vide : illustration simple + phrase + bouton
   -------------------------------------------------------------------------- */
interface EmptyStateProps {
  title: string;
  text: string;
  actionLabel: string;
  onAction: () => void;
  /** Le « + » n'a de sens que pour créer ; pas pour « voir toutes les commandes ». */
  withPlus?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  text,
  actionLabel,
  onAction,
  withPlus = false,
}) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, ease: MC_EASE }}
    className="px-6 py-12 text-center bg-white rounded-mc border border-mc-line shadow-mc-card"
  >
    <svg
      viewBox="0 0 160 120"
      className="w-40 h-[120px] mx-auto"
      role="img"
      aria-label=""
      aria-hidden="true"
    >
      <ellipse cx="80" cy="108" rx="52" ry="7" fill="#E8EAF3" />
      <rect x="46" y="14" width="68" height="88" rx="12" fill="#FFFFFF" stroke="#DAD6FC" strokeWidth="2" />
      <rect x="58" y="30" width="30" height="6" rx="3" fill="#5B4BF0" />
      <rect x="58" y="46" width="44" height="5" rx="2.5" fill="#E8EAF3" />
      <rect x="58" y="58" width="36" height="5" rx="2.5" fill="#E8EAF3" />
      <rect x="58" y="70" width="44" height="5" rx="2.5" fill="#E8EAF3" />
      <rect x="58" y="84" width="20" height="6" rx="3" fill="#EEECFE" />
      <circle cx="118" cy="26" r="15" fill="#5B4BF0" />
      <path d="M118 19v14M111 26h14" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
      <circle cx="34" cy="44" r="4" fill="#F59E0B" />
      <circle cx="132" cy="70" r="3" fill="#16A34A" />
    </svg>
    <h3 className="mt-4 text-[20px] font-extrabold text-mc-ink">{title}</h3>
    <p className="mt-1 text-[14px] text-mc-soft max-w-xs mx-auto leading-relaxed">{text}</p>
    <button
      type="button"
      onClick={onAction}
      className="mt-6 inline-flex items-center gap-2 h-11 px-6 rounded-full bg-mc-primary hover:bg-mc-primary-dark text-white font-bold text-[14px] shadow-mc-card cursor-pointer transition-all duration-200 active:scale-[0.97]"
    >
      {withPlus && <Plus className="w-4 h-4 stroke-[3]" />}
      <span>{actionLabel}</span>
    </button>
  </motion.div>
);

/** Gabarit d'une carte de graphique pendant que recharts se charge. */
export const ChartsSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" aria-busy="true" aria-label="Chargement des graphiques">
    <div className="lg:col-span-2 h-[300px] rounded-mc bg-white border border-mc-line p-6">
      <div className="h-4 w-40 rounded-full mc-shimmer" />
      <div className="mt-6 h-[210px] rounded-2xl mc-shimmer" />
    </div>
    <div className="h-[300px] rounded-mc bg-white border border-mc-line p-6">
      <div className="h-4 w-32 rounded-full mc-shimmer" />
      <div className="mt-6 mx-auto w-40 h-40 rounded-full mc-shimmer" />
    </div>
  </div>
);
