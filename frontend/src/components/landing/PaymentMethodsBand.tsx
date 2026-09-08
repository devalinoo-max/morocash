import React from 'react';
import { Banknote, HelpCircle, MapPin, Wallet } from 'lucide-react';

const COUNTRIES = [
  { label: "Côte d'Ivoire", available: true },
  { label: 'Sénégal', available: true },
  { label: 'Burkina Faso', available: true },
  { label: 'Mali', available: true },
  { label: 'Bénin (bientôt)', available: false },
  { label: 'Togo (bientôt)', available: false },
];

const PAYMENT_METHODS = [
  { label: 'Wave', icon: Wallet },
  { label: 'Orange Money', icon: Wallet },
  { label: 'MTN MoMo', icon: Wallet },
  { label: 'Moov Money', icon: Wallet },
  { label: 'Espèces', icon: Banknote },
];

// Deux bandeaux défilant en boucle en sens opposés (pur CSS, pas de scroll
// listener) : les pays desservis vers la gauche, les moyens de paiement
// vers la droite — pause au survol.
export const PaymentMethodsBand: React.FC = () => {
  const countries = [...COUNTRIES, ...COUNTRIES];
  const methods = [...PAYMENT_METHODS, ...PAYMENT_METHODS];

  return (
    <section className="border-y theme-border py-9 theme-badge overflow-hidden">
      <div className="max-w-6xl mx-auto space-y-4">
        <p className="px-4 md:px-8 text-[10px] font-mono-data font-bold theme-text-muted uppercase tracking-widest">
          Disponible en Afrique de l&apos;Ouest
        </p>
        <div className="marquee-row marquee-left overflow-hidden w-full">
          <div className="marquee-track gap-4 px-2">
            {countries.map((country, i) => (
              <span
                key={`${country.label}-${i}`}
                className={
                  'marquee-pill inline-flex items-center gap-2 px-4 py-2 rounded-full font-bold text-xs shrink-0 border ' +
                  (country.available
                    ? 'tint-violet-10 accent-violet border-violet-500/20'
                    : 'border-dashed theme-border theme-text-muted')
                }
              >
                {country.available ? <MapPin className="w-3.5 h-3.5" /> : <HelpCircle className="w-3.5 h-3.5" />}
                {country.label}
              </span>
            ))}
          </div>
        </div>

        <p className="px-4 md:px-8 text-[10px] font-mono-data font-bold theme-text-muted uppercase tracking-widest pt-2">
          Tes clients paient comme ils veulent
        </p>
        <div className="marquee-row marquee-right overflow-hidden w-full">
          <div className="marquee-track gap-4 px-2">
            {methods.map((method, i) => (
              <span
                key={`${method.label}-${i}`}
                className="marquee-pill inline-flex items-center gap-2 tint-emerald-10 accent-emerald border border-emerald-500/20 px-4 py-2 rounded-full font-extrabold text-xs shrink-0"
              >
                <method.icon className="w-3.5 h-3.5" />
                {method.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
