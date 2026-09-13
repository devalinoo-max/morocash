import React, { useState } from 'react';
import { Printer, Loader2, Download, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Sale } from '../../types';
import { MAX_SAVED_SIZES } from '../../utils/receiptPrint';
import { openReceiptPdf, receiptErrorMessage, reserveTabForPdf } from '../../utils/receiptHelpers';
import { PrintFormatPicker, draftFromPrefs, resolveDraft, type PrintDraft } from './PrintFormatPicker';
import { draftAfterDelete, usePrintPrefs } from './usePrintPrefs';

/**
 * Reçu d'essai : données fictives, assez d'articles pour juger du cadrage,
 * une remise et un nom long pour voir le passage à la ligne.
 */
function buildTestSale(): Sale {
  const items = [
    { productId: 'essai-1', name: 'Riz parfumé 5 kg', unitPrice: 4_500, quantity: 2, total: 9_000 },
    { productId: 'essai-2', name: 'Huile végétale 1 L', unitPrice: 1_500, quantity: 1, total: 1_500 },
    { productId: 'essai-3', name: 'Savon de Marseille grand format, lot de trois pains', unitPrice: 2_500, quantity: 1, total: 2_500 },
  ];
  const subtotal = 13_000;
  const discount = 1_300;
  return {
    id: 'recu-essai',
    clientUuid: 'recu-essai',
    reference: 'ESSAI-0001',
    items,
    subtotal,
    discount,
    discountMode: 'PERCENTAGE',
    discountValue: 10,
    totalAmount: subtotal - discount,
    paidAmount: 5_000,
    remainingAmount: subtotal - discount - 5_000,
    paymentStatus: 'PARTIAL',
    paymentMethod: 'CASH',
    customerName: 'Client d’essai',
    createdAt: new Date().toISOString(),
    sellerName: 'Vendeur d’essai',
    syncStatus: 'SYNCED',
  };
}

export const DefaultPrintFormatSetting: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const { settings, showToast } = useApp();
  const { prefs, write, saveSize, deleteSize } = usePrintPrefs();
  const [draft, setDraft] = useState<PrintDraft>(() => draftFromPrefs(prefs));
  const [isGenerating, setIsGenerating] = useState(false);
  const [blockedDownload, setBlockedDownload] = useState<(() => void) | null>(null);

  const resolved = resolveDraft(draft, prefs.taillesEnregistrees);

  // Enregistré dès que le choix est valide, comme les autres réglages de la page.
  const handleChange = (next: PrintDraft) => {
    setDraft(next);
    setBlockedDownload(null);
    const r = resolveDraft(next, prefs.taillesEnregistrees);
    if (r.prefs) {
      write(r.prefs);
      onSaved();
    }
  };

  const handleSaveSize = () => {
    if (!resolved.page || !draft.name.trim()) return;
    if (prefs.taillesEnregistrees.length >= MAX_SAVED_SIZES) return;
    const index = prefs.taillesEnregistrees.length;
    saveSize({ nom: draft.name.trim(), largeurMm: resolved.page.largeurMm, hauteurMm: resolved.page.hauteurMm });
    setDraft({ ...draft, choice: `SAVED:${index}`, saveAsName: false, name: '' });
    showToast(`Taille « ${draft.name.trim()} » enregistrée`, 'success');
  };

  const handleTestPrint = async () => {
    if (!resolved.page) return;
    const tab = reserveTabForPdf();
    setIsGenerating(true);
    try {
      const result = await openReceiptPdf([buildTestSale()], settings, { page: resolved.page }, tab);
      if (!result.opened) setBlockedDownload(() => result.download);
    } catch (err) {
      console.error(err);
      showToast(receiptErrorMessage('Reçu d’essai impossible', err), 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-3 max-w-lg">
      <PrintFormatPicker
        draft={draft}
        onChange={handleChange}
        savedSizes={prefs.taillesEnregistrees}
        onDeleteSaved={(idx) => {
          deleteSize(idx);
          setDraft((d) => draftAfterDelete(d, idx));
        }}
        onSaveSizeNow={handleSaveSize}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleTestPrint}
          disabled={!resolved.page || isGenerating}
          className="h-10 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
          Imprimer un reçu d’essai
        </button>
        {blockedDownload && (
          <button
            type="button"
            onClick={() => {
              blockedDownload();
              setBlockedDownload(null);
            }}
            className="h-10 px-3 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Télécharger
          </button>
        )}
        {resolved.page && (
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            {resolved.buttonLabel === 'Imprimer' ? 'Format enregistré' : resolved.buttonLabel.replace(/^Imprimer en/, 'Enregistré :')}
          </span>
        )}
      </div>
    </div>
  );
};
