import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, Printer, Tag } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatMoney } from '../../utils/currency';

interface LabelSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Reçoit les produits cochés : c'est seulement là que l'impression se prépare. */
  onConfirm: (productIds: string[]) => void;
}

/**
 * Premier écran de « Étiquettes » : on coche ce qu'on veut imprimer. Rien
 * n'est coché d'avance et rien ne part à l'impression d'ici — un catalogue
 * entier imprimé par erreur, c'est une planche d'étiquettes perdue par produit.
 */
export const LabelSelectionModal: React.FC<LabelSelectionModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const { products } = useApp();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      setChecked(new Set());
      setQuery('');
    }
  }, [isOpen]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.category ?? '').toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q) ||
        (p.internalCode ?? '').toLowerCase().includes(q)
    );
  }, [products, query]);

  if (!isOpen) return null;

  const allVisibleChecked = visible.length > 0 && visible.every((p) => checked.has(p.id));

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // « Tout sélectionner » porte sur la liste affichée : après une recherche,
  // il coche les résultats, pas le catalogue caché derrière.
  const toggleAll = () =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (allVisibleChecked) visible.forEach((p) => next.delete(p.id));
      else visible.forEach((p) => next.add(p.id));
      return next;
    });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="label-selection-title"
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in slide-in-from-bottom-4 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-14 shrink-0 px-4 flex items-center gap-2.5 border-b border-slate-100">
          <div className="w-[34px] h-[34px] rounded-[10px] bg-[#4F46E5] text-white flex items-center justify-center shrink-0">
            <Tag className="w-[18px] h-[18px]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="label-selection-title" className="text-[15px] font-[750] text-slate-900 leading-tight">
              Étiquettes
            </h3>
            <p className="text-[11px] text-slate-500 leading-tight">Coche les produits à imprimer</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-9 h-9 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="shrink-0 px-4 pt-3 pb-2 space-y-2 border-b border-slate-100">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Chercher un produit"
              className="w-full h-10 pl-9 pr-3 rounded-full bg-slate-50 border border-slate-200 text-[16px] sm:text-[13px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
            />
          </div>
          <label className="flex items-center justify-between gap-2 py-1 cursor-pointer select-none">
            <span className="flex items-center gap-2 text-[13px] font-bold text-slate-800">
              <input
                id="checkbox-labels-select-all"
                type="checkbox"
                checked={allVisibleChecked}
                onChange={toggleAll}
                disabled={visible.length === 0}
                className="w-4 h-4 rounded accent-[#4F46E5] cursor-pointer"
              />
              Tout sélectionner
            </span>
            <span className="text-[12px] font-semibold text-slate-500 tabular-nums">
              {checked.size} / {products.length}
            </span>
          </label>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
          {visible.length === 0 ? (
            <p className="p-8 text-center text-[13px] text-slate-500">
              {products.length === 0 ? 'Ton catalogue est vide.' : 'Aucun produit ne correspond.'}
            </p>
          ) : (
            visible.map((p) => (
              <label
                key={p.id}
                className={`px-4 py-2.5 flex items-center gap-3 cursor-pointer transition-colors ${
                  checked.has(p.id) ? 'bg-indigo-50/60' : 'hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="w-4 h-4 rounded accent-[#4F46E5] cursor-pointer shrink-0"
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-bold text-slate-900 truncate">{p.name}</span>
                  <span className="block text-[11px] text-slate-500 truncate">
                    {formatMoney(p.salePrice)}
                    {p.category ? ` · ${p.category}` : ''}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>

        <div className="shrink-0 p-4 border-t border-slate-100">
          <button
            id="btn-labels-print-selection"
            type="button"
            disabled={checked.size === 0}
            onClick={() => onConfirm(products.filter((p) => checked.has(p.id)).map((p) => p.id))}
            className="w-full h-12 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[14px] font-bold flex items-center justify-center gap-2 cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>
              {checked.size === 0
                ? 'Coche au moins un produit'
                : `Imprimer ${checked.size} étiquette${checked.size > 1 ? 's' : ''}`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
