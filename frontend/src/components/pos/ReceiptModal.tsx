import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  Share2,
  Download,
  Printer,
  CheckCircle2,
  Copy,
  User,
  ShieldCheck,
  Receipt,
  Loader2,
} from 'lucide-react';
import { ReceiptView } from '../receipts/ReceiptView';
import { PrintReceiptModal } from '../receipts/PrintReceiptModal';
import { WhatsAppRecipientModal, type ReceiptRecipient } from '../receipts/WhatsAppRecipientModal';
import { formatDate } from '../../utils/formatters';
import {
  copyReceiptToClipboard,
  downloadReceiptsPdf,
  receiptErrorMessage,
} from '../../utils/receiptHelpers';

/** Au-delà, l'aperçu replie la liste — le PDF et le texte gardent tout. */
const PREVIEW_ITEMS = 8;

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

  const [isMerchantCopy, setIsMerchantCopy] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRecipientOpen, setIsRecipientOpen] = useState(false);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Dégradés « il y a du contenu au-delà », selon la position de défilement.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);

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

  const updateFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setFadeTop(el.scrollTop > 2);
    setFadeBottom(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }, []);

  useEffect(() => {
    updateFades();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateFades);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [sale?.id, isMerchantCopy, updateFades]);

  useEffect(() => () => clearTimeout(bannerTimer.current), []);

  if (!sale) return null;

  const customer = customers.find((c) => c.id === sale.customerId) ?? customers.find((c) => c.name === sale.customerName);
  const customerDebt = customer ? customer.totalDebt : sale.remainingAmount > 0 ? sale.remainingAmount : 0;

  const flash = (text: string) => {
    clearTimeout(bannerTimer.current);
    setBanner(text);
    bannerTimer.current = setTimeout(() => setBanner(null), 2000);
  };

  const handleClose = () => {
    setSaleSuccessReceipt(null);
    setSelectedSaleForReceipt(null);
  };

  const handleSent = (recipient: ReceiptRecipient) => {
    setIsRecipientOpen(false);
    recordReceiptDelivery(sale.id, 'WHATSAPP', sale.reference, {
      nom: recipient.nom,
      telephone: recipient.telephone,
    });
    flash(recipient.confirmation);
  };

  const handleCopy = async () => {
    try {
      await copyReceiptToClipboard(sale, settings, (canal) => {
        recordReceiptDelivery(sale.id, canal, sale.reference);
      });
      flash('Reçu copié');
    } catch {
      showToast('Copie impossible sur cet appareil', 'error');
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadReceiptsPdf(
        [sale],
        settings,
        { isMerchantCopy, customerDebts: { [sale.id]: customerDebt } },
        (canal) => recordReceiptDelivery(sale.id, canal, sale.reference)
      );
    } catch (err) {
      console.error(err);
      showToast(receiptErrorMessage('Téléchargement impossible', err), 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  // « aujourd'hui à 01:29 » : en sous-titre, au milieu d'une ligne.
  const when = formatDate(sale.createdAt).replace(/^Aujourd'hui/, 'aujourd’hui');

  const secondaryBtn =
    'h-11 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50';

  return (
    <div
      id="receipt-success-dialog"
      className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
      onClick={handleClose}
    >
      {/* Trois zones : en-tête et actions fixes, seul l'aperçu défile. Les
          boutons restent visibles quel que soit le nombre d'articles. */}
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[88vh] sm:max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-modal-title"
      >
        {/* 1. En-tête — 56 px, ne défile jamais */}
        <div className="h-14 shrink-0 px-4 flex items-center gap-2.5 border-b border-slate-100">
          <div
            className={`w-[34px] h-[34px] rounded-[10px] flex items-center justify-center text-white shrink-0 ${
              isSuccessMode ? 'bg-emerald-600' : 'bg-[#4F46E5]'
            }`}
          >
            {isSuccessMode ? <CheckCircle2 className="w-[18px] h-[18px]" /> : <Receipt className="w-[18px] h-[18px]" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="receipt-modal-title" className="text-[15px] font-[750] text-slate-900 leading-tight">
              Reçu
            </h3>
            <p className="text-[10.5px] text-slate-500 truncate leading-tight mt-0.5">
              {sale.reference} · {when}
            </p>
          </div>
          <button
            id="btn-close-receipt-modal-header"
            onClick={handleClose}
            className="w-9 h-9 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            aria-label="Fermer"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. Aperçu — flex 1, défile à l'intérieur */}
        <div className="relative flex-1 min-h-0">
          <div
            aria-hidden
            className={`pointer-events-none absolute top-0 inset-x-0 h-6 z-20 bg-linear-to-b from-white to-white/0 transition-opacity ${
              fadeTop ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <div
            ref={scrollRef}
            onScroll={updateFades}
            className="h-full overflow-y-auto overscroll-contain px-3 sm:px-5 pt-4 pb-0 flex justify-center items-start bg-slate-100/70"
          >
            <ReceiptView
              sale={sale}
              settings={settings}
              isMerchantCopy={isMerchantCopy}
              customerTotalDebt={customerDebt}
              collapseAfter={PREVIEW_ITEMS}
              stickyTotal
              showBottomFade={fadeBottom}
              className="mb-4"
            />
          </div>
          {banner && (
            <div
              role="status"
              className="absolute top-2 inset-x-3 z-30 rounded-xl bg-emerald-600 text-white text-[12.5px] font-bold px-3 py-2.5 shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="truncate">{banner}</span>
            </div>
          )}
        </div>

        {/* 3. Actions — ne défilent jamais */}
        <div className="shrink-0 px-4 pt-2.5 pb-4 border-t border-slate-200 bg-white space-y-2">
          <div className="flex items-center justify-between text-[11.5px]">
            <span className="text-slate-500 font-medium">Aperçu :</span>
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setIsMerchantCopy(false)}
                aria-pressed={!isMerchantCopy}
                className={`px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  !isMerchantCopy ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Copie client</span>
              </button>
              <button
                type="button"
                onClick={() => setIsMerchantCopy(true)}
                aria-pressed={isMerchantCopy}
                className={`px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  isMerchantCopy ? 'bg-amber-700 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Copie commerçant</span>
              </button>
            </div>
          </div>

          <button
            id="btn-receipt-whatsapp"
            type="button"
            onClick={() => setIsRecipientOpen(true)}
            className="w-full h-[52px] px-4 bg-[#25D366] hover:bg-[#20bd5a] active:bg-[#1caa51] text-white font-bold rounded-xl text-[14.5px] flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <Share2 className="w-[18px] h-[18px]" />
            <span>Envoyer sur WhatsApp</span>
          </button>

          <div className="grid grid-cols-3 gap-2">
            <button
              id="btn-receipt-print"
              type="button"
              onClick={() => setIsPrintOpen(true)}
              className={secondaryBtn}
              title="Imprimer le reçu"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span className="truncate">Imprimer</span>
            </button>

            <button
              id="btn-receipt-download"
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              className={secondaryBtn}
              title="Télécharger le reçu PDF"
            >
              {isDownloading ? (
                <Loader2 className="w-4 h-4 text-slate-600 animate-spin" />
              ) : (
                <Download className="w-4 h-4 text-slate-600" />
              )}
              <span className="truncate">PDF</span>
            </button>

            <button
              id="btn-receipt-copy"
              type="button"
              onClick={handleCopy}
              className={secondaryBtn}
              title="Copier le reçu en texte simple"
            >
              <Copy className="w-4 h-4 text-slate-600" />
              <span className="truncate">Copier</span>
            </button>
          </div>
        </div>
      </div>

      {isRecipientOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <WhatsAppRecipientModal
            sale={sale}
            customer={customer}
            onClose={() => setIsRecipientOpen(false)}
            onSent={handleSent}
          />
        </div>
      )}

      {isPrintOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <PrintReceiptModal
            sales={[sale]}
            isMerchantCopy={isMerchantCopy}
            customerDebts={{ [sale.id]: customerDebt }}
            onClose={() => setIsPrintOpen(false)}
            onPrinted={() => recordReceiptDelivery(sale.id, 'IMPRESSION', sale.reference)}
          />
        </div>
      )}
    </div>
  );
};
