import React, { useState } from 'react';
import { Percent, Tag, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CategorySelect } from './CategorySelect';

interface BulkEditBarProps {
  selectedIds: string[];
  onDone: () => void;
}

/**
 * Modification en lot depuis la liste des produits.
 *
 * Deux gestes seulement, ceux qu'un commerçant fait vraiment : reclasser un
 * paquet d'articles, et augmenter ses prix d'un pourcentage quand le grossiste
 * augmente les siens. Les modifications partent une par une par la file
 * d'attente, donc l'écran est à jour immédiatement, et un lot commencé hors
 * ligne se terminera au retour du réseau.
 */
export const BulkEditBar: React.FC<BulkEditBarProps> = ({ selectedIds, onDone }) => {
  const { products, updateProduct, showToast } = useApp();
  const [mode, setMode] = useState<'none' | 'category' | 'price'>('none');
  const [percent, setPercent] = useState(5);

  if (selectedIds.length === 0) return null;

  const count = selectedIds.length;
  const plural = count > 1 ? 's' : '';

  const applyCategory = (category: string) => {
    for (const id of selectedIds) {
      void updateProduct(id, { category: category.trim() });
    }
    showToast(
      `${count} produit${plural} rangé${plural} dans « ${category.trim() || 'Sans catégorie'} »`,
      'success'
    );
    onDone();
  };

  const applyPriceChange = () => {
    if (percent === 0) return;
    for (const id of selectedIds) {
      const product = products.find((p) => p.id === id);
      if (!product) continue;
      // Arrondi à l'unité : les prix sont en francs entiers, pas en centimes.
      const next = Math.max(0, Math.round(product.salePrice * (1 + percent / 100)));
      void updateProduct(id, { salePrice: next });
    }
    showToast(
      `Prix ${percent > 0 ? 'augmentés' : 'baissés'} de ${Math.abs(percent)} % sur ${count} produit${plural}`,
      'success'
    );
    onDone();
  };

  return (
    <div className="fixed bottom-20 md:bottom-6 inset-x-0 z-[80] px-3 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-2xl rounded-2xl bg-slate-900 text-white shadow-2xl shadow-slate-900/40 p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold">
            {count} produit{plural} sélectionné{plural}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode(mode === 'category' ? 'none' : 'category')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                mode === 'category' ? 'bg-white text-slate-900' : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Changer la catégorie</span>
              <span className="sm:hidden">Catégorie</span>
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === 'price' ? 'none' : 'price')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                mode === 'price' ? 'bg-white text-slate-900' : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              <Percent className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Changer les prix</span>
              <span className="sm:hidden">Prix</span>
            </button>
            <button
              type="button"
              onClick={onDone}
              aria-label="Tout désélectionner"
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:bg-white/15 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {mode === 'category' && (
          <div className="bg-white rounded-xl p-2">
            <CategorySelect value="" onChange={applyCategory} />
          </div>
        )}

        {mode === 'price' && (
          <div className="flex items-center gap-2 bg-white/10 rounded-xl p-2">
            <input
              type="number"
              value={percent}
              onChange={(e) => setPercent(parseInt(e.target.value, 10) || 0)}
              className="w-20 px-2.5 py-2 rounded-lg text-slate-900 text-xs font-bold text-right outline-hidden"
            />
            <span className="text-xs font-bold">%</span>
            <span className="text-[11px] text-slate-300 flex-1">
              Un nombre négatif baisse les prix.
            </span>
            <button
              type="button"
              onClick={applyPriceChange}
              className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold cursor-pointer"
            >
              Appliquer
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
