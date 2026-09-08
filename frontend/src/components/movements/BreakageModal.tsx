import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  AlertTriangle,
  Flame,
  UploadCloud,
  CheckCircle2,
  Package,
} from 'lucide-react';
import { formatFCFA } from '../../utils/formatters';

interface BreakageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COMMON_BREAKAGE_MOTIFS = [
  'Bouteille cassée en rayon',
  'Sac percé / déchiré',
  'Détérioration par humidité',
  'Écrasé sous un carton lourd',
  'Maladresse lors de la manipulation',
  'Produit altéré / impropre à la vente',
];

export const BreakageModal: React.FC<BreakageModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { products, recordStockBreakage, settings } = useApp();

  const isVendeur = settings.role === 'SELLER';
  const physicalProducts = products.filter((p) => !p.isService);

  const [productId, setProductId] = useState(physicalProducts[0]?.id || '');
  const [quantity, setQuantity] = useState(1);
  const [motif, setMotif] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const selectedProduct = physicalProducts.find((p) => p.id === productId);
  const stockAvant = selectedProduct ? selectedProduct.stock : 0;
  const stockApres = stockAvant - (Number(quantity) || 0);
  const valeurPerte = (Number(quantity) || 0) * (selectedProduct?.purchasePrice || 0);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhoto(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!selectedProduct) {
      setErrorMsg('Veuillez sélectionner un produit');
      return;
    }
    if (!motif.trim()) {
      setErrorMsg('Le motif est obligatoire pour toute déclaration de casse');
      return;
    }
    if (quantity <= 0) {
      setErrorMsg('La quantité doit être supérieure à 0');
      return;
    }

    const result = await recordStockBreakage({
      productId,
      quantity: Number(quantity),
      motif: motif.trim(),
      note: note.trim() || undefined,
      photo,
    });
    if (result) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight">
                Cassé ou abîmé
              </h2>
              <p className="text-xs text-amber-100 font-medium">
                Déclarer un article détérioré et ajuster le stock
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

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Product Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Article concerné
            </label>
            <div className="relative">
              <Package className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-amber-500 focus:outline-none"
              >
                {physicalProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (En stock: {p.stock} {p.unit || 'unités'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Quantité cassée / abîmée
            </label>
            <div className="flex items-center gap-3">
              <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden bg-white w-36">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm cursor-pointer"
                >
                  −
                </button>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                  className="w-full text-center font-black text-sm text-slate-900 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm cursor-pointer"
                >
                  +
                </button>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                {selectedProduct?.unit || 'unités'}
              </span>
            </div>
          </div>

          {/* Stock Impact Visual Pill */}
          <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/60 flex items-center justify-between text-xs">
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold text-slate-500">Variation stock :</span>
              <div className="flex items-center gap-2 font-black text-slate-800">
                <span>{stockAvant} {selectedProduct?.unit || 'u'}</span>
                <span className="text-amber-600">→</span>
                <span className="text-rose-600">{stockApres} {selectedProduct?.unit || 'u'}</span>
                <span className="text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded text-[10px] font-black">
                  −{quantity}
                </span>
              </div>
            </div>

            {!isVendeur && (
              <div className="text-right">
                <span className="text-[11px] font-semibold text-slate-500">Valeur perdue :</span>
                <p className="font-black text-rose-600">{formatFCFA(valeurPerte)}</p>
              </div>
            )}
          </div>

          {/* Motif (Mandatory) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Motif de la casse <span className="text-rose-500 font-black">*</span>
            </label>
            <input
              type="text"
              required
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Ex: Bouteille tombée lors du rangement"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-amber-500 focus:outline-none"
            />
            {/* Quick motif pills */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {COMMON_BREAKAGE_MOTIFS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotif(m)}
                  className="text-[11px] font-medium bg-slate-100 hover:bg-amber-100 hover:text-amber-900 text-slate-600 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Note */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Précisions / Note (facultatif)
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Détails supplémentaires si besoin..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* Optional Photo */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Photo du produit cassé (facultatif)
            </label>
            {photo ? (
              <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <img
                  src={photo}
                  alt="Preuve casse"
                  className="w-12 h-12 rounded-lg object-cover border border-amber-300"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-amber-900 truncate">
                    Photo jointe au dossier
                  </p>
                  <button
                    type="button"
                    onClick={() => setPhoto(undefined)}
                    className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                  >
                    Supprimer la photo
                  </button>
                </div>
              </div>
            ) : (
              <label className="border-2 border-dashed border-slate-200 hover:border-amber-400 rounded-xl p-3 flex flex-col items-center justify-center gap-1 cursor-pointer bg-slate-50/50 hover:bg-amber-50/30 transition-all">
                <UploadCloud className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-bold text-slate-600">
                  Prendre une photo de la casse
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl text-xs font-black shadow-md shadow-orange-600/20 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              Enregistrer la casse
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
