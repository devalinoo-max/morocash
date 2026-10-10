import React, { useEffect, useState } from 'react';
import { Printer, Receipt, Share2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Versement } from '../../types';
import { ReceiptView } from '../receipts/ReceiptView';
import { fetchVersementReceipt } from '../../api/payments';
import { toWhatsAppNumber } from '../../utils/receiptHelpers';
import { receiptShellFor, versementLabel, versementWhatsAppText } from '../../utils/versements';

/** Ouvre WhatsApp sur le reçu d'un ou plusieurs versements, vers le numéro du client s'il est connu. */
export function shareVersementsOnWhatsApp(
  versements: Versement[],
  settings: ReturnType<typeof useApp>['settings']
): void {
  if (versements.length === 0) return;
  const text = versements.map((v) => versementWhatsAppText(v, settings)).join('\n\n');
  const phone = toWhatsAppNumber(versements[0].customerPhone ?? '');
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

interface VersementReceiptModalProps {
  versement: Versement;
  onClose: () => void;
}

/**
 * Le reçu d'un versement : le reçu commun, en mode « versement », avec ses
 * deux gestes — envoyer sur WhatsApp, imprimer.
 *
 * Ce qui s'affiche tout de suite est ce que l'appareil a déjà (un reçu
 * synchronisé s'ouvre donc sans réseau). En ligne, les données figées sont
 * relues sur le serveur : c'est sa version qui reste à l'écran.
 */
export const VersementReceiptModal: React.FC<VersementReceiptModalProps> = ({ versement, onClose }) => {
  const { settings } = useApp();
  const [current, setCurrent] = useState(versement);

  useEffect(() => {
    setCurrent(versement);
    if (versement.isPending) return;
    let cancelled = false;
    fetchVersementReceipt(versement.id)
      .then((fresh) => {
        if (!cancelled) setCurrent(fresh);
      })
      .catch(() => {
        // Hors ligne ou serveur injoignable : la version locale reste affichée.
      });
    return () => {
      cancelled = true;
    };
  }, [versement]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="versement-receipt-title"
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh] animate-in fade-in slide-in-from-bottom-4 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-14 shrink-0 px-4 flex items-center gap-2.5 border-b border-slate-100">
          <div className="w-[34px] h-[34px] rounded-[10px] bg-[#4F46E5] text-white flex items-center justify-center shrink-0">
            <Receipt className="w-[18px] h-[18px]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="versement-receipt-title" className="text-[15px] font-[750] text-slate-900 leading-tight">
              Reçu de paiement
            </h3>
            <p className="text-[10.5px] text-slate-500 truncate leading-tight mt-0.5">
              {current.isPending
                ? 'En attente d’envoi'
                : `${versementLabel(current.numero)} · ${current.receiptNumber ?? ''}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-12 h-12 -mr-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-5 py-4 bg-slate-100/70">
          <div id="thermal-receipt" className="flex flex-col items-center">
            <ReceiptView sale={receiptShellFor(current)} settings={settings} versement={current} />
          </div>
        </div>

        <div className="shrink-0 px-4 pt-2.5 pb-4 border-t border-slate-200 bg-white space-y-2">
          <button
            type="button"
            onClick={() => shareVersementsOnWhatsApp([current], settings)}
            className="w-full h-[52px] px-4 bg-[#25D366] hover:bg-[#20bd5a] active:bg-[#1caa51] text-white font-bold rounded-xl text-[14.5px] flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <Share2 className="w-[18px] h-[18px]" />
            <span>Envoyer sur WhatsApp</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="w-full h-12 px-4 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span>Imprimer</span>
          </button>
        </div>
      </div>
    </div>
  );
};
