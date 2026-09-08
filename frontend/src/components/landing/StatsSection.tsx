import React from 'react';
import { Reveal } from './Reveal';

const STATS = [
  { value: '10 s', label: 'pour enregistrer une vente' },
  { value: '3 min', label: 'pour être prêt à vendre' },
  { value: '0 F', label: "pendant 14 jours d'essai" },
  { value: '0', label: 'carte bancaire demandée' },
];

export const StatsSection: React.FC = () => {
  return (
    <section className="py-20 tint-violet-5 border-y theme-border">
      <div className="max-w-6xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-8">
        {STATS.map((stat, i) => (
          <Reveal key={stat.label} variant="zoom" delayMs={i * 70} className="text-center space-y-2">
            <p className="text-4xl md:text-5xl font-extrabold accent-violet font-mono-data">{stat.value}</p>
            <p className="text-xs theme-text-muted font-bold">{stat.label}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
};
