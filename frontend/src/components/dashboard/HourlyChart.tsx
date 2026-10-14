import React from 'react';
import { useReducedMotion } from 'motion/react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { formatMoney } from '../../utils/formatters';

export interface HourPoint {
  hour: string;
  today: number;
  yesterday: number;
  isPeak: boolean;
}

const Infobulle = ({ active, payload }: { active?: boolean; payload?: { payload: HourPoint }[] }) => {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  return (
    <div className="rounded-2xl bg-mc-ink text-white px-3 py-2 text-[12px] shadow-mc-hover tabular-nums">
      <p className="font-bold">{point.hour}</p>
      <p className="mt-1 text-white/90">Aujourd’hui : {formatMoney(point.today)}</p>
      <p className="text-[#B9B2FF]">Hier : {formatMoney(point.yesterday)}</p>
    </div>
  );
};

/** Ventes heure par heure : aujourd'hui (plein) contre hier (clair), barres en pilule. */
const HourlyChart: React.FC<{ data: HourPoint[] }> = ({ data }) => {
  const reduce = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="24%" barGap={3}>
        <XAxis
          dataKey="hour"
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#6B7194', fontSize: 12, fontWeight: 600 }}
          dy={6}
        />
        <Tooltip content={<Infobulle />} cursor={{ fill: '#F3F4FA', radius: 12 }} />
        <Bar
          dataKey="yesterday"
          fill="#DAD6FC"
          radius={999}
          maxBarSize={14}
          isAnimationActive={!reduce}
          animationDuration={600}
          animationEasing="ease-out"
        />
        <Bar
          dataKey="today"
          radius={999}
          maxBarSize={14}
          isAnimationActive={!reduce}
          animationDuration={600}
          animationEasing="ease-out"
        >
          {data.map((d) => (
            <Cell key={d.hour} fill={d.isPeak ? '#3B2FC9' : '#5B4BF0'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

export default HourlyChart;
