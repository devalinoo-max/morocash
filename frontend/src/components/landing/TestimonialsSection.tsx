import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { Reveal } from './Reveal';

const TESTIMONIALS = [
  {
    quote:
      '« Un client me devait 60 000 F depuis huit mois, je l’avais complètement oublié. Le jour où j’ai vu la liste, j’ai récupéré mon argent. »',
    name: 'Awa T.',
    role: 'Cosmétiques, Yopougon',
  },
  {
    quote: '« Le réseau coupe souvent à Adjamé. Je continue à enregistrer mes ventes, et quand ça revient, tout est là. »',
    name: 'Kouassi Y.',
    role: 'Alimentation, Adjamé',
  },
  {
    quote: '« Je croyais gagner beaucoup parce que la caisse était pleine. En vrai je perdais sur deux produits. »',
    name: 'Fatou D.',
    role: 'Prêt-à-porter, Cocody',
  },
];

const StarRow: React.FC<{ lit: boolean }> = ({ lit }) => (
  <div className="flex gap-1">
    {Array.from({ length: 5 }).map((_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 text-amber-400 fill-amber-400 star-pending ${lit ? 'star-lit' : ''}`}
        style={{ transitionDelay: lit ? `${200 + i * 70}ms` : '0ms' }}
      />
    ))}
  </div>
);

export const TestimonialsSection: React.FC = () => {
  const [litIndex, setLitIndex] = useState<Record<number, boolean>>({});

  return (
    <section id="temoignages" className="py-24 px-4 md:px-8 theme-badge border-y theme-border">
      <div className="max-w-6xl mx-auto space-y-16">
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <Reveal variant="up">
            <span className="text-xs font-mono-data font-bold accent-emerald uppercase tracking-widest">Avis commerçants</span>
          </Reveal>
          <Reveal variant="up" delayMs={70}>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight theme-text">
              Recommandé par <span className="font-serif-em italic accent-emerald font-normal">ceux qui l&apos;utilisent</span>
            </h2>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {TESTIMONIALS.map((t, i) => (
            <Reveal
              key={t.name}
              variant="up"
              delayMs={i * 70}
              onReveal={() => setLitIndex((prev) => ({ ...prev, [i]: true }))}
              className="theme-card border theme-border rounded-[2rem] p-8 space-y-6"
            >
              <div className="space-y-4">
                <StarRow lit={!!litIndex[i]} />
                <p className="theme-text text-sm italic font-medium leading-relaxed">{t.quote}</p>
              </div>
              <div className="pt-4 border-t theme-border">
                <p className="font-bold text-xs theme-text">{t.name}</p>
                <p className="text-[10px] theme-text-muted">{t.role}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};
