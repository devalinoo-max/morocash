import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { formatMoney } from '../../utils/formatters';
import { plural } from '../../utils/plural';
import { staggerChild, staggerParent } from './SalesKit';

export interface DayBar {
  /** « Lun », « Mar »… */
  label: string;
  /** Date complète, pour l'infobulle. */
  fullLabel: string;
  /** Montant des commandes du jour (annulées exclues). */
  total: number;
  /** Ce qui a déjà été payé dessus. */
  paye: number;
  /** Ce qui reste à payer dessus : la partie hachurée de la barre. */
  reste: number;
}

export interface StatusSplit {
  paid: number;
  partial: number;
  credit: number;
}

interface SalesChartsProps {
  days: DayBar[];
  status: StatusSplit;
  /** « aujourd'hui », « sur 7 jours »… pour le sous-titre du donut. */
  periodLabel: string;
}

const PRIMAIRE = '#5B4BF0';

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  payload?: DayBar;
}

/**
 * Une barre entièrement arrondie : le plein en bas (payé), les hachures en
 * haut (reste à payer). Les deux sont découpés par la même pilule, sinon la
 * jonction entre les deux parties casserait l'arrondi.
 */
const BarrePilule = ({ x = 0, y = 0, width = 0, height = 0, index = 0, payload }: BarShapeProps) => {
  if (!payload || height <= 0 || width <= 0 || payload.total <= 0) return <g />;
  const hauteurPayee = height * (payload.paye / payload.total);
  const clipId = `mc-barre-${index}`;
  return (
    <g>
      <clipPath id={clipId}>
        <rect x={x} y={y} width={width} height={height} rx={Math.min(width, height) / 2} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect x={x} y={y} width={width} height={height} fill="url(#mc-hachures)" />
        <rect x={x} y={y + height - hauteurPayee} width={width} height={hauteurPayee} fill={PRIMAIRE} />
      </g>
    </g>
  );
};

const InfobulleJour = ({ active, payload }: { active?: boolean; payload?: { payload: DayBar }[] }) => {
  const jour = active ? payload?.[0]?.payload : undefined;
  if (!jour) return null;
  return (
    <div className="rounded-2xl bg-mc-ink text-white px-3 py-2 text-[12px] shadow-mc-hover tabular-nums">
      <p className="font-bold capitalize">{jour.fullLabel}</p>
      <p className="mt-1 text-white/80">Commandes : {formatMoney(jour.total)}</p>
      <p className="text-white/80">Payé : {formatMoney(jour.paye)}</p>
      {jour.reste > 0 && <p className="text-[#FDBA74]">Reste à payer : {formatMoney(jour.reste)}</p>}
    </div>
  );
};

const SalesCharts: React.FC<SalesChartsProps> = ({ days, status, periodLabel }) => {
  const reduce = useReducedMotion();
  const totalSemaine = days.reduce((somme, j) => somme + j.total, 0);
  const resteSemaine = days.reduce((somme, j) => somme + j.reste, 0);

  const parts = [
    { id: 'paid', label: 'Payées', value: status.paid, color: '#16A34A' },
    { id: 'partial', label: 'En partie', value: status.partial, color: '#F59E0B' },
    { id: 'credit', label: 'Pas payées', value: status.credit, color: '#EF4444' },
  ];
  const totalStatuts = status.paid + status.partial + status.credit;
  const partsVisibles = parts.filter((p) => p.value > 0);

  return (
    <motion.div
      variants={staggerParent}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 lg:grid-cols-3 gap-4"
    >
      {/* Ventes des 7 derniers jours */}
      <motion.section
        variants={staggerChild}
        aria-label={`Commandes des 7 derniers jours : ${formatMoney(totalSemaine)}, dont ${formatMoney(resteSemaine)} reste à payer`}
        className="lg:col-span-2 min-w-0 rounded-mc bg-white border border-mc-line shadow-mc-card p-4 md:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold text-mc-ink">Ventes des 7 derniers jours</h2>
            <p className="text-[12px] text-mc-soft tabular-nums">
              {formatMoney(totalSemaine)} de commandes
              {resteSemaine > 0 ? ` · ${formatMoney(resteSemaine)} reste à payer` : ''}
            </p>
          </div>
          <div className="flex items-center gap-4 text-[12px] font-semibold text-mc-soft">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-mc-primary" />
              Payé
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg width="12" height="12" aria-hidden="true">
                <defs>
                  <pattern id="mc-hachures-legende" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="4" height="4" fill="#EEECFE" />
                    <line x1="0" y1="0" x2="0" y2="4" stroke={PRIMAIRE} strokeWidth="2" strokeOpacity="0.6" />
                  </pattern>
                </defs>
                <rect width="12" height="12" rx="6" fill="url(#mc-hachures-legende)" />
              </svg>
              Reste à payer
            </span>
          </div>
        </div>

        <div className="mt-4 h-[200px] md:h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="28%">
              <defs>
                <pattern id="mc-hachures" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="7" height="7" fill="#EEECFE" />
                  <line x1="0" y1="0" x2="0" y2="7" stroke={PRIMAIRE} strokeWidth="3" strokeOpacity="0.6" />
                </pattern>
              </defs>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6B7194', fontSize: 12, fontWeight: 600 }}
                dy={6}
              />
              <Tooltip content={<InfobulleJour />} cursor={false} />
              <Bar
                dataKey="total"
                maxBarSize={36}
                shape={(props: unknown) => <BarrePilule {...(props as BarShapeProps)} />}
                background={{ fill: '#F3F4FA', radius: 999 }}
                isAnimationActive={!reduce}
                animationDuration={600}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.section>

      {/* Répartition des statuts sur la période choisie */}
      <motion.section
        variants={staggerChild}
        aria-label={`Statut des commandes ${periodLabel} : ${parts.map((p) => `${p.value} ${p.label.toLowerCase()}`).join(', ')}`}
        className="min-w-0 rounded-mc bg-white border border-mc-line shadow-mc-card p-4 md:p-6"
      >
        <h2 className="text-[16px] font-bold text-mc-ink">Statut des commandes</h2>
        <p className="text-[12px] text-mc-soft first-letter:uppercase">{periodLabel}</p>

        <div className="mt-2 flex lg:flex-col items-center gap-4">
          <div className="relative w-[150px] h-[150px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={totalStatuts > 0 ? partsVisibles : [{ id: 'vide', value: 1, color: '#E8EAF3' }]}
                  dataKey="value"
                  nameKey="id"
                  innerRadius={50}
                  outerRadius={70}
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={partsVisibles.length > 1 ? 4 : 0}
                  cornerRadius={partsVisibles.length > 1 ? 8 : 0}
                  stroke="none"
                  isAnimationActive={!reduce}
                  animationDuration={600}
                  animationEasing="ease-out"
                >
                  {(totalStatuts > 0 ? partsVisibles : [{ id: 'vide', color: '#E8EAF3' }]).map((p) => (
                    <Cell key={p.id} fill={p.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[28px] font-extrabold text-mc-ink tabular-nums leading-none">
                {totalStatuts}
              </span>
              <span className="text-[12px] text-mc-soft">
                {plural(totalStatuts, 'commande')}
              </span>
            </div>
          </div>

          <ul className="flex-1 w-full space-y-2">
            {parts.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-[14px]">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <span className="text-mc-soft font-medium flex-1 truncate">{p.label}</span>
                <span className="font-bold text-mc-ink tabular-nums">{p.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </motion.section>
    </motion.div>
  );
};

export default SalesCharts;
