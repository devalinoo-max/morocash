import React, { useEffect, useState } from 'react';
import { X, Printer, Download, Loader2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Sale } from '../../types';
import { MAX_SAVED_SIZES, type ReceiptPrintPrefs } from '../../utils/receiptPrint';
import { openReceiptPdf, receiptErrorMessage, reserveTabForPdf } from '../../utils/receiptHelpers';
import { PrintFormatPicker, draftFromPrefs, resolveDraft, type PrintDraft } from './PrintFormatPicker';
import { draftAfterDelete, usePrintPrefs } from './usePrintPrefs';

interface PrintReceiptModalProps {
  sales: Sale[];
  isMerchantCopy: boolean;
  customerDebts?: Record<string, number>;
  onClose: () => void;
  /** Appelé une fois le PDF prêt (ouvert ou à télécharger) : trace l'impression. */
  onPrinted: () => void;
}

export const PrintReceiptModal: React.FC<PrintReceiptModalProps> = ({
  sales,
  isMerchantCopy,
  customerDebts,
  onClose,
  onPrinted,
}) => {
  const { settings, showToast } = useApp();
  const { prefs, write, deleteSize } = usePrintPrefs();

  const [draft, setDraft] = useState<PrintDraft>(() => draftFromPrefs(prefs));
  const [remember, setRemember] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [blockedDownload, setBlockedDownload] = useState<(() => void) | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const resolved = resolveDraft(draft, prefs.taillesEnregistrees);
  const canPrint = Boolean(resolved.page) && !isGenerating;

  const handlePrint = async () => {
    if (!resolved.page) return;
    // L'onglet s'ouvre ici, dans le geste : après l'appel réseau il serait bloqué.
    const tab = reserveTabForPdf();

    // Une seule écriture : deux écritures successives partiraient du même état
    // de départ et la seconde effacerait la première.
    const patch: Partial<ReceiptPrintPrefs> = {};
    if (remember && resolved.prefs) Object.assign(patch, resolved.prefs);
    const wantsSave =
      draft.choice === 'CUSTOM' &&
      draft.saveAsName &&
      draft.name.trim() &&
      prefs.taillesEnregistrees.length < MAX_SAVED_SIZES;
    if (wantsSave) {
      patch.taillesEnregistrees = [
        ...prefs.taillesEnregistrees,
        { nom: draft.name.trim(), largeurMm: resolved.page.largeurMm, hauteurMm: resolved.page.hauteurMm },
      ];
    }
    if (Object.keys(patch).length > 0) write(patch);

    setIsGenerating(true);
    try {
      const result = await openReceiptPdf(sales, settings, { isMerchantCopy, page: resolved.page, customerDebts }, tab);
      onPrinted();
      if (result.opened) {
        onClose();
      } else {
        setBlockedDownload(() => result.download);
      }
    } catch (err) {
      console.error(err);
      showToast(receiptErrorMessage('Impression impossible', err), 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-receipt-title"
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[88vh] sm:max-h-[90vh] animate-in fade-in slide-in-from-bottom-4 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-14 shrink-0 px-4 flex items-center justify-between border-b border-slate-100">
          <h3 id="print-receipt-title" className="text-[15px] font-[750] text-slate-900">
            Imprimer le reçu
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          <PrintFormatPicker
            draft={draft}
            onChange={(d) => {
              setDraft(d);
              setBlockedDownload(null);
            }}
            savedSizes={prefs.taillesEnregistrees}
            onDeleteSaved={(idx) => {
              deleteSize(idx);
              setDraft((d) => draftAfterDelete(d, idx));
            }}
          />

          <label className="flex items-center gap-2 text-[12.5px] text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span>Se souvenir de mon choix</span>
          </label>
        </div>

        <div className="shrink-0 p-4 border-t border-slate-100 space-y-2">
          {blockedDownload && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 flex items-center gap-2">
              <p className="flex-1 text-[11.5px] text-amber-900">
                Le navigateur a bloqué l’ouverture du reçu. Télécharge-le pour l’imprimer.
              </p>
              <button
                type="button"
                onClick={() => {
                  blockedDownload();
                  onClose();
                }}
                className="h-9 px-3 rounded-lg bg-slate-900 text-white text-[12px] font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Download className="w-4 h-4" />
                Télécharger
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={handlePrint}
            disabled={!canPrint}
            className="w-full h-12 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[14px] font-bold flex items-center justify-center gap-2 cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            <span>{isGenerating ? 'Préparation du PDF…' : resolved.buttonLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
