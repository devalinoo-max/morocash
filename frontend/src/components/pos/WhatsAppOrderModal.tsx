import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Product } from '../../types';
import { MessageSquare, Sparkles, Check, AlertCircle, X, ArrowRight, Clipboard } from 'lucide-react';
import { formatMoney } from '../../utils/currency';
import { countLabel } from '../../utils/plural';

interface WhatsAppOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyItems: (items: { product: Product; quantity: number }[]) => void;
}

export const WhatsAppOrderModal: React.FC<WhatsAppOrderModalProps> = ({
  isOpen,
  onClose,
  onApplyItems,
}) => {
  const { products, showToast } = useApp();
  const [inputText, setInputText] = useState(
    'Bonjour, je veux 2 laits bonnet rouge\n1 paquet de biscuits\n3 savons'
  );

  if (!isOpen) return null;

  // Smart parser: detect quantities and find best matching products in catalog
  const parseLines = () => {
    const lines = inputText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 1);

    const parsed: {
      raw: string;
      quantity: number;
      matchedProduct: Product | null;
    }[] = [];

    lines.forEach((line) => {
      // Extract leading or trailing digits as quantity (e.g. "2 laits" or "savons x 3" or "3 savons")
      const qtyMatch = line.match(/(?:^|\s)(\d+)(?:\s*x|\s+|$)/i) || line.match(/x\s*(\d+)/i);
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

      // Clean line from numbers and common filler words
      const cleaned = line
        .replace(/(?:^|\s)\d+(?:\s*x|\s+|$)/gi, ' ')
        .replace(/x\s*\d+/gi, ' ')
        .replace(/\b(bonjour|je|veux|voudrais|stp|merci|paquet|paquets|de|des|du|le|la|les|bouteille|bouteilles|carton|cartons)\b/gi, ' ')
        .trim()
        .toLowerCase();

      // Find best match in catalog
      let bestMatch: Product | null = null;
      let highestScore = 0;

      products.forEach((prod) => {
        const prodName = prod.name.toLowerCase();
        // Check exact inclusion
        if (cleaned.length > 2 && prodName.includes(cleaned)) {
          bestMatch = prod;
          highestScore = 10;
        } else if (cleaned.length > 2 && cleaned.split(' ').some((word) => word.length > 2 && prodName.includes(word))) {
          if (highestScore < 5) {
            bestMatch = prod;
            highestScore = 5;
          }
        }
      });

      // Fallback: if no match, match by first word or closest
      if (!bestMatch && products.length > 0) {
        const firstWord = cleaned.split(' ')[0];
        if (firstWord && firstWord.length > 2) {
          const match = products.find((p) => p.name.toLowerCase().includes(firstWord));
          if (match) bestMatch = match;
        }
      }

      parsed.push({
        raw: line,
        quantity: Math.max(1, qty),
        matchedProduct: bestMatch,
      });
    });

    return parsed;
  };

  const parsedResults = parseLines();
  const matchedCount = parsedResults.filter((r) => r.matchedProduct !== null).length;

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setInputText(text);
          showToast('Texte collé depuis le presse-papiers', 'info');
        }
      }
    } catch {
      showToast('Presse-papiers non disponible directement', 'warning');
    }
  };

  const handleConfirm = () => {
    const validItems: { product: Product; quantity: number }[] = [];
    parsedResults.forEach((r) => {
      if (r.matchedProduct) {
        validItems.push({
          product: r.matchedProduct,
          quantity: r.quantity,
        });
      }
    });

    if (validItems.length === 0) {
      showToast('Aucun article reconnu dans ce message', 'warning');
      return;
    }

    onApplyItems(validItems);
    showToast(
      `${countLabel(validItems.length, 'article')} ${validItems.length > 1 ? 'ajoutés' : 'ajouté'} à la commande`,
      'success'
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#25D366] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold">Commande reçue par WhatsApp</h3>
              <p className="text-xs text-white/90">Colle le message texte du client</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center cursor-pointer text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">Message WhatsApp :</label>
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="text-xs font-bold text-[#25D366] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Clipboard className="w-3.5 h-3.5" />
                Coller du presse-papiers
              </button>
            </div>
            <textarea
              rows={4}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ex: 2 laits bonnet rouge&#10;1 paquet biscuit&#10;3 savons"
              className="w-full p-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#25D366] transition-all"
            />
          </div>

          {/* Analysis / Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Articles détectés ({matchedCount}/{parsedResults.length})
              </span>
              <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md">
                Analyse automatique
              </span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {parsedResults.map((res, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                    res.matchedProduct
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {res.matchedProduct ? (
                      <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-slate-300 text-slate-600 flex items-center justify-center shrink-0">
                        <AlertCircle className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="font-bold truncate">
                        {res.matchedProduct
                          ? `${res.quantity} × ${res.matchedProduct.name}`
                          : `Non reconnu : "${res.raw}"`}
                      </p>
                      {res.matchedProduct && (
                        <p className="text-[10px] text-emerald-700">
                          Prix unitaire : {formatMoney(res.matchedProduct.salePrice)} · Total :{' '}
                          {formatMoney(res.matchedProduct.salePrice * res.quantity)}
                        </p>
                      )}
                    </div>
                  </div>

                  {res.matchedProduct && (
                    <span className="font-black text-slate-900 shrink-0">
                      {formatMoney(res.matchedProduct.salePrice * res.quantity)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={matchedCount === 0}
            className="px-5 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-bold shadow-md disabled:opacity-40 disabled:pointer-events-none flex items-center gap-2 cursor-pointer"
          >
            <span>Mettre ces {matchedCount} articles dans la commande</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
