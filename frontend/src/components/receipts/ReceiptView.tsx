import React, { useEffect, useState } from 'react';
import { Store, Phone } from 'lucide-react';
import QRCode from 'qrcode';
import { Sale, ShopSettings } from '../../types';
import { formatMoneyCompact, formatDate, formatPaymentMethod } from '../../utils/formatters';
import { receiptPhone, receiptVerifyUrl, resolveReceiptMessage } from '../../utils/receiptHelpers';

export interface ReceiptViewProps {
  sale: Sale;
  settings: ShopSettings;
  isMerchantCopy?: boolean;
  customerTotalDebt?: number;
  className?: string;
  showQrCode?: boolean;
  /**
   * Au-delà de ce nombre d'articles, l'aperçu replie la liste derrière une
   * ligne « + N autres articles ». Écran seulement : le PDF et le texte
   * partagé contiennent toujours tous les articles.
   */
  collapseAfter?: number;
  /** Le bloc TOTAL reste collé en bas de la zone qui défile. */
  stickyTotal?: boolean;
  /** Dégradé au-dessus du total collé : il reste du contenu plus bas. */
  showBottomFade?: boolean;
}

export const ReceiptView: React.FC<ReceiptViewProps> = ({
  sale,
  settings,
  isMerchantCopy = false,
  customerTotalDebt,
  className = '',
  showQrCode = true,
  collapseAfter,
  stickyTotal = false,
  showBottomFade = false,
}) => {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [expanded, setExpanded] = useState(false);

  // Le QR encode le lien de vérification du reçu ; faute de boutique connue
  // (session pas encore chargée), il retombe sur le numéro du reçu.
  const qrPayload = receiptVerifyUrl(sale, settings) || sale.reference;

  useEffect(() => {
    let isMounted = true;
    if (showQrCode && qrPayload) {
      QRCode.toDataURL(qrPayload, {
        margin: 1,
        width: 160,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#1e293b',
          light: '#ffffff',
        },
      })
        .then((url) => {
          if (isMounted) setQrCodeDataUrl(url);
        })
        .catch(() => {
          if (isMounted) setQrCodeDataUrl('');
        });
    }
    return () => {
      isMounted = false;
    };
  }, [qrPayload, showQrCode]);

  // Nouvelle commande affichée dans la même fenêtre : la liste repart repliée.
  useEffect(() => setExpanded(false), [sale.id]);

  const subtotal = sale.subtotal || sale.totalAmount + (sale.discount || 0);
  const hasDiscount = (sale.discount || 0) > 0;
  const clientName = sale.customerName?.trim() || 'Client de passage';
  const clientFirstName = clientName.split(/\s+/)[0];

  // Dette totale du client, pour la seule copie commerçant.
  const calculatedDebt =
    customerTotalDebt !== undefined
      ? customerTotalDebt
      : sale.remainingAmount > 0
      ? sale.remainingAmount
      : 0;

  // Settings flags from receiptSettings or backward-compatible defaults
  const receiptConfig = settings.receiptSettings;
  const showLogo = receiptConfig ? receiptConfig.showLogo : settings.showLogo;
  const showShopName = receiptConfig ? receiptConfig.showShopName : true;
  const showPhone = receiptConfig ? receiptConfig.showPhone : settings.showPhone;
  const showAddress = receiptConfig ? receiptConfig.showAddress : Boolean(settings.adresse);
  const showSeller = receiptConfig ? receiptConfig.showSellerName : true;
  const showCustomer = receiptConfig ? receiptConfig.showCustomerName : true;
  const effectiveShowQr = receiptConfig ? receiptConfig.showQrCode : showQrCode;
  const showMessage = receiptConfig ? receiptConfig.showMessage : Boolean(settings.receiptMessage);
  const showWatermark = receiptConfig ? receiptConfig.showWatermark : true;

  const phoneToDisplay = receiptPhone(settings);
  const message = resolveReceiptMessage(settings);
  const addressToDisplay = settings.adresse || settings.city;
  // Nom de boutique et vendeur : ceux de la base, ou rien. Un nom de secours
  // (« MoroCash Store », « Vendeur ») ressemble à une vraie valeur et passe
  // inaperçu sur un reçu remis au client.
  const shopName = settings.shopName?.trim();
  const sellerName = sale.sellerName?.trim();

  const isCollapsible = collapseAfter !== undefined && sale.items.length > collapseAfter;
  const visibleItems = isCollapsible && !expanded ? sale.items.slice(0, collapseAfter) : sale.items;
  const hiddenCount = sale.items.length - visibleItems.length;

  // Écran : au-delà de 7 chiffres le montant est abrégé (111,1 M F) pour ne
  // jamais déborder. Le PDF et le texte partagé gardent le montant complet.
  const money = formatMoneyCompact;

  return (
    <div
      id={`receipt-view-${sale.id}`}
      className={`w-full max-w-sm bg-white p-5 rounded-2xl shadow-sm border border-slate-200/90 text-xs text-slate-800 space-y-3.5 ${className}`}
    >
      {/* 1. Boutique */}
      <div className="text-center pb-2.5 border-b border-dashed border-slate-300">
        {showLogo && (
          <div className="mx-auto mb-2 flex items-center justify-center">
            {settings.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt={shopName || 'Logo'}
                className="w-14 h-14 rounded-xl object-contain shadow-xs border border-slate-200 p-0.5 bg-white"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
                <Store className="w-5 h-5" />
              </div>
            )}
          </div>
        )}
        {showShopName && shopName && (
          <h4 className="font-extrabold text-sm uppercase tracking-wider text-slate-900 break-words">{shopName}</h4>
        )}
        {showAddress && addressToDisplay && (
          <p className="text-[11px] text-slate-500 mt-0.5">{addressToDisplay}</p>
        )}
        {showPhone && phoneToDisplay && (
          <p className="text-[10px] text-slate-500 flex items-center justify-center gap-1 mt-1">
            <Phone className="w-3 h-3 text-slate-400" />
            <span>Contact : {phoneToDisplay}</span>
          </p>
        )}
        {isMerchantCopy && (
          <div className="mt-2 inline-block px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold uppercase tracking-wider">
            Copie commerçant
          </div>
        )}
      </div>

      {/* 2. N°, client, date, vendeur */}
      <div className="space-y-1.5 text-[11px] py-1 border-b border-dashed border-slate-300">
        <div className="flex justify-between items-center gap-3">
          <span className="text-slate-500 shrink-0">N° :</span>
          <span className="font-bold text-slate-900 truncate">{sale.reference}</span>
        </div>
        {showCustomer && (
          <div className="flex justify-between items-center gap-3 bg-slate-50/75 px-1.5 py-0.5 rounded">
            <span className="text-slate-600 font-medium shrink-0">Client :</span>
            <span className="font-bold text-slate-900 truncate">{clientName}</span>
          </div>
        )}
        <div className="flex justify-between items-center gap-3">
          <span className="text-slate-500 shrink-0">Date :</span>
          <span className="text-slate-700">{formatDate(sale.createdAt)}</span>
        </div>
        {showSeller && sellerName && (
          <div className="flex justify-between items-center gap-3">
            <span className="text-slate-500 shrink-0">Vendu par :</span>
            <span className="text-slate-700 font-medium truncate">{sellerName}</span>
          </div>
        )}
      </div>

      {/* 3. Articles */}
      <div className="py-2 border-b border-dashed border-slate-300 space-y-2">
        <div className="flex justify-between font-bold text-[10px] text-slate-500 uppercase tracking-wider">
          <span>Article</span>
          <span>Total</span>
        </div>
        {visibleItems.map((item, idx) => (
          <div key={idx} className="flex justify-between gap-3 text-[11px] leading-snug">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-800 break-words">{item.name}</div>
              <div className="text-[10px] text-slate-500 tabular-nums">
                {item.quantity} × {money(item.unitPrice)}
              </div>
            </div>
            <span className="font-bold text-slate-900 shrink-0 tabular-nums whitespace-nowrap">
              {money(item.total)}
            </span>
          </div>
        ))}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full py-2 rounded-lg text-[11.5px] font-bold text-[#4F46E5] bg-indigo-50/70 hover:bg-indigo-50 transition-colors cursor-pointer"
          >
            + {hiddenCount} {hiddenCount > 1 ? 'autres articles' : 'autre article'}
          </button>
        )}
      </div>

      {/* 4. Montants — la remise s'intercale entre le sous-total et le total. */}
      {hasDiscount && (
        <div className="space-y-1.5 text-[11px] pt-1">
          <div className="flex justify-between gap-3 text-slate-600">
            <span>Sous-total :</span>
            <span className="font-medium tabular-nums whitespace-nowrap">{money(subtotal)}</span>
          </div>
          <div className="flex justify-between gap-3 text-slate-700 font-medium">
            <span>
              Remise
              {sale.discountMode === 'PERCENTAGE' && sale.discountValue ? ` (${sale.discountValue} %)` : ''} :
            </span>
            <span className="tabular-nums whitespace-nowrap">− {money(sale.discount)}</span>
          </div>
        </div>
      )}

      {/* Enfant direct de la carte, et non d'un sous-bloc : un élément collant ne
          sort jamais de son parent, il ne suivrait donc pas le défilement de la
          liste d'articles. */}
      <div
          className={
            stickyTotal
              ? 'sticky bottom-0 z-10 -mx-5 px-5 pt-1.5 pb-3 bg-white shadow-[0_-6px_12px_-8px_rgba(15,23,42,0.18)] space-y-1.5 text-[11px]'
              : 'space-y-1.5 text-[11px]'
          }
        >
          {stickyTotal && showBottomFade && (
            <div
              aria-hidden
              className="pointer-events-none absolute left-0 right-0 -top-6 h-6 bg-linear-to-t from-white to-white/0"
            />
          )}
          <div className="flex justify-between gap-3 font-extrabold text-sm text-slate-900 pt-1 border-t border-slate-200/80">
            <span>TOTAL :</span>
            <span className="text-[#4F46E5] tabular-nums whitespace-nowrap">{money(sale.totalAmount)}</span>
          </div>

          <div className="flex justify-between gap-3 text-slate-700">
            <span>Payé ({formatPaymentMethod(sale.paymentMethod)}) :</span>
            <span className="font-bold text-slate-900 tabular-nums whitespace-nowrap">{money(sale.paidAmount)}</span>
          </div>

          {sale.remainingAmount > 0 ? (
            <div className="flex justify-between gap-3 font-bold text-rose-700 text-xs bg-rose-50 border border-rose-200/80 p-2 rounded-xl">
              <span>Reste à payer :</span>
              <span className="tabular-nums whitespace-nowrap">{money(sale.remainingAmount)}</span>
            </div>
          ) : (
            <div className="text-center font-bold text-emerald-700 text-[10.5px] uppercase tracking-wider bg-emerald-50/70 py-1 rounded-lg">
              ✓ Payé en entier
            </div>
          )}
        </div>

        {/* Copie commerçant uniquement : le client n'a pas à connaître ses autres dettes. */}
        {isMerchantCopy && (
          <p className="text-[10.5px] text-amber-900 font-medium text-center bg-amber-50/70 p-1.5 rounded-lg border border-amber-100">
            {calculatedDebt > 0
              ? `Après cette commande, ${clientFirstName} te doit ${money(calculatedDebt)} au total`
              : `Après cette commande, ${clientFirstName} ne te doit plus rien`}
          </p>
        )}

      {/* 5. Custom Footer Message */}
      {showMessage && message && (
        <div className="text-center pt-2 text-[10px] text-slate-500 italic border-t border-dashed border-slate-300">
          "{message}"
        </div>
      )}

      {/* 6. QR code : scanné, il rouvre ce reçu en ligne */}
      {effectiveShowQr && qrCodeDataUrl && (
        <div className="pt-2 text-center flex flex-col items-center justify-center border-t border-dashed border-slate-200">
          <img
            src={qrCodeDataUrl}
            alt={`QR ${sale.reference}`}
            className="w-20 h-20 rounded p-0.5 bg-white border border-slate-200 shadow-2xs"
          />
          <span className="text-[9px] text-slate-400 mt-0.5">Scanne pour vérifier ce reçu · {sale.reference}</span>
        </div>
      )}

      {/* 7. Discreet MoroCash branding */}
      {showWatermark && (
        <div className="pt-1 text-center text-[9px] text-slate-400 tracking-wide">
          Reçu généré avec MoroCash
        </div>
      )}
    </div>
  );
};
