import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Product, ProductCode } from '../../types';
import {
  QrCode,
  Printer,
  Download,
  Share2,
  Plus,
  Trash2,
  Star,
  Lock,
  Barcode,
  ExternalLink,
  MessageCircle,
} from 'lucide-react';
import {
  generateProductQRCodeDataUrl,
  downloadQRCodeImage,
} from '../../utils/barcodeEngine';
import { formatMoney } from '../../utils/currency';
import { AddCodeModal } from './AddCodeModal';
import { LabelPrintModal } from './LabelPrintModal';

interface ProductCodeSectionProps {
  product: Product;
  onRefreshProduct?: (updatedProduct: Product) => void;
}

export const ProductCodeSection: React.FC<ProductCodeSectionProps> = ({
  product,
  onRefreshProduct,
}) => {
  const {
    settings,
    removeProductCode,
    setPrimaryProductCode,
    showToast,
    products,
  } = useApp();

  // Find latest product instance from context
  const currentProduct = products.find((p) => p.id === product.id) || product;

  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isAddCodeOpen, setIsAddCodeOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // House code
  const houseCode =
    currentProduct.internalCode ||
    currentProduct.productCodes?.find((c) => c.origine === 'GENERE')?.code ||
    `MC-${settings.shopCode || 'BOUTIQUE'}-${currentProduct.id.slice(-6)}`;

  // Generate QR code for house code
  useEffect(() => {
    let isMounted = true;
    generateProductQRCodeDataUrl(houseCode, 160).then((url) => {
      if (isMounted && url) {
        setQrDataUrl(url);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [houseCode]);

  // Handler: Download Image
  const handleDownloadImage = async () => {
    try {
      await downloadQRCodeImage(
        currentProduct.name,
        houseCode,
        `${formatMoney(currentProduct.salePrice)} ${settings.currency || 'FCFA'}`,
        settings.shopName
      );
      showToast('Image du QR Code téléchargée', 'success');
    } catch {
      showToast('Erreur lors du téléchargement de l’image', 'error');
    }
  };

  // Handler: Share on WhatsApp
  const handleShareWhatsApp = () => {
    const text = `🛒 *${currentProduct.name}*\n💰 Prix : *${formatMoney(
      currentProduct.salePrice
    )} ${settings.currency || 'FCFA'}*\n🏷️ Code produit : *${houseCode}*\n\n_Scanne ce code dans MoroCash pour commander instantanément !_`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleRemove = (code: ProductCode) => {
    if (code.origine === 'GENERE') {
      showToast('Le code maison ne peut pas être supprimé', 'warning');
      return;
    }
    removeProductCode(currentProduct.id, code.id);
  };

  const handleSetPrimary = (code: ProductCode) => {
    setPrimaryProductCode(currentProduct.id, code.id);
  };

  const codesList = currentProduct.productCodes || [];

  return (
    <div className="space-y-6 pt-4 border-t border-slate-100">
      {/* ========================================================================= */}
      {/* 2. BLOC "CODE DU PRODUIT" (QR 160x160 + Code en clair + 3 boutons) */}
      {/* ========================================================================= */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-[#4F46E5] flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                Code du produit (Code Maison)
              </h4>
              <p className="text-[11px] text-slate-500">
                Généré automatiquement par MoroCash · Lecture haute fiabilité
              </p>
            </div>
          </div>
          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-50 text-[#4F46E5] border border-indigo-200/60">
            QR Niveau M
          </span>
        </div>

        {/* QR Code Center Display */}
        <div className="flex flex-col items-center justify-center py-2 space-y-2">
          <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-200 inline-block">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR Code ${houseCode}`}
                className="w-[160px] h-[160px] object-contain rounded-lg"
              />
            ) : (
              <div className="w-[160px] h-[160px] bg-slate-100 flex items-center justify-center rounded-lg animate-pulse">
                <QrCode className="w-10 h-10 text-slate-300" />
              </div>
            )}
          </div>

          <div className="text-center">
            <span className="font-mono text-sm sm:text-base font-black tracking-widest text-slate-900 bg-white px-3 py-1 rounded-xl border border-slate-200 shadow-xs inline-block">
              {houseCode}
            </span>
            <p className="text-[10px] text-slate-400 mt-1">
              Ce code est unique à ta boutique et ne change jamais
            </p>
          </div>
        </div>

        {/* 3 Actions Buttons: Imprimer, Télécharger, WhatsApp */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <button
            type="button"
            id="btn-print-single-label"
            onClick={() => setIsPrintModalOpen(true)}
            className="py-2.5 px-2 rounded-2xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="truncate">Imprimer l’étiquette</span>
          </button>

          <button
            type="button"
            id="btn-download-qr-image"
            onClick={handleDownloadImage}
            className="py-2.5 px-2 rounded-2xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">Télécharger l’image</span>
          </button>

          <button
            type="button"
            id="btn-share-qr-whatsapp"
            onClick={handleShareWhatsApp}
            className="py-2.5 px-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">Envoyer WhatsApp</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. SECTION "CODES SCANNABLES" (+ Ajouter un code) */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
              <Barcode className="w-4 h-4 text-slate-700" />
              <span>Codes scannables associés</span>
            </h4>
            <p className="text-[11px] text-slate-500">
              Code maison et codes-barres d'emballage industriel
            </p>
          </div>

          <button
            type="button"
            id="btn-add-product-code"
            onClick={() => setIsAddCodeOpen(true)}
            className="py-2 px-3 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Ajouter un code</span>
          </button>
        </div>

        {/* List of product codes */}
        <div className="space-y-2">
          {codesList.map((codeObj) => {
            const isHouseCode = codeObj.origine === 'GENERE';
            return (
              <div
                key={codeObj.id}
                className="p-3 rounded-2xl border border-slate-200 bg-white flex items-center justify-between gap-3 shadow-2xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isHouseCode
                        ? 'bg-indigo-50 text-[#4F46E5]'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {isHouseCode ? (
                      <QrCode className="w-4 h-4" />
                    ) : (
                      <Barcode className="w-4 h-4" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {codeObj.code}
                      </span>
                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {codeObj.format}
                      </span>
                      {codeObj.est_principal && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                          Principal
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                      {isHouseCode ? (
                        <span className="flex items-center gap-1 text-indigo-600 font-semibold">
                          <Lock className="w-3 h-3" />
                          Code maison · Ne peut pas être supprimé
                        </span>
                      ) : (
                        <span>
                          Origine :{' '}
                          {codeObj.origine === 'SCANNE'
                            ? 'Scanné à la caméra'
                            : codeObj.origine === 'PHOTO'
                            ? 'Extrait d’une photo'
                            : 'Saisie manuelle'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Code actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {!codeObj.est_principal && (
                    <button
                      type="button"
                      onClick={() => handleSetPrimary(codeObj)}
                      title="Définir comme code principal"
                      className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors"
                    >
                      Définir principal
                    </button>
                  )}

                  {!isHouseCode && (
                    <button
                      type="button"
                      onClick={() => handleRemove(codeObj)}
                      title="Supprimer ce code"
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Code Modal */}
      <AddCodeModal
        isOpen={isAddCodeOpen}
        product={currentProduct}
        onClose={() => setIsAddCodeOpen(false)}
        onCodeAdded={() => {
          if (onRefreshProduct) onRefreshProduct(currentProduct);
        }}
      />

      {/* Label Print Modal for this specific product */}
      <LabelPrintModal
        isOpen={isPrintModalOpen}
        preSelectedProduct={currentProduct}
        onClose={() => setIsPrintModalOpen(false)}
      />
    </div>
  );
};
