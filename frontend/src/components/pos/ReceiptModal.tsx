import React from 'react';
import { useApp } from '../../context/AppContext';
import { ReceiptPreview } from '../receipts/ReceiptPreview';

/**
 * Fenêtre du reçu, après une vente ou depuis une commande. Tout son contenu
 * vient de ReceiptPreview, partagé avec « Mes reçus » : ce fichier ne porte
 * que le cadre.
 */
export const ReceiptModal: React.FC = () => {
  const {
    saleSuccessReceipt,
    setSaleSuccessReceipt,
    selectedSaleForReceipt,
    setSelectedSaleForReceipt,
    sales,
  } = useApp();

  const pinnedSale = saleSuccessReceipt || selectedSaleForReceipt;
  // Le reçu affiché juste après la validation porte d'abord un numéro
  // provisoire (la commande n'est pas encore partie). Dès que le serveur
  // répond, la commande de la liste porte son vrai numéro : on relit donc
  // toujours la version courante, sinon le reçu resterait figé sur
  // « EN-ATTENTE-… » sous les yeux du client.
  const sale = pinnedSale
    ? sales.find((s) => s.clientUuid === pinnedSale.clientUuid) ?? pinnedSale
    : null;

  if (!sale) return null;

  const handleClose = () => {
    setSaleSuccessReceipt(null);
    setSelectedSaleForReceipt(null);
  };

  return (
    <div
      id="receipt-success-dialog"
      className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-md max-h-[88vh] sm:max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-modal-title"
      >
        <ReceiptPreview sale={sale} onClose={handleClose} isSuccessMode={Boolean(saleSuccessReceipt)} />
      </div>
    </div>
  );
};
