import React from 'react';
import { BookX, PackageSearch, Scale, UserMinus } from 'lucide-react';
import { Reveal } from './Reveal';

const PROBLEMS = [
  {
    icon: PackageSearch,
    title: 'Tu ne sais pas ce qui te reste',
    text: "Un client demande un article, tu vas voir au fond du magasin. Parfois il n'y en a plus depuis trois jours.",
  },
  {
    icon: UserMinus,
    title: 'Tu ne sais plus qui te doit',
    text: 'Tu fais crédit à des habitués sur WhatsApp. Six mois après, tu ne sais plus combien, ni depuis quand.',
  },
  {
    icon: Scale,
    title: 'Tu confonds vendre et gagner',
    text: 'La caisse est pleine le soir. Mais après les achats, le transport et le loyer, il reste quoi ?',
  },
  {
    icon: BookX,
    title: 'Ton cahier finit par se perdre',
    text: "Mouillé, déchiré, oublié chez toi. Et avec lui, tout l'historique de ton commerce.",
  },
];

export const ProblemSection: React.FC = () => {
  return (
    <section id="probleme" className="py-24 px-4 md:px-8 max-w-6xl mx-auto space-y-16">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <Reveal variant="up">
          <p className="text-xs font-mono-data font-bold accent-violet uppercase tracking-widest">Constat terrain</p>
        </Reveal>
        <Reveal variant="up" delayMs={70}>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight theme-text">
            Ton commerce marche. Mais tu <span className="font-serif-em italic accent-violet font-normal">pilotes à l&apos;aveugle</span>.
          </h2>
        </Reveal>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {PROBLEMS.map((problem, i) => (
          <Reveal
            key={problem.title}
            variant="up"
            delayMs={i * 70}
            className="theme-card border theme-border rounded-[2rem] p-8 hover:-translate-y-1 transition-transform duration-300 space-y-4"
          >
            <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
              <problem.icon className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold theme-text">{problem.title}</h3>
            <p className="theme-text-muted text-xs leading-relaxed">{problem.text}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
};
