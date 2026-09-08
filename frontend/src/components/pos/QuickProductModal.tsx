import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Product } from '../../types';
import { Plus, X, Package, Tag, Check, Sparkles } from 'lucide-react';
import { MoneyInput } from '../common/UIStates';

interface QuickProductModalProps {
  isOpen: boolean;
  initialBarcode?: string;
  onClose: () => void;
  onProductCreated: (product: Product) => void;
}

export const QuickProductModal: React.FC<QuickProductModalProps> = ({
  isOpen,
  initialBarcode,
  onClose,
  onProductCreated,
}) => {
  const { addProduct, showToast, settings } = useApp();

  const [name, setName] = useState('');
  const [salePrice, setSalePrice] = useState(0);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [stock, setStock] = useState(10);
  const [category, setCategory] = useState('DIVERS');
  const [isService, setIsService] = useState(settings.activityType === 'SERVICES');
  const [barcode, setBarcode] = useState(initialBarcode || '');

  useEffect(() => {
    if (initialBarcode) {
      setBarcode(initialBarcode);
    }
  }, [initialBarcode]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Donne un nom au produit', 'warning');
      return;
    }
    if (salePrice <= 0) {
      showToast('Indique un prix de vente valide', 'warning');
      return;
    }

    const created = await addProduct({
      name: name.trim(),
      category: category.trim().toUpperCase() || 'DIVERS',
      salePrice,
      purchasePrice: purchasePrice || Math.round(salePrice * 0.7),
      stock: isService ? 0 : Number(stock) || 0,
      alertThreshold: 3,
      unit: isService ? 'prestation' : 'pièce',
      isService,
      barcode: barcode.trim() || undefined,
    });
    if (!created) return;

    onProductCreated(created);
    onClose();
    // Reset form
    setName('');
    setSalePrice(0);
    setPurchasePrice(0);
    setStock(10);
    setBarcode('');
  };

  return (
    <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 flex items-center justify-center">
              <Plus className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h3 className="text-base font-bold">Nouveau produit rapide</h3>
              <p className="text-xs text-slate-300">Sera ajouté direct à la commande</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Nom du produit / article *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Savon liquide 500ml"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Prix de vente *
            </label>
            <MoneyInput
              id="input-quick-prod-saleprice"
              value={salePrice}
              onChange={(val) => setSalePrice(val)}
              placeholder="0"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Combien en as-tu ?
              </label>
              <input
                type="number"
                disabled={isService}
                value={isService ? 0 : stock}
                onChange={(e) => setStock(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold disabled:opacity-40"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Catégorie
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ex: ALIMENTATION"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold uppercase"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="chk-quick-is-service"
              checked={isService}
              onChange={(e) => setIsService(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="chk-quick-is-service" className="text-xs font-medium text-slate-700 cursor-pointer">
              C'est une prestation / service (sans gestion de stock physique)
            </label>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">
              Code-barres (facultatif)
            </label>
            <input
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Ex: 618110038..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
            />
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md cursor-pointer flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Créer et ajouter au panier</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
