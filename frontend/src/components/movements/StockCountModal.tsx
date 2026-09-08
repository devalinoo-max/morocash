import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  ClipboardList,
  Search,
  ScanLine,
  CheckCircle2,
  AlertCircle,
  Equal,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
} from 'lucide-react';
import { formatFCFA } from '../../utils/formatters';

interface StockCountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StockCountModal: React.FC<StockCountModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { products, recordStockCount, findProductByCode, settings } = useApp();

  const isVendeur = settings.role === 'SELLER';
  const physicalProducts = useMemo(
    () => products.filter((p) => !p.isService),
    [products]
  );

  const categories = useMemo(() => {
    const cats = new Set<string>();
    physicalProducts.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats);
  }, [physicalProducts]);

  const [perimetre, setPerimetre] = useState('Tout le magasin');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [scanInput, setScanInput] = useState('');
  const [commentaire, setCommentaire] = useState('');

  // Counted quantities map: { [productId]: number }
  const [counts, setCounts] = useState<{ [id: string]: number }>(() => {
    const initial: { [id: string]: number } = {};
    physicalProducts.forEach((p) => {
      initial[p.id] = p.stock;
    });
    return initial;
  });

  if (!isOpen) return null;

  // Filter products by perimeter category and search
  const filteredProducts = physicalProducts.filter((p) => {
    if (selectedCategory !== 'ALL' && p.category !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchCode = (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.internalCode && p.internalCode.toLowerCase().includes(q)) ||
        (p.productCodes && p.productCodes.some((c) => c.code.toLowerCase().includes(q)));
      return matchName || matchCode;
    }
    return true;
  });

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim()) return;
    const match = findProductByCode(scanInput.trim());
    if (match) {
      // Increment counted quantity by 1
      setCounts((prev) => ({
        ...prev,
        [match.id]: (prev[match.id] ?? match.stock) + 1,
      }));
      setScanInput('');
    } else {
      alert(`Aucun produit trouvé pour le code : "${scanInput}"`);
    }
  };

  const handleQtyChange = (productId: string, val: number) => {
    setCounts((prev) => ({
      ...prev,
      [productId]: Math.max(0, val),
    }));
  };

  // Calculate gaps
  let totalEcarts = 0;
  let ecartUnites = 0;
  let ecartValeur = 0;

  filteredProducts.forEach((p) => {
    const counted = counts[p.id] ?? p.stock;
    const diff = counted - p.stock;
    if (diff !== 0) {
      totalEcarts += 1;
      ecartUnites += diff;
      ecartValeur += diff * (p.purchasePrice || 0);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const itemsToRecord = filteredProducts.map((p) => ({
      productId: p.id,
      countedQty: counts[p.id] ?? p.stock,
    }));

    const result = await recordStockCount({
      perimetre:
        selectedCategory === 'ALL' ? perimetre : `Catégorie ${selectedCategory}`,
      items: itemsToRecord,
      commentaire: commentaire.trim() || undefined,
    });

    if (result) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-indigo-900 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight">
                Faire un comptage de stock
              </h2>
              <p className="text-xs text-indigo-200 font-medium">
                Inventaire physique : confrontez le stock réel au stock théorique
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {/* Top Controls: Perimeter & Scan input */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Périmètre
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="ALL">Tout le magasin ({physicalProducts.length})</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    Rayon : {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Scan rapide (Code-barres / Code maison)
              </label>
              <form onSubmit={handleScanSubmit} className="relative">
                <ScanLine className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="Scannez un article pour ajouter +1 au comptage..."
                  className="w-full pl-9 pr-20 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="submit"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-[11px] font-bold hover:bg-indigo-700 cursor-pointer"
                >
                  Scanner
                </button>
              </form>
            </div>
          </div>

          {/* Search Filter */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrer par nom de produit dans cette liste..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Products Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="max-h-[320px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 text-[11px] font-black uppercase text-slate-600 sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3">Produit</th>
                    <th className="py-2.5 px-2 text-center">Théorique</th>
                    <th className="py-2.5 px-3 text-center">Compté réel</th>
                    <th className="py-2.5 px-3 text-right">Écart</th>
                    {!isVendeur && (
                      <th className="py-2.5 px-3 text-right">Impact valeur</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium">
                  {filteredProducts.map((prod) => {
                    const counted = counts[prod.id] ?? prod.stock;
                    const diff = counted - prod.stock;
                    const diffValue = diff * (prod.purchasePrice || 0);

                    return (
                      <tr
                        key={prod.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          diff !== 0 ? 'bg-amber-50/40' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <p className="font-bold text-slate-900 leading-tight">
                            {prod.name}
                          </p>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {prod.internalCode || prod.barcode || '—'}
                          </span>
                        </td>

                        <td className="py-2.5 px-2 text-center font-bold text-slate-500">
                          {prod.stock} {prod.unit || 'u'}
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleQtyChange(prod.id, counted - 1)}
                              className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs flex items-center justify-center cursor-pointer"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={counted}
                              onChange={(e) =>
                                handleQtyChange(prod.id, Number(e.target.value))
                              }
                              className={`w-14 text-center font-black text-xs py-1 rounded border focus:outline-none ${
                                diff !== 0
                                  ? 'border-amber-400 bg-amber-50 text-amber-900'
                                  : 'border-slate-200 bg-white text-slate-900'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => handleQtyChange(prod.id, counted + 1)}
                              className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs flex items-center justify-center cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-right font-black">
                          {diff === 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[11px]">
                              <Equal className="w-3 h-3" /> 0
                            </span>
                          ) : diff > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded text-[11px]">
                              <ArrowUpRight className="w-3 h-3" /> +{diff}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded text-[11px]">
                              <ArrowDownRight className="w-3 h-3" /> {diff}
                            </span>
                          )}
                        </td>

                        {!isVendeur && (
                          <td className="py-2.5 px-3 text-right font-bold text-xs">
                            {diff === 0 ? (
                              <span className="text-slate-400">—</span>
                            ) : diff > 0 ? (
                              <span className="text-emerald-700">
                                +{formatFCFA(diffValue)}
                              </span>
                            ) : (
                              <span className="text-rose-700">
                                {formatFCFA(diffValue)}
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Global inventory comment */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Commentaire de l’inventaire (facultatif)
            </label>
            <input
              type="text"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Ex: Comptage de fin de semaine, contrôle rayon lait..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Gaps Summary Banner */}
          <div className="p-3.5 rounded-xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block">
                  Produits vérifiés
                </span>
                <span className="font-extrabold text-sm text-white">
                  {filteredProducts.length}
                </span>
              </div>
              <div className="h-6 w-px bg-slate-700" />
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block">
                  Écarts constatés
                </span>
                <span
                  className={`font-black text-sm ${
                    totalEcarts > 0 ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                >
                  {totalEcarts} produit(s)
                </span>
              </div>
              <div className="h-6 w-px bg-slate-700" />
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block">
                  Solde unités
                </span>
                <span className="font-extrabold text-sm text-white">
                  {ecartUnites > 0 ? `+${ecartUnites}` : ecartUnites}
                </span>
              </div>
            </div>

            {!isVendeur && totalEcarts > 0 && (
              <div className="text-right">
                <span className="text-slate-400 text-[10px] uppercase font-bold block">
                  Écart valeur total
                </span>
                <span
                  className={`font-black text-sm ${
                    ecartValeur >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {ecartValeur >= 0 ? `+${formatFCFA(ecartValeur)}` : formatFCFA(ecartValeur)}
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-800 hover:from-indigo-700 hover:to-indigo-900 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-700/20 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              Valider le comptage
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
