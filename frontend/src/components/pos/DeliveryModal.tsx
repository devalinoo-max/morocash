import React, { useState } from 'react';
import { Truck, X, Check, ArrowRight } from 'lucide-react';
import { formatMoney } from '../../utils/currency';
import { MoneyInput } from '../common/UIStates';

interface DeliveryModalProps {
  isOpen: boolean;
  /** Total après remise, avant livraison. */
  totalBeforeDelivery: number;
  currentFee: number;
  onClose: () => void;
  onApply: (fee: number) => void;
}

// Plafond identique à celui du serveur : une faute de frappe ne doit pas
// produire une commande que le serveur refusera ensuite.
const MAX_FEE = 10_000_000;

/**
 * Frais de livraison facturés au client : ils s'ajoutent au total après la
 * remise (une remise ne porte jamais sur le prix de la course).
 */
export const DeliveryModal: React.FC<DeliveryModalProps> = ({
  isOpen,
  totalBeforeDelivery,
  currentFee,
  onClose,
  onApply,
}) => {
  const [fee, setFee] = useState<number>(currentFee || 0);

  if (!isOpen) return null;

  const apply = (value: number) => {
    onApply(value);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-[460px] rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col">
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 flex items-center justify-center">
              <Truck className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h3 className="text-base font-bold">Frais de livraison</h3>
              <p className="text-xs text-slate-300">Payés par le client, ajoutés au total</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <label htmlFor="input-delivery-fee" className="text-xs font-bold text-slate-600">
              Prix de la livraison :
            </label>
            <MoneyInput
              id="input-delivery-fee"
              value={fee}
              onChange={(val) => setFee(Math.min(MAX_FEE, Math.max(0, val)))}
              placeholder="0"
              autoFocus
            />
            <div className="flex gap-1.5 pt-1">
              {[500, 1000, 1500, 2000].map((quick) => (
                <button
                  key={quick}
                  type="button"
                  onClick={() => setFee(quick)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    fee === quick
                      ? 'bg-[#4F46E5] text-white'
                      : 'bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700'
                  }`}
                >
                  {formatMoney(quick)}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Calcul en temps réel</div>
            <div className="flex items-center justify-between font-semibold text-slate-700">
              <span>Articles : <strong className="text-slate-900">{formatMoney(totalBeforeDelivery)}</strong></span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span>Livraison : <strong className="text-slate-900">+{formatMoney(fee)}</strong></span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span>Total : <strong className="text-[#4F46E5] font-black">{formatMoney(totalBeforeDelivery + fee)}</strong></span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          {currentFee > 0 ? (
            <button type="button" onClick={() => apply(0)} className="text-xs text-rose-600 hover:underline font-bold cursor-pointer">
              Retirer
            </button>
          ) : (
            <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:underline font-bold cursor-pointer">
              Annuler
            </button>
          )}
          <button
            id="btn-apply-delivery-confirm"
            type="button"
            onClick={() => apply(fee)}
            className="px-5 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 text-white text-xs font-bold shadow-md cursor-pointer flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>{fee > 0 ? `Ajouter la livraison (${formatMoney(fee)})` : 'Aucune livraison'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
