import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Tag, X, Check, AlertTriangle, ArrowRight } from 'lucide-react';
import { formatMoney } from '../../utils/currency';
import { MoneyInput } from '../common/UIStates';

interface DiscountModalProps {
  isOpen: boolean;
  subtotal: number;
  currentDiscount: number;
  initialMode?: 'PERCENTAGE' | 'AMOUNT';
  initialPercent?: number;
  onClose: () => void;
  onApplyDiscount: (discountAmount: number, mode: 'PERCENTAGE' | 'AMOUNT', value: number, reason?: string) => void;
}

const QUICK_REASONS = [
  'Geste commercial',
  'Client fidèle',
  'Fin de série',
  'Article abîmé',
];

export const DiscountModal: React.FC<DiscountModalProps> = ({
  isOpen,
  subtotal,
  currentDiscount,
  initialMode = 'AMOUNT',
  initialPercent = 0,
  onClose,
  onApplyDiscount,
}) => {
  const { settings, showToast } = useApp();
  const [mode, setMode] = useState<'PERCENTAGE' | 'AMOUNT'>(initialMode);
  const [percentValue, setPercentValue] = useState<number>(initialPercent || (subtotal > 0 && currentDiscount > 0 ? Math.round((currentDiscount / subtotal) * 100) : 0));
  const [fixedValue, setFixedValue] = useState<number>(currentDiscount || 0);
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  const isSeller = settings.role === 'SELLER';
  const maxAllowedPercent = isSeller
    ? (settings.remiseMaxVendeur !== undefined ? settings.remiseMaxVendeur : 0)
    : 100;

  // Calculate actual discount amount (never exceeds subtotal)
  const computedDiscount = mode === 'PERCENTAGE'
    ? Math.min(subtotal, Math.round((subtotal * percentValue) / 100))
    : Math.min(subtotal, Math.max(0, fixedValue));

  const finalTotal = Math.max(0, subtotal - computedDiscount);
  const effectivePercent = subtotal > 0 ? Math.round((computedDiscount / subtotal) * 100) : 0;
  const isOverLimit = isSeller && (maxAllowedPercent === 0 ? computedDiscount > 0 : effectivePercent > maxAllowedPercent);

  const handleApply = () => {
    if (isOverLimit) {
      if (maxAllowedPercent === 0) {
        showToast("Les remises sont interdites aux vendeurs (plafond à 0%). Demande à ton patron !", 'error');
      } else {
        showToast(`Plafond vendeur dépassé (${maxAllowedPercent}% max). Au-delà, ton vendeur devra te demander.`, 'error');
      }
      return;
    }
    if (computedDiscount > subtotal) {
      showToast('Une remise ne peut jamais dépasser le sous-total', 'error');
      return;
    }
    onApplyDiscount(
      computedDiscount,
      mode,
      mode === 'PERCENTAGE' ? percentValue : computedDiscount,
      reason
    );
    onClose();
  };

  const handleRemove = () => {
    onApplyDiscount(0, 'AMOUNT', 0, '');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-[460px] rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 flex items-center justify-center">
              <Tag className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h3 className="text-base font-bold">Accorder une remise</h3>
              <p className="text-xs text-slate-300">Sous-total : {formatMoney(subtotal)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setMode('PERCENTAGE')}
              className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                mode === 'PERCENTAGE'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              En pourcentage (%)
            </button>
            <button
              type="button"
              onClick={() => setMode('AMOUNT')}
              className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                mode === 'AMOUNT'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              En montant fixe (F CFA)
            </button>
          </div>

          {/* Amount input */}
          {mode === 'PERCENTAGE' ? (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600">Pourcentage de remise :</label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={percentValue || ''}
                  onChange={(e) => setPercentValue(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                  placeholder="0"
                  className="w-full text-right font-bold pr-12 pl-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-2xl focus:ring-2 focus:ring-[#4F46E5]"
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-base font-extrabold text-slate-400 pointer-events-none">
                  %
                </span>
              </div>
              {/* Quick % buttons */}
              <div className="flex gap-1.5 pt-1">
                {[5, 10, 15, 20].map((quick) => (
                  <button
                    key={quick}
                    type="button"
                    onClick={() => setPercentValue(quick)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      percentValue === quick
                        ? 'bg-[#4F46E5] text-white'
                        : 'bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700'
                    }`}
                  >
                    {quick}%
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600">Montant fixe de remise :</label>
              <MoneyInput
                id="input-discount-fixed"
                value={fixedValue}
                onChange={(val) => setFixedValue(Math.min(subtotal, Math.max(0, val)))}
                placeholder="0"
                autoFocus
              />
              {/* Quick round amounts */}
              <div className="flex gap-1.5 pt-1">
                {[500, 1000, 2000, 5000].map((quick) => (
                  <button
                    key={quick}
                    type="button"
                    onClick={() => setFixedValue(Math.min(subtotal, quick))}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      fixedValue === quick
                        ? 'bg-[#4F46E5] text-white'
                        : 'bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700'
                    }`}
                  >
                    {formatMoney(quick)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Seller Limit Warning */}
          {isOverLimit && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                Plafond vendeur dépassé (max autorisé : {maxAllowedPercent}%). Demande l'accord à ton patron !
              </span>
            </div>
          )}

          {/* Real-time calculation requirement from Point 4:
              "Calcul en temps réel : "Sous-total : 15 000 F → Remise : −1 500 F → Nouveau total : 13 500 F"" */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              Calcul en temps réel
            </div>
            <div className="flex items-center justify-between font-semibold text-slate-700">
              <span>Sous-total : <strong className="text-slate-900">{formatMoney(subtotal)}</strong></span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span>Remise : <strong className="text-amber-600">−{formatMoney(computedDiscount)}</strong></span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span>Nouveau total : <strong className="text-[#4F46E5] font-black">{formatMoney(finalTotal)}</strong></span>
            </div>
          </div>

          {/* Optional reason chips and input */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1.5">
              Motif de la remise (optionnel) :
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    reason === r
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ou saisir un motif personnalisé..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          {currentDiscount > 0 ? (
            <button
              type="button"
              onClick={handleRemove}
              className="text-xs text-rose-600 hover:underline font-bold cursor-pointer"
            >
              Supprimer la remise
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-500 hover:underline font-bold cursor-pointer"
            >
              Annuler
            </button>
          )}

          <button
            id="btn-apply-discount-confirm"
            type="button"
            onClick={handleApply}
            disabled={isOverLimit || computedDiscount < 0}
            className="px-5 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-bold shadow-md cursor-pointer flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>Appliquer la remise {computedDiscount > 0 ? `(${formatMoney(computedDiscount)})` : ''}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
