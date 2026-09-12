import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { PaymentMethod, Sale } from '../../types';
import { formatMoney, formatPaymentMethod } from '../../utils/formatters';
import { PAYMENT_METHODS, paymentMethodColors } from '../../utils/paymentMethods';

interface CollectRemainingModalProps {
  sale: Sale;
  onClose: () => void;
  onCollect: (amount: number, method: PaymentMethod) => Promise<boolean>;
}

/**
 * Encaisser ce qui reste dû sur une commande.
 *
 * Le montant est pré-rempli au reste entier, parce que c'est le cas le plus
 * fréquent : le client vient solder. Il reste modifiable pour un acompte,
 * mais jamais au-delà du reste — on n'encaisse pas plus que ce qui est dû.
 */
export const CollectRemainingModal: React.FC<CollectRemainingModalProps> = ({
  sale,
  onClose,
  onCollect,
}) => {
  const [montant, setMontant] = useState<number>(sale.remainingAmount);
  const [methode, setMethode] = useState<PaymentMethod>('CASH');
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  const valide = montant > 0 && montant <= sale.remainingAmount;

  const encaisser = async () => {
    if (!valide || envoiEnCours) return;
    setEnvoiEnCours(true);
    const ok = await onCollect(montant, methode);
    setEnvoiEnCours(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom sm:zoom-in-95 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-black text-slate-900">Encaisser le reste</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {sale.customerName || 'Client'} · {sale.reference}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 shrink-0 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] p-3 flex items-center justify-between">
          <span className="text-xs font-bold text-[#991B1B]">Reste à payer</span>
          <span className="text-[19px] font-extrabold text-[#DC2626] tabular-nums">
            {formatMoney(sale.remainingAmount)}
          </span>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="montant-encaisse" className="text-xs font-bold text-slate-700">
            Montant reçu
          </label>
          <input
            id="montant-encaisse"
            type="number"
            inputMode="numeric"
            value={montant || ''}
            min={1}
            max={sale.remainingAmount}
            onChange={(e) => setMontant(Number(e.target.value))}
            className="w-full px-3.5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-lg font-extrabold tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:bg-white"
          />
          {montant > sale.remainingAmount && (
            <p className="text-[11px] font-bold text-[#DC2626]">
              Il ne reste que {formatMoney(sale.remainingAmount)} à payer sur cette commande.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-bold text-slate-700">Payé par</span>
          <div className="grid grid-cols-3 gap-1.5">
            {PAYMENT_METHODS.map((m) => {
              const actif = methode === m;
              const couleurs = paymentMethodColors(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethode(m)}
                  className={`py-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                    actif ? 'border-transparent' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                  style={actif ? { backgroundColor: couleurs.bg, color: couleurs.fg } : undefined}
                >
                  {formatPaymentMethod(m)}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={encaisser}
          disabled={!valide || envoiEnCours}
          className="w-full h-[50px] rounded-2xl bg-[#4F46E5] hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-black shadow-md shadow-indigo-600/20 cursor-pointer"
        >
          {envoiEnCours ? 'Encaissement…' : `Encaisser ${formatMoney(montant || 0)}`}
        </button>
      </div>
    </div>
  );
};
