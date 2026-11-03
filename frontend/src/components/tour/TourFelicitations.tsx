import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { PartyPopper } from 'lucide-react';
import { formatMoney } from '../../utils/formatters';
import type { Product, Sale } from '../../types';

const INDIGO = '#4F46E5';
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Ce que la première vente a rapporté, dans l'ordre où la question se pose :
 * ce que j'ai facturé, ce que j'ai vraiment reçu, ce qui me reste.
 *
 * Un coût figé à 0 sur la vente veut dire « inconnu au moment de la vente » :
 * on retient alors le prix d'achat actuel du produit, exactement comme le
 * font l'accueil et l'écran « Mes chiffres ». Sans ça, tout le montant vendu
 * passerait pour du bénéfice et le premier chiffre qu'on montre serait faux.
 */
export function chiffresDeLaVente(sale: Sale, products: Product[]) {
  const coutParProduit = new Map(products.map((p) => [p.id, p.purchasePrice]));
  const cout = sale.items.reduce((somme, item) => {
    const unitaire = item.costPrice || coutParProduit.get(item.productId) || 0;
    return somme + unitaire * item.quantity;
  }, 0);

  return {
    vendu: sale.totalAmount,
    encaisse: sale.paidAmount,
    // La remise est déjà retranchée de totalAmount : la marge se calcule donc
    // sur le total facturé, pas sur la somme des prix de vente catalogue.
    gagne: sale.totalAmount - cout,
  };
}

interface TourFelicitationsProps {
  sale: Sale;
  products: Product[];
  onContinuer: () => void;
  onPasser: () => void;
}

export const TourFelicitations: React.FC<TourFelicitationsProps> = ({
  sale,
  products,
  onContinuer,
  onPasser,
}) => {
  const reduire = useReducedMotion();
  const { vendu, encaisse, gagne } = chiffresDeLaVente(sale, products);

  const lignes: { label: string; valeur: number; fort?: boolean }[] = [
    { label: 'Vendu', valeur: vendu },
    { label: 'Encaissé', valeur: encaisse },
    { label: 'Gagné', valeur: gagne, fort: true },
  ];

  return (
    <div
      className="fixed inset-0 z-[96] flex items-center justify-center p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Première vente enregistrée"
      style={{ background: 'rgba(15, 23, 42, 0.72)' }}
    >
      <motion.div
        initial={reduire ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduire ? 0 : 0.22, ease: EASE }}
        className="w-full max-w-sm bg-white text-center"
        style={{ borderRadius: 16, padding: 24, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)' }}
      >
        <div
          className="mx-auto flex items-center justify-center"
          style={{ width: 56, height: 56, borderRadius: 16, background: '#EEF2FF', color: INDIGO }}
        >
          <PartyPopper className="w-7 h-7" />
        </div>

        <h2
          className="font-bold"
          style={{ fontSize: 19, color: '#0F172A', margin: '16px 0 0', lineHeight: 1.3 }}
        >
          Première vente enregistrée 🎉
        </h2>

        {/* Les trois chiffres en gros, l'un sous l'autre : on les lit dans
            l'ordre, et le dernier est celui qu'on retient. */}
        <div style={{ marginTop: 20 }} className="space-y-2.5 text-left">
          {lignes.map((ligne) => (
            <div
              key={ligne.label}
              className="flex items-baseline justify-between gap-3"
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                background: ligne.fort ? '#EEF2FF' : '#F8FAFC',
              }}
            >
              <span
                className="font-bold"
                style={{ fontSize: 13, color: ligne.fort ? INDIGO : '#64748B' }}
              >
                {ligne.label}
              </span>
              <span
                className="font-extrabold tabular-nums"
                style={{ fontSize: ligne.fort ? 24 : 20, color: ligne.fort ? INDIGO : '#0F172A' }}
              >
                {formatMoney(ligne.valeur)}
              </span>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 14, lineHeight: 1.5, color: '#475569', margin: '16px 0 0' }}>
          Le dernier chiffre, c’est ce que tu as vraiment mis dans ta poche.
        </p>

        <button
          type="button"
          onClick={onContinuer}
          autoFocus
          className="w-full cursor-pointer font-bold"
          style={{
            marginTop: 20,
            padding: '13px 16px',
            borderRadius: 999,
            background: INDIGO,
            color: '#FFFFFF',
            border: 0,
            fontSize: 15,
          }}
        >
          Voir mon bénéfice
        </button>

        {/* « Passer » est là aussi : on ne retient personne, même à la fin. */}
        <button
          type="button"
          onClick={onPasser}
          className="cursor-pointer hover:underline"
          style={{
            marginTop: 12,
            fontSize: 13,
            color: '#94A3B8',
            background: 'none',
            border: 0,
            padding: 0,
          }}
        >
          Passer
        </button>
      </motion.div>
    </div>
  );
};
