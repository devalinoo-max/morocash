import React, { useEffect, useState } from 'react';
import { Store, Phone } from 'lucide-react';
import QRCode from 'qrcode';
import { Sale, ShopSettings } from '../../types';
import { formatMoney, formatDate, formatPaymentMethod } from '../../utils/formatters';

export interface ReceiptViewProps {
  sale: Sale;
  settings: ShopSettings;
  isMerchantCopy?: boolean;
  customerTotalDebt?: number;
  className?: string;
  showQrCode?: boolean;
}

export const ReceiptView: React.FC<ReceiptViewProps> = ({
  sale,
  settings,
  isMerchantCopy = false,
  customerTotalDebt,
  className = '',
  showQrCode = true,
}) => {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    if (showQrCode && sale.reference) {
      QRCode.toDataURL(sale.reference, {
        margin: 1,
        width: 100,
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
  }, [sale.reference, showQrCode]);

  const subtotal = sale.subtotal || sale.totalAmount + (sale.discount || 0);
  const hasDiscount = (sale.discount || 0) > 0;
  const clientName = sale.customerName?.trim() || 'Client de passage';

  // Compute total debt for merchant copy
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

  const phoneToDisplay = settings.telephone || settings.ownerPhone;
  const addressToDisplay = settings.adresse || settings.city;

  return (
    <div
      id={`receipt-view-${sale.id}`}
      className={`w-full max-w-sm bg-white p-5 rounded-2xl shadow-sm border border-slate-200/90 font-mono text-xs text-slate-800 space-y-3.5 ${className}`}
    >
      {/* 1. Header & Store Info */}
      <div className="text-center pb-2.5 border-b border-dashed border-slate-300">
        {showLogo && (
          <div className="mx-auto mb-2 flex items-center justify-center">
            {settings.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt={settings.shopName}
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
        {showShopName && (
          <h4 className="font-extrabold text-sm uppercase tracking-wider text-slate-900 font-sans">
            {settings.shopName || 'MoroCash Store'}
          </h4>
        )}
        {showAddress && addressToDisplay && (
          <p className="text-[11px] text-slate-500 font-sans mt-0.5">{addressToDisplay}</p>
        )}
        {showPhone && phoneToDisplay && (
          <p className="text-[10px] text-slate-500 font-sans flex items-center justify-center gap-1 mt-1">
            <Phone className="w-3 h-3 text-slate-400" />
            <span>Contact : {phoneToDisplay}</span>
          </p>
        )}
        {isMerchantCopy && (
          <div className="mt-2 inline-block px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-sans text-[10px] font-bold uppercase tracking-wider">
            Copie commerçant
          </div>
        )}
      </div>

      {/* 2. Metadata: Réf, Client, Date, Vendu par */}
      <div className="space-y-1.5 text-[11px] py-1 border-b border-dashed border-slate-300">
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Réf :</span>
          <span className="font-bold text-slate-900 font-sans">{sale.reference}</span>
        </div>
        {showCustomer && (
          <div className="flex justify-between items-center bg-slate-50/75 px-1.5 py-0.5 rounded">
            <span className="text-slate-600 font-sans font-medium">Client :</span>
            <span className="font-bold font-sans text-slate-900">{clientName}</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Date :</span>
          <span className="text-slate-700">{formatDate(sale.createdAt)}</span>
        </div>
        {showSeller && (
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Vendu par :</span>
            <span className="text-slate-700 font-medium">{sale.sellerName || 'Vendeur'}</span>
          </div>
        )}
      </div>

      {/* 3. Items list */}
      <div className="py-2 border-b border-dashed border-slate-300 space-y-2">
        <div className="flex justify-between font-bold text-[10px] text-slate-500 uppercase tracking-wider">
          <span>Article</span>
          <span>Total</span>
        </div>
        {sale.items.map((item, idx) => (
          <div key={idx} className="flex justify-between text-[11px] leading-snug">
            <div className="pr-3 flex-1">
              <div className="font-semibold text-slate-800 font-sans">{item.name}</div>
              <div className="text-[10px] text-slate-500">
                {item.quantity} × {formatMoney(item.unitPrice)}
              </div>
            </div>
            <span className="font-bold text-slate-900 shrink-0 font-sans">
              {formatMoney(item.total)}
            </span>
          </div>
        ))}
      </div>

      {/* 4. Financial Totals */}
      <div className="space-y-1.5 text-[11px] pt-1">
        {hasDiscount && (
          <>
            <div className="flex justify-between text-slate-600">
              <span>Sous-total :</span>
              <span className="font-medium">{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between text-indigo-700 font-medium">
              <span>
                Remise
                {sale.discountMode === 'PERCENTAGE' && sale.discountValue
                  ? ` (${sale.discountValue} %)`
                  : ''} :
              </span>
              <span>− {formatMoney(sale.discount)}</span>
            </div>
          </>
        )}

        <div className="flex justify-between font-extrabold text-sm text-slate-900 pt-1 border-t border-slate-200/80 font-sans">
          <span>TOTAL :</span>
          <span className="text-[#4F46E5]">{formatMoney(sale.totalAmount)}</span>
        </div>

        <div className="flex justify-between text-slate-700">
          <span>Payé ({formatPaymentMethod(sale.paymentMethod)}) :</span>
          <span className="font-bold text-slate-900">{formatMoney(sale.paidAmount)}</span>
        </div>

        {sale.remainingAmount > 0 ? (
          <div className="pt-1.5 space-y-1">
            <div className="flex justify-between font-bold text-rose-700 text-xs font-sans bg-rose-50 border border-rose-200/80 p-2 rounded-xl">
              <span>Reste à payer :</span>
              <span>{formatMoney(sale.remainingAmount)}</span>
            </div>
            {/* Ligne visible uniquement sur la copie commerçant */}
            {isMerchantCopy && (
              <p className="text-[10.5px] font-sans text-rose-800 font-medium text-center bg-rose-50/60 p-1.5 rounded-lg border border-rose-100">
                Après cette commande, {clientName} te devra {formatMoney(calculatedDebt)} au total
              </p>
            )}
          </div>
        ) : (
          <div className="text-center font-bold text-emerald-700 text-[10.5px] uppercase pt-1 tracking-wider bg-emerald-50/70 py-1 rounded-lg">
            ✓ Soldé intégralement
          </div>
        )}
      </div>

      {/* 5. Custom Footer Message */}
      {showMessage && settings.receiptMessage && (
        <div className="text-center pt-2 text-[10px] text-slate-500 font-sans italic border-t border-dashed border-slate-300">
          "{settings.receiptMessage}"
        </div>
      )}

      {/* 6. Discreet QR Code */}
      {effectiveShowQr && qrCodeDataUrl && (
        <div className="pt-2 text-center flex flex-col items-center justify-center border-t border-dashed border-slate-200">
          <img
            src={qrCodeDataUrl}
            alt={`QR ${sale.reference}`}
            className="w-16 h-16 rounded p-0.5 bg-white border border-slate-200 shadow-2xs"
          />
          <span className="text-[9px] text-slate-400 font-mono mt-0.5">{sale.reference}</span>
        </div>
      )}

      {/* 7. Discreet MoroCash branding */}
      {showWatermark && (
        <div className="pt-1 text-center text-[9px] text-slate-400 font-sans tracking-wide">
          Reçu généré avec MoroCash
        </div>
      )}
    </div>
  );
};
