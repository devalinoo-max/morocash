import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  Plus,
  Trash2,
  Package,
  FileText,
  Truck,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Receipt,
  ScanLine,
} from 'lucide-react';
import { formatFCFA } from '../../utils/formatters';
import { StockReceptionLine } from '../../types';

interface ReceptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReceptionModal: React.FC<ReceptionModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { products, recordStockReception, settings } = useApp();

  const isVendeur = settings.role === 'SELLER';
  const physicalProducts = products.filter((p) => !p.isService);

  const [fournisseur, setFournisseur] = useState('');
  const [note, setNote] = useState('');
  const [justificatifUrl, setJustificatifUrl] = useState<string | undefined>(undefined);
  const [lines, setLines] = useState<
    Array<{
      productId: string;
      quantity: number;
      purchasePrice: number;
    }>
  >([
    {
      productId: physicalProducts[0]?.id || '',
      quantity: 10,
      purchasePrice: physicalProducts[0]?.purchasePrice || 0,
    },
  ]);

  if (!isOpen) return null;

  const handleProductChange = (index: number, productId: string) => {
    const prod = physicalProducts.find((p) => p.id === productId);
    setLines((prev) =>
      prev.map((l, i) =>
        i === index
          ? {
              ...l,
              productId,
              purchasePrice: prod ? prod.purchasePrice : 0,
            }
          : l
      )
    );
  };

  const handleQuantityChange = (index: number, quantity: number) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, quantity: Math.max(1, quantity) } : l))
    );
  };

  const handlePriceChange = (index: number, price: number) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, purchasePrice: Math.max(0, price) } : l))
    );
  };

  const handleAddLine = () => {
    // Select first unused product if available
    const usedIds = new Set(lines.map((l) => l.productId));
    const available = physicalProducts.find((p) => !usedIds.has(p.id)) || physicalProducts[0];
    if (available) {
      setLines((prev) => [
        ...prev,
        {
          productId: available.id,
          quantity: 1,
          purchasePrice: available.purchasePrice,
        },
      ]);
    }
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setJustificatifUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const totalArticles = lines.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0);
  const totalMontant = lines.reduce(
    (acc, l) => acc + (Number(l.quantity) || 0) * (Number(l.purchasePrice) || 0),
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) return;

    // Validate that products exist
    const validLines: StockReceptionLine[] = lines
      .filter((l) => l.productId && l.quantity > 0)
      .map((l) => {
        const prod = physicalProducts.find((p) => p.id === l.productId);
        return {
          productId: l.productId,
          productName: prod?.name || 'Produit',
          quantity: Number(l.quantity),
          purchasePrice: Number(l.purchasePrice),
        };
      });

    if (validLines.length === 0) return;

    await recordStockReception({
      fournisseur: fournisseur.trim() || undefined,
      note: note.trim() || undefined,
      justificatif_url: justificatifUrl,
      lines: validLines,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight">
                Marchandise reçue
              </h2>
              <p className="text-xs text-emerald-100 font-medium">
                Enregistrer une réception fournisseur & mettre à jour le stock
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

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Fournisseur & Note */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Fournisseur / Grossiste
              </label>
              <div className="relative">
                <Truck className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={fournisseur}
                  onChange={(e) => setFournisseur(e.target.value)}
                  placeholder="Ex: Grossiste Adjamé, Sania, Solibra..."
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                N° Bon de livraison / Note
              </label>
              <div className="relative">
                <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ex: BL-8942 / Facture n°44"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Table of Products received */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Articles reçus ({lines.length})
              </label>
              <button
                type="button"
                onClick={handleAddLine}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter un article
              </button>
            </div>

            <div className="space-y-2.5">
              {lines.map((line, idx) => {
                const prod = physicalProducts.find((p) => p.id === line.productId);
                const lineTotal = (line.quantity || 0) * (line.purchasePrice || 0);

                return (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
                  >
                    {/* Product select */}
                    <div className="flex-1 min-w-[180px]">
                      <select
                        value={line.productId}
                        onChange={(e) => handleProductChange(idx, e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
                      >
                        {physicalProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Stock actuel: {p.stock} {p.unit || 'unités'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Quantity */}
                    <div className="w-full sm:w-28">
                      <div className="flex items-center border border-slate-300 bg-white rounded-lg overflow-hidden">
                        <span className="px-2 text-[10px] font-bold text-slate-400 bg-slate-100">
                          Qté
                        </span>
                        <input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(e) => handleQuantityChange(idx, Number(e.target.value))}
                          className="w-full px-2 py-1.5 text-xs font-extrabold text-slate-900 text-center focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Purchase Price (Hidden or disabled if vendeur) */}
                    {!isVendeur ? (
                      <div className="w-full sm:w-36">
                        <div className="flex items-center border border-slate-300 bg-white rounded-lg overflow-hidden">
                          <span className="px-2 text-[10px] font-bold text-slate-400 bg-slate-100">
                            P.A
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="50"
                            value={line.purchasePrice}
                            onChange={(e) => handlePriceChange(idx, Number(e.target.value))}
                            className="w-full px-2 py-1.5 text-xs font-extrabold text-slate-900 text-right focus:outline-none"
                          />
                          <span className="pr-1.5 text-[10px] text-slate-400 font-semibold">
                            F
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 italic">
                        Prix géré par le propriétaire
                      </div>
                    )}

                    {/* Line total */}
                    {!isVendeur && (
                      <div className="text-right sm:w-28 font-bold text-xs text-slate-700 shrink-0">
                        {formatFCFA(lineTotal)}
                      </div>
                    )}

                    {/* Delete line */}
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer self-end sm:self-center"
                        title="Supprimer la ligne"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Justificatif Photo / Bon de livraison */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Photo du bon de livraison / facture (facultatif)
            </label>
            {justificatifUrl ? (
              <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <img
                  src={justificatifUrl}
                  alt="Justificatif"
                  className="w-12 h-12 rounded-lg object-cover border border-emerald-300"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-emerald-900 truncate">
                    Photo du bon enregistrée
                  </p>
                  <button
                    type="button"
                    onClick={() => setJustificatifUrl(undefined)}
                    className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                  >
                    Supprimer la photo
                  </button>
                </div>
              </div>
            ) : (
              <label className="border-2 border-dashed border-slate-200 hover:border-emerald-400 rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer bg-slate-50/50 hover:bg-emerald-50/30 transition-all">
                <UploadCloud className="w-5 h-5 text-slate-400" />
                <span className="text-xs font-bold text-slate-600">
                  Prendre une photo ou importer le bon
                </span>
                <span className="text-[10px] text-slate-400">
                  PNG, JPG ou photo smartphone
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

          {/* Automatic Expense Notice (§ spec: auto expense on reception) */}
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
            <Receipt className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <span className="font-extrabold">Dépense automatique : </span>
              Une dépense de{' '}
              <strong className="text-amber-950 font-black">
                {formatFCFA(totalMontant)}
              </strong>{' '}
              (catégorie <em>Approvisionnement grossiste</em>) sera créée automatiquement dans le journal de caisse et dépenses.
            </div>
          </div>

          {/* Totals & Submit */}
          <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
              <div>
                Total unités :{' '}
                <span className="font-black text-slate-900 text-sm">+{totalArticles}</span>
              </div>
              {!isVendeur && (
                <div>
                  Montant total :{' '}
                  <span className="font-black text-emerald-700 text-sm">
                    {formatFCFA(totalMontant)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={lines.length === 0 || totalArticles <= 0}
                className="flex-1 sm:flex-none px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-700/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                Valider la réception
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
