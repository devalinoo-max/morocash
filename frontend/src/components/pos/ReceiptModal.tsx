import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  Share2,
  Download,
  Printer,
  CheckCircle2,
  Copy,
  Check,
  User,
  ShieldCheck,
} from 'lucide-react';
import { ReceiptView } from '../receipts/ReceiptView';
import { formatDate } from '../../utils/formatters';
import {
  shareReceiptOnWhatsApp,
  copyReceiptToClipboard,
  printReceiptsPdf,
  downloadReceiptsPdf,
  receiptErrorMessage,
} from '../../utils/receiptHelpers';

export const ReceiptModal: React.FC = () => {
  const {
    saleSuccessReceipt,
    setSaleSuccessReceipt,
    selectedSaleForReceipt,
    setSelectedSaleForReceipt,
    settings,
    customers,
    sales,
    recordReceiptDelivery,
    showToast,
  } = useApp();

  const [copied, setCopied] = useState(false);
  const [isMerchantCopy, setIsMerchantCopy] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const pinnedSale = saleSuccessReceipt || selectedSaleForReceipt;
  // Le reçu affiché juste après la validation porte d'abord un numéro
  // provisoire (la commande n'est pas encore partie). Dès que le serveur
  // répond, la commande de la liste porte son vrai numéro : on relit donc
  // toujours la version courante, sinon le reçu resterait figé sur
  // « EN-ATTENTE-… » sous les yeux du client.
  const sale = pinnedSale
    ? sales.find((s) => s.clientUuid === pinnedSale.clientUuid) ?? pinnedSale
    : null;
  const isSuccessMode = Boolean(saleSuccessReceipt);

  if (!sale) return null;

  const customer = customers.find((c) => c.name === sale.customerName || c.id === sale.customerId);
  const customerDebt = customer ? customer.totalDebt : (sale.remainingAmount > 0 ? sale.remainingAmount : 0);

  const handleClose = () => {
    setSaleSuccessReceipt(null);
    setSelectedSaleForReceipt(null);
  };

  const handleWhatsApp = () => {
    shareReceiptOnWhatsApp(sale, settings, (canal) => {
      recordReceiptDelivery(sale.id, canal, sale.reference);
      showToast('Ouverture de WhatsApp...', 'success');
    });
  };

  const handleCopy = async () => {
    try {
      await copyReceiptToClipboard(sale, settings, (canal) => {
        recordReceiptDelivery(sale.id, canal, sale.reference);
      });
      setCopied(true);
      showToast('Texte du reçu copié !', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Erreur lors de la copie', 'error');
    }
  };

  const handlePrint = async () => {
    setIsGeneratingPdf(true);
    try {
      const result = await printReceiptsPdf([sale], settings, isMerchantCopy, (canal) => {
        recordReceiptDelivery(sale.id, canal, sale.reference);
      });
      showToast(
        result === 'opened'
          ? 'Reçu PDF envoyé à l’impression'
          : 'Le navigateur a bloqué l’ouverture : le reçu a été téléchargé',
        'info'
      );
    } catch (err) {
      console.error(err);
      showToast(receiptErrorMessage('Impression impossible', err), 'error');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownload = async () => {
    setIsGeneratingPdf(true);
    try {
      await downloadReceiptsPdf([sale], settings, isMerchantCopy, (canal) => {
        recordReceiptDelivery(sale.id, canal, sale.reference);
      });
      showToast('Téléchargement du reçu PDF...', 'success');
    } catch (err) {
      console.error(err);
      showToast(receiptErrorMessage('Téléchargement impossible', err), 'error');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div
      id="receipt-success-dialog"
      className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] my-auto animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête conditionnel : Commande enregistrée OU Aperçu de reçu */}
        <div
          className={`px-5 py-4 border-b border-slate-100 flex items-center justify-between ${
            isSuccessMode
              ? 'bg-linear-to-r from-emerald-50 via-teal-50 to-white'
              : 'bg-linear-to-r from-indigo-50/70 via-slate-50 to-white'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-xs text-white ${
                isSuccessMode ? 'bg-emerald-600' : 'bg-[#4F46E5]'
              }`}
            >
              {isSuccessMode ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <User className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 leading-tight">
                {isSuccessMode ? 'Commande enregistrée' : `Reçu N° ${sale.reference}`}
              </h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {isSuccessMode
                  ? `Reçu N° ${sale.reference}`
                  : `Émis le ${formatDate(sale.createdAt)}`}
              </p>
            </div>
          </div>
          <button
            id="btn-close-receipt-modal-header"
            onClick={handleClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
            title="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toggle Copie client / Copie commerçant */}
        <div className="px-5 pt-3 pb-1 flex items-center justify-between bg-slate-50/70 border-b border-slate-100 text-xs">
          <span className="text-slate-500 font-medium">Aperçu :</span>
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setIsMerchantCopy(false)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                !isMerchantCopy
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Copie client</span>
            </button>
            <button
              type="button"
              onClick={() => setIsMerchantCopy(true)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                isMerchantCopy
                  ? 'bg-amber-700 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Copie commerçant</span>
            </button>
          </div>
        </div>

        {/* Receipt Content Scrollable */}
        <div className="p-4 sm:p-5 overflow-y-auto flex justify-center bg-slate-100/70">
          <ReceiptView
            sale={sale}
            settings={settings}
            isMerchantCopy={isMerchantCopy}
            customerTotalDebt={customerDebt}
          />
        </div>

        {/* Barre d'actions au même niveau */}
        <div className="p-4 border-t border-slate-200 bg-white space-y-2">
          {/* Action principale WhatsApp */}
          <button
            id="btn-receipt-whatsapp"
            type="button"
            onClick={handleWhatsApp}
            className="w-full py-2.5 px-4 bg-[#25D366] hover:bg-[#20bd5a] active:bg-[#1caa51] text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            <span>Envoyer sur WhatsApp</span>
          </button>

          {/* Grille d'actions au même niveau (Imprimer, Télécharger, Copier, Fermer) */}
          <div className="grid grid-cols-4 gap-2">
            <button
              id="btn-receipt-print"
              type="button"
              onClick={handlePrint}
              disabled={isGeneratingPdf}
              className="py-2 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
              title="Imprimer le ticket"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span className="truncate">Imprimer</span>
            </button>

            <button
              id="btn-receipt-download"
              type="button"
              onClick={handleDownload}
              disabled={isGeneratingPdf}
              className="py-2 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
              title="Télécharger le reçu PDF"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span className="truncate">PDF</span>
            </button>

            <button
              id="btn-receipt-copy"
              type="button"
              onClick={handleCopy}
              className="py-2 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer"
              title="Copier le texte du reçu"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700 truncate">Copié !</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-600" />
                  <span className="truncate">Copier</span>
                </>
              )}
            </button>

            <button
              id="btn-receipt-close-footer"
              type="button"
              onClick={handleClose}
              className="py-2 px-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer"
              title="Fermer cette fenêtre"
            >
              <X className="w-4 h-4 text-slate-600" />
              <span className="truncate">Fermer</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
