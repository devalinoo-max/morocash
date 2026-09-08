import React from 'react';
import { Reveal } from './Reveal';

type Cell = { text: string; tone: 'good' | 'bad' | 'neutral' };

const cell = (text: string, tone: Cell['tone'] = 'neutral'): Cell => ({ text, tone });

const ROWS: { label: string; cahier: Cell; excel: Cell; morocash: Cell }[] = [
  {
    label: 'Enregistrer une vente en 10 secondes',
    cahier: cell('Oui', 'good'),
    excel: cell('Non', 'bad'),
    morocash: cell('Oui', 'good'),
  },
  {
    label: 'Alertes de rupture de stock automatiques',
    cahier: cell('Non', 'bad'),
    excel: cell('Non', 'neutral'),
    morocash: cell('Automatique', 'good'),
  },
  {
    label: 'Masquer les bénéfices aux employés',
    cahier: cell('Non', 'bad'),
    excel: cell('Non', 'bad'),
    morocash: cell('Oui', 'good'),
  },
  {
    label: 'Relancer une dette en 1 clic (WhatsApp)',
    cahier: cell('Non', 'bad'),
    excel: cell('Non', 'bad'),
    morocash: cell('Oui', 'good'),
  },
  {
    label: 'Fonctionner 100% hors-ligne',
    cahier: cell('Oui', 'good'),
    excel: cell('Oui', 'good'),
    morocash: cell('Oui', 'good'),
  },
  {
    label: 'Survivre au vol, au feu, à la pluie',
    cahier: cell('Non', 'bad'),
    excel: cell('Si sauvegardé', 'neutral'),
    morocash: cell('Oui', 'good'),
  },
  {
    label: 'Envoyer un reçu automatique au client',
    cahier: cell('Non', 'bad'),
    excel: cell('Non', 'bad'),
    morocash: cell('Sur WhatsApp', 'good'),
  },
  {
    label: 'Connaître son bénéfice net chaque soir',
    cahier: cell('Non', 'bad'),
    excel: cell('Si tu sais faire', 'neutral'),
    morocash: cell('Chaque soir', 'good'),
  },
  {
    label: 'Historique client (qui doit, depuis quand)',
    cahier: cell('Si tu y penses', 'neutral'),
    excel: cell('À la main', 'neutral'),
    morocash: cell('Automatique', 'good'),
  },
  {
    label: 'Coûter zéro franc',
    cahier: cell('Oui', 'good'),
    excel: cell('Oui', 'good'),
    morocash: cell('14j, puis payant', 'bad'),
  },
];

const toneClass: Record<Cell['tone'], string> = {
  good: 'accent-emerald font-bold',
  bad: 'text-red-500 font-bold',
  neutral: 'theme-text font-semibold',
};

export const ComparisonSection: React.FC = () => {
  return (
    <section id="comparatif" className="py-24 px-4 md:px-8 max-w-6xl mx-auto space-y-12">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <Reveal variant="up">
          <span className="text-xs font-mono-data font-bold accent-violet uppercase tracking-widest">Comparatif honnête</span>
        </Reveal>
        <Reveal variant="up" delayMs={70}>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight theme-text">
            Cahier, Excel ou <span className="font-serif-em italic accent-violet font-normal">MoroCash</span> ?
          </h2>
        </Reveal>
      </div>

      <Reveal variant="up" className="overflow-x-auto rounded-[2rem] border theme-border shadow-2xl">
        <table className="w-full text-left border-collapse min-w-[650px]">
          <thead>
            <tr className="theme-badge border-b theme-border text-xs font-bold uppercase tracking-wider theme-text">
              <th className="p-5">Ce que tu veux savoir</th>
              <th className="p-5 text-center">Cahier</th>
              <th className="p-5 text-center">Excel</th>
              <th className="p-5 text-center tint-violet-5 relative overflow-hidden">
                <div
                  className="sweep-highlight absolute inset-y-0 left-0 w-1/3 pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--violet) 30%, transparent), transparent)',
                    transform: 'skewX(-12deg)',
                  }}
                />
                <span className="relative">MoroCash</span>
              </th>
            </tr>
          </thead>
          <tbody className="text-xs font-medium theme-text-muted divide-y theme-border">
            {ROWS.map((row) => (
              <tr key={row.label}>
                <td className="p-4 font-bold theme-text">{row.label}</td>
                <td className={`p-4 text-center ${toneClass[row.cahier.tone]}`}>{row.cahier.text}</td>
                <td className={`p-4 text-center ${toneClass[row.excel.tone]}`}>{row.excel.text}</td>
                <td className={`p-4 text-center tint-violet-5 font-extrabold ${toneClass[row.morocash.tone]}`}>{row.morocash.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Reveal>

      <Reveal variant="up">
        <p className="text-xs text-center theme-text-muted leading-relaxed max-w-xl mx-auto italic">
          « Ton cahier est rapide et gratuit. C&apos;est vrai. Il ne te dira simplement jamais si tu gagnes de l&apos;argent. »
        </p>
      </Reveal>
    </section>
  );
};
