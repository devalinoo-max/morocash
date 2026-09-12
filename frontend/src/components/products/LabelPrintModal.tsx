import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Product,
  LabelField,
  LabelFormat,
  LabelTextSize,
  LabelCodeType,
  LabelSettings,
} from '../../types';
import { countLabel } from '../../utils/plural';
import {
  X,
  Printer,
  Download,
  Share2,
  RotateCcw,
  AlertTriangle,
  FileText,
  Check,
  Plus,
  Minus,
  Eye,
  Smartphone,
  Sparkles,
  Info,
  Layers,
} from 'lucide-react';
import { formatMoney } from '../../utils/currency';
import QRCode from 'qrcode';

interface LabelPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  preSelectedProduct?: Product | null;
}

const DEFAULT_LABEL_SETTINGS: LabelSettings = {
  champs: ['nom', 'prix', 'code'],
  format: '24_63x34',
  tailleTexte: 'NORMAL',
  typeCode: 'QR',
  traitsDecoupe: true,
};

export const LabelPrintModal: React.FC<LabelPrintModalProps> = ({
  isOpen,
  onClose,
  preSelectedProduct,
}) => {
  const { products, settings, updateSettings } = useApp();

  // Load remembered settings or defaults
  const savedSettings = settings.labelSettings || DEFAULT_LABEL_SETTINGS;

  const [champs, setChamps] = useState<LabelField[]>(savedSettings.champs || ['nom', 'prix', 'code']);
  const [format, setFormat] = useState<LabelFormat>(savedSettings.format || '24_63x34');
  const [tailleTexte, setTailleTexte] = useState<LabelTextSize>(savedSettings.tailleTexte || 'NORMAL');
  const [typeCode, setTypeCode] = useState<LabelCodeType>(savedSettings.typeCode || 'QR');
  const [traitsDecoupe, setTraitsDecoupe] = useState<boolean>(
    savedSettings.traitsDecoupe !== undefined ? savedSettings.traitsDecoupe : true
  );
  const [customWidth, setCustomWidth] = useState<number>(savedSettings.customWidth || 63);
  const [customHeight, setCustomHeight] = useState<number>(savedSettings.customHeight || 34);

  // Pagination & quantities
  const [startIndex, setStartIndex] = useState<number>(1);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedPreviewProductId, setSelectedPreviewProductId] = useState<string>('');
  const [showFullSheetModal, setShowFullSheetModal] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Client QR cache for instant live preview
  const [previewQrDataUrl, setPreviewQrDataUrl] = useState<string>('');

  // Sync remembered settings when modal opens
  useEffect(() => {
    if (isOpen) {
      const active = settings.labelSettings || DEFAULT_LABEL_SETTINGS;
      setChamps(active.champs || ['nom', 'prix', 'code']);
      setFormat(active.format || '24_63x34');
      setTailleTexte(active.tailleTexte || 'NORMAL');
      setTypeCode(active.typeCode || 'QR');
      setTraitsDecoupe(active.traitsDecoupe !== undefined ? active.traitsDecoupe : true);
      setStartIndex(1);
      setStatusMessage(null);

      // Quantities
      const initialQtys: Record<string, number> = {};
      if (preSelectedProduct) {
        initialQtys[preSelectedProduct.id] = 1; // Default 1 copy from product sheet
        setSelectedPreviewProductId(preSelectedProduct.id);
      } else {
        // Pre-select first 4 products with quantity 1
        products.slice(0, 4).forEach((p) => {
          initialQtys[p.id] = 1;
        });
        if (products.length > 0) {
          setSelectedPreviewProductId(products[0].id);
        }
      }
      setQuantities(initialQtys);
    }
  }, [isOpen, preSelectedProduct, settings.labelSettings]);

  // Persist settings changes
  const saveCurrentSettings = (partial: Partial<LabelSettings>) => {
    const updated: LabelSettings = {
      champs,
      format,
      tailleTexte,
      typeCode,
      traitsDecoupe,
      customWidth,
      customHeight,
      ...partial,
    };
    updateSettings({ labelSettings: updated });
  };

  // Reset to default settings
  const handleResetDefaults = () => {
    setChamps(DEFAULT_LABEL_SETTINGS.champs);
    setFormat(DEFAULT_LABEL_SETTINGS.format);
    setTailleTexte(DEFAULT_LABEL_SETTINGS.tailleTexte);
    setTypeCode(DEFAULT_LABEL_SETTINGS.typeCode);
    setTraitsDecoupe(DEFAULT_LABEL_SETTINGS.traitsDecoupe);
    updateSettings({ labelSettings: DEFAULT_LABEL_SETTINGS });
    setStatusMessage('Réglages par défaut rétablis');
    setTimeout(() => setStatusMessage(null), 2500);
  };

  // Checkbox toggle logic: At least ONE field must remain checked
  const toggleChamp = (field: LabelField) => {
    let next = [...champs];
    if (next.includes(field)) {
      next = next.filter((f) => f !== field);
      if (next.length === 0) {
        next = ['nom']; // Automatically re-check product name
      }
    } else {
      next.push(field);
    }
    setChamps(next);
    saveCurrentSettings({ champs: next });
  };

  // Active product for live preview
  const previewProduct = useMemo(() => {
    if (preSelectedProduct) return preSelectedProduct;
    if (selectedPreviewProductId) {
      const found = products.find((p) => p.id === selectedPreviewProductId);
      if (found) return found;
    }
    // First product with qty > 0
    const firstActiveId = Object.keys(quantities).find((id) => (quantities[id] || 0) > 0);
    if (firstActiveId) {
      return products.find((p) => p.id === firstActiveId) || products[0];
    }
    return products[0] || null;
  }, [preSelectedProduct, selectedPreviewProductId, quantities, products]);

  // Generate QR Code for live preview
  useEffect(() => {
    if (!previewProduct) return;
    const textToEncode =
      previewProduct.internalCode || previewProduct.barcode || `MC-${previewProduct.id}`;

    QRCode.toDataURL(textToEncode, {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 160,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => setPreviewQrDataUrl(url))
      .catch((err) => console.error('Preview QR error:', err));
  }, [previewProduct]);

  // Check if preview product has manufacturer barcode
  const hasManufacturerBarcode = useMemo(() => {
    if (preSelectedProduct) {
      return Boolean(preSelectedProduct.barcode);
    }
    // Check if any product has barcode
    return products.some((p) => Boolean(p.barcode));
  }, [preSelectedProduct, products]);

  // If manufacturer barcode is selected but unavailable, fallback to QR
  useEffect(() => {
    if (!hasManufacturerBarcode && typeCode === 'BARCODE') {
      setTypeCode('QR');
      saveCurrentSettings({ typeCode: 'QR' });
    }
  }, [hasManufacturerBarcode, typeCode]);

  // Check if any product has an old/previous price
  const hasAnyPreviousPrice = useMemo(() => {
    if (preSelectedProduct) {
      return Boolean(
        preSelectedProduct.previousPrice && preSelectedProduct.previousPrice > preSelectedProduct.salePrice
      );
    }
    return products.some((p) => p.previousPrice && p.previousPrice > p.salePrice);
  }, [preSelectedProduct, products]);

  // Layout capacity & overflow warning check
  const capacityWarning = useMemo(() => {
    const limits: Record<LabelFormat, number> = {
      '65_38x21': 3,
      '24_63x34': 6,
      '21_70x42': 7,
      '12_105x48': 10,
      thermal_58: 5,
      custom: customHeight < 30 ? 3 : 7,
    };
    const maxCapacity = limits[format] || 6;
    if (champs.length > maxCapacity) {
      return "Trop d'informations pour ce format. L'étiquette sera serrée. Choisis un format plus grand ou décoche un élément.";
    }
    return null;
  }, [champs, format, customHeight]);

  // Format definitions
  const formatMeta: Record<
    LabelFormat,
    { label: string; dimensions: string; countPerSheet: number; cols: number; rows: number }
  > = {
    '24_63x34': {
      label: '24 étiquettes par page',
      dimensions: '63 × 34 mm',
      countPerSheet: 24,
      cols: 3,
      rows: 8,
    },
    '21_70x42': {
      label: '21 étiquettes par page',
      dimensions: '70 × 42 mm',
      countPerSheet: 21,
      cols: 3,
      rows: 7,
    },
    '12_105x48': {
      label: '12 étiquettes par page',
      dimensions: '105 × 48 mm',
      countPerSheet: 12,
      cols: 2,
      rows: 6,
    },
    '65_38x21': {
      label: '65 étiquettes par page',
      dimensions: '38 × 21 mm',
      countPerSheet: 65,
      cols: 5,
      rows: 13,
    },
    thermal_58: {
      label: 'Étiquette seule (58 mm)',
      dimensions: '58 mm rouleau thermique',
      countPerSheet: 1,
      cols: 1,
      rows: 1,
    },
    custom: {
      label: 'Une étiquette personnalisée',
      dimensions: `${customWidth} × ${customHeight} mm`,
      countPerSheet: 1,
      cols: 1,
      rows: 1,
    },
  };

  const currentFormatMeta = formatMeta[format];

  // Total labels calculation
  const totalLabels: number = Object.values(quantities).reduce<number>(
    (acc, q) => acc + (typeof q === 'number' ? q : Number(q) || 0),
    0
  );

  // Total sheets calculation (accounting for startIndex on page 1)
  const totalSheets: number = useMemo(() => {
    if (totalLabels <= 0) return 0;
    if (currentFormatMeta.countPerSheet === 1) return totalLabels;
    const skippedOnFirst = Math.max(0, startIndex - 1);
    const capacityFirst = Math.max(1, currentFormatMeta.countPerSheet - skippedOnFirst);
    if (totalLabels <= capacityFirst) return 1;
    const remaining = totalLabels - capacityFirst;
    return 1 + Math.ceil(remaining / currentFormatMeta.countPerSheet);
  }, [totalLabels, startIndex, currentFormatMeta]);

  // Quantity helpers
  const updateQuantity = (productId: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[productId] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [productId]: next };
    });
  };

  const setExactQuantity = (productId: string, qty: number) => {
    setQuantities((prev) => ({
      ...prev,
      [productId]: Math.max(0, qty),
    }));
  };

  const setAllQuantities = (type: 'one' | 'stock' | 'twelve') => {
    const updated: Record<string, number> = {};
    products.forEach((p) => {
      if (type === 'one') updated[p.id] = 1;
      else if (type === 'stock') updated[p.id] = Math.max(1, p.stock || 1);
      else if (type === 'twelve') updated[p.id] = 12;
    });
    setQuantities(updated);
  };

  // Generate server-side PDF
  const fetchPdfBlob = async (): Promise<Blob> => {
    // Collect products that have quantity > 0
    const activeProducts = products.filter((p) => (quantities[p.id] || 0) > 0);
    const productIds = activeProducts.map((p) => p.id);

    const payload = {
      productIds,
      copies: quantities,
      options: {
        champs,
        format,
        tailleTexte,
        typeCode,
        traitsDecoupe,
        startIndex,
        customDimensions: {
          width: customWidth,
          height: customHeight,
        },
      },
      products: activeProducts.map((p) => ({
        id: p.id,
        name: p.name,
        salePrice: p.salePrice,
        previousPrice: p.previousPrice,
        stock: p.stock,
        unit: p.unit,
        category: p.category,
        barcode: p.barcode,
        internalCode: p.internalCode,
        photo: p.photo || p.photos?.[0],
      })),
      settings: {
        shopName: settings.shopName,
        showLogo: settings.showLogo,
        shopCode: settings.shopCode,
      },
    };

    const res = await fetch('/api/v1/products/labels', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Erreur génération PDF (${res.status}): ${errText}`);
    }

    return await res.blob();
  };

  // Action 1: Ouvrir pour imprimer (Nouvel onglet)
  const handleOpenPrint = async () => {
    if (totalLabels <= 0) return;
    setIsGenerating(true);
    setStatusMessage('Génération du PDF sur le serveur...');
    try {
      const blob = await fetchPdfBlob();
      const pdfUrl = URL.createObjectURL(blob);
      const newTab = window.open(pdfUrl, '_blank');
      if (!newTab) {
        // Pop-up blocked: trigger direct download
        const a = document.createElement('a');
        a.href = pdfUrl;
        a.download = `etiquettes-${format}.pdf`;
        a.click();
        setStatusMessage('Le navigateur a bloqué le nouvel onglet : le fichier a été téléchargé.');
      } else {
        setStatusMessage(null);
      }
    } catch (err: any) {
      console.error(err);
      setStatusMessage('Erreur : impossible de générer le PDF.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Action 2: Télécharger le PDF
  const handleDownloadPdf = async () => {
    if (totalLabels <= 0) return;
    setIsGenerating(true);
    setStatusMessage('Création du téléchargement...');
    try {
      const blob = await fetchPdfBlob();
      const pdfUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = pdfUrl;
      a.download = `etiquettes-morocash-${format}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setStatusMessage('Téléchargement lancé avec succès.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setStatusMessage('Erreur lors du téléchargement.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Action 3: Envoyer sur WhatsApp ou Partager
  const handleWhatsAppShare = async () => {
    if (totalLabels <= 0) return;
    setIsGenerating(true);
    setStatusMessage('Préparation du partage...');
    try {
      const blob = await fetchPdfBlob();
      const file = new File([blob], `etiquettes-${settings.shopName || 'morocash'}.pdf`, {
        type: 'application/pdf',
      });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Étiquettes de prix - MoroCash',
          text: `Voici la planche de ${totalLabels} étiquettes pour ${settings.shopName}`,
        });
        setStatusMessage('Partagé avec succès.');
      } else {
        // Fallback: download PDF and open WhatsApp message
        const pdfUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = pdfUrl;
        a.download = `etiquettes-morocash.pdf`;
        a.click();

        const text = encodeURIComponent(
          `Bonjour, voici les étiquettes de prix à imprimer pour ma boutique "${settings.shopName}" (${totalLabels} étiquettes). Le fichier PDF a été généré.`
        );
        window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
        setStatusMessage('Fichier téléchargé et WhatsApp ouvert.');
      }
    } catch (err) {
      console.error(err);
      setStatusMessage('Partage annulé ou non disponible.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  // Single label preview properties
  const isTiny = format === '65_38x21';
  const hasPhotoChecked = champs.includes('photo');
  const photoUrl = previewProduct?.photo || previewProduct?.photos?.[0];
  const isPhotoExcluded = isTiny && hasPhotoChecked;
  const showPhoto = hasPhotoChecked && Boolean(photoUrl) && !isTiny;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        id="panel-print-labels-modal"
        className="bg-white rounded-3xl max-w-[760px] w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]"
      >
        {/* ================= HEADER ================= */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-[#4F46E5] flex items-center justify-center shadow-xs">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                {preSelectedProduct
                  ? `Imprimer l'étiquette : ${preSelectedProduct.name}`
                  : 'Imprimer les étiquettes'}
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                Génération PDF serveur vectorielle & haute précision
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="text-[11px] font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-200/50 transition-colors cursor-pointer"
              title="Remettre les réglages par défaut"
            >
              <RotateCcw className="w-3 h-3" />
              <span className="hidden sm:inline">Défaut</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ================= BODY: 2 COLUMNS ================= */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-100">
          {/* ================= LEFT COLUMN: SETTINGS (7 COLS) ================= */}
          <div className="md:col-span-7 p-4 sm:p-5 space-y-5 overflow-y-auto max-h-[58vh] md:max-h-[68vh]">
            {/* A. QUE VEUX-TU VOIR SUR L'ÉTIQUETTE ? */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <span>A. Que veux-tu voir sur l’étiquette ?</span>
                </label>
                <span className="text-[10px] text-slate-400 font-medium">
                  {champs.length} sélectionné{champs.length > 1 ? 's' : ''}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 bg-slate-50 p-2.5 rounded-2xl border border-slate-200/60">
                {/* 1. Nom du produit */}
                <label className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white transition-colors cursor-pointer text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={champs.includes('nom')}
                    onChange={() => toggleChamp('nom')}
                    className="w-4 h-4 rounded text-[#4F46E5] focus:ring-indigo-500 accent-[#4F46E5] cursor-pointer"
                  />
                  <span>Nom du produit</span>
                </label>

                {/* 2. Prix de vente */}
                <label className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white transition-colors cursor-pointer text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={champs.includes('prix')}
                    onChange={() => toggleChamp('prix')}
                    className="w-4 h-4 rounded text-[#4F46E5] focus:ring-indigo-500 accent-[#4F46E5] cursor-pointer"
                  />
                  <span>Prix de vente</span>
                </label>

                {/* 3. Code à scanner */}
                <label className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white transition-colors cursor-pointer text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={champs.includes('code')}
                    onChange={() => toggleChamp('code')}
                    className="w-4 h-4 rounded text-[#4F46E5] focus:ring-indigo-500 accent-[#4F46E5] cursor-pointer"
                  />
                  <span>Code à scanner</span>
                </label>

                {/* 4. Photo du produit */}
                <label className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white transition-colors cursor-pointer text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={champs.includes('photo')}
                    onChange={() => toggleChamp('photo')}
                    className="w-4 h-4 rounded text-[#4F46E5] focus:ring-indigo-500 accent-[#4F46E5] cursor-pointer"
                  />
                  <span>Photo du produit</span>
                </label>

                {/* 5. Nom de ta boutique */}
                <label className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white transition-colors cursor-pointer text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={champs.includes('boutique')}
                    onChange={() => toggleChamp('boutique')}
                    className="w-4 h-4 rounded text-[#4F46E5] focus:ring-indigo-500 accent-[#4F46E5] cursor-pointer"
                  />
                  <span>Nom boutique</span>
                </label>

                {/* 6. Logo de ta boutique */}
                <label className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white transition-colors cursor-pointer text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={champs.includes('logo')}
                    onChange={() => toggleChamp('logo')}
                    className="w-4 h-4 rounded text-[#4F46E5] focus:ring-indigo-500 accent-[#4F46E5] cursor-pointer"
                  />
                  <span>Logo boutique</span>
                </label>

                {/* 7. Quantité en stock */}
                <label className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white transition-colors cursor-pointer text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={champs.includes('stock')}
                    onChange={() => toggleChamp('stock')}
                    className="w-4 h-4 rounded text-[#4F46E5] focus:ring-indigo-500 accent-[#4F46E5] cursor-pointer"
                  />
                  <span>Quantité en stock</span>
                </label>

                {/* 8. Unité */}
                <label className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white transition-colors cursor-pointer text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={champs.includes('unite')}
                    onChange={() => toggleChamp('unite')}
                    className="w-4 h-4 rounded text-[#4F46E5] focus:ring-indigo-500 accent-[#4F46E5] cursor-pointer"
                  />
                  <span>Unité (pièce, kg…)</span>
                </label>

                {/* 9. Catégorie */}
                <label className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white transition-colors cursor-pointer text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={champs.includes('categorie')}
                    onChange={() => toggleChamp('categorie')}
                    className="w-4 h-4 rounded text-[#4F46E5] focus:ring-indigo-500 accent-[#4F46E5] cursor-pointer"
                  />
                  <span>Catégorie</span>
                </label>

                {/* 10. Code écrit en chiffres */}
                <label className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white transition-colors cursor-pointer text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={champs.includes('codeChiffres')}
                    onChange={() => toggleChamp('codeChiffres')}
                    className="w-4 h-4 rounded text-[#4F46E5] focus:ring-indigo-500 accent-[#4F46E5] cursor-pointer"
                  />
                  <span>Code sous l'image</span>
                </label>

                {/* 11. Date d'impression */}
                <label className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white transition-colors cursor-pointer text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={champs.includes('dateImpression')}
                    onChange={() => toggleChamp('dateImpression')}
                    className="w-4 h-4 rounded text-[#4F46E5] focus:ring-indigo-500 accent-[#4F46E5] cursor-pointer"
                  />
                  <span>Date d’impression</span>
                </label>

                {/* 12. Prix barré (ancien prix) */}
                {hasAnyPreviousPrice && (
                  <label className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white transition-colors cursor-pointer text-xs font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={champs.includes('ancienPrix')}
                      onChange={() => toggleChamp('ancienPrix')}
                      className="w-4 h-4 rounded text-[#4F46E5] focus:ring-indigo-500 accent-[#4F46E5] cursor-pointer"
                    />
                    <span>Prix barré (promo)</span>
                  </label>
                )}
              </div>

              {/* Overflow warning */}
              {capacityWarning && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/80 flex items-start gap-2 text-amber-800 text-[11px] leading-relaxed">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{capacityWarning}</span>
                </div>
              )}
            </div>

            {/* B. TAILLE DU TEXTE */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
                B. Taille du texte
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['PETIT', 'NORMAL', 'GRAND'] as LabelTextSize[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTailleTexte(t);
                      saveCurrentSettings({ tailleTexte: t });
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      tailleTexte === t
                        ? 'border-[#4F46E5] bg-indigo-50/50 text-[#4F46E5] shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {t === 'PETIT' ? 'Petit' : t === 'NORMAL' ? 'Normal' : 'Grand'}
                  </button>
                ))}
              </div>
            </div>

            {/* C. QUEL CODE IMPRIMER */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
                C. Quel code imprimer
              </label>
              <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-2xl border border-slate-200/60 text-xs">
                {/* QR Code */}
                <label className="flex items-start gap-2.5 p-1.5 rounded-xl hover:bg-white transition-colors cursor-pointer">
                  <input
                    type="radio"
                    name="codeType"
                    checked={typeCode === 'QR'}
                    onChange={() => {
                      setTypeCode('QR');
                      saveCurrentSettings({ typeCode: 'QR' });
                    }}
                    className="w-4 h-4 mt-0.5 text-[#4F46E5] focus:ring-indigo-500 accent-[#4F46E5]"
                  />
                  <div>
                    <span className="font-bold text-slate-800">Le code MoroCash (QR)</span>
                    <span className="text-[10px] text-emerald-600 font-semibold ml-1.5 bg-emerald-50 px-1.5 py-0.5 rounded">
                      recommandé
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Se lit facilement, même froissé, plié ou légèrement sali
                    </p>
                  </div>
                </label>

                {/* Fabricant (Code-barres) */}
                <label
                  className={`flex items-start gap-2.5 p-1.5 rounded-xl transition-colors ${
                    hasManufacturerBarcode
                      ? 'hover:bg-white cursor-pointer'
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <input
                    type="radio"
                    name="codeType"
                    disabled={!hasManufacturerBarcode}
                    checked={typeCode === 'BARCODE'}
                    onChange={() => {
                      if (hasManufacturerBarcode) {
                        setTypeCode('BARCODE');
                        saveCurrentSettings({ typeCode: 'BARCODE' });
                      }
                    }}
                    className="w-4 h-4 mt-0.5 text-[#4F46E5] focus:ring-indigo-500 accent-[#4F46E5]"
                  />
                  <div>
                    <span className="font-bold text-slate-800">Le code du fabricant (code-barres)</span>
                    {!hasManufacturerBarcode && (
                      <span className="text-[10px] text-slate-400 block mt-0.5 italic">
                        Ce produit n'a pas de code du fabricant
                      </span>
                    )}
                  </div>
                </label>

                {/* Les deux */}
                <label
                  className={`flex items-start gap-2.5 p-1.5 rounded-xl transition-colors ${
                    hasManufacturerBarcode
                      ? 'hover:bg-white cursor-pointer'
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <input
                    type="radio"
                    name="codeType"
                    disabled={!hasManufacturerBarcode}
                    checked={typeCode === 'BOTH'}
                    onChange={() => {
                      if (hasManufacturerBarcode) {
                        setTypeCode('BOTH');
                        saveCurrentSettings({ typeCode: 'BOTH' });
                      }
                    }}
                    className="w-4 h-4 mt-0.5 text-[#4F46E5] focus:ring-indigo-500 accent-[#4F46E5]"
                  />
                  <div>
                    <span className="font-bold text-slate-800">Les deux (QR + code-barres)</span>
                  </div>
                </label>
              </div>
            </div>

            {/* D. FORMAT DE LA PLANCHE */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
                D. Format de la planche
              </label>
              <div className="space-y-1.5">
                {[
                  { id: '24_63x34', title: '24 étiquettes par page', dim: '63 × 34 mm', badge: 'Le plus courant' },
                  { id: '21_70x42', title: '21 étiquettes par page', dim: '70 × 42 mm' },
                  { id: '12_105x48', title: '12 étiquettes par page', dim: '105 × 48 mm', desc: 'Pour beaucoup d’informations' },
                  { id: '65_38x21', title: '65 étiquettes par page', dim: '38 × 21 mm', desc: 'Petits articles, code seul' },
                  { id: 'thermal_58', title: 'Ticket thermique 58 mm', dim: 'Une étiquette par ticket (Bluetooth/ESC-POS)' },
                  { id: 'custom', title: 'Une étiquette par page personnalisée', dim: 'Largeur et hauteur au choix' },
                ].map((fmt) => (
                  <label
                    key={fmt.id}
                    className={`flex items-start justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                      format === fmt.id
                        ? 'border-[#4F46E5] bg-indigo-50/40 text-slate-900 shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="radio"
                        name="labelFormat"
                        checked={format === fmt.id}
                        onChange={() => {
                          setFormat(fmt.id as LabelFormat);
                          saveCurrentSettings({ format: fmt.id as LabelFormat });
                        }}
                        className="w-4 h-4 mt-0.5 text-[#4F46E5] focus:ring-indigo-500 accent-[#4F46E5]"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{fmt.title}</span>
                          {fmt.badge && (
                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded">
                              {fmt.badge}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500">{fmt.dim}</span>
                        {fmt.desc && (
                          <span className="text-[10px] text-slate-400 block mt-0.5">{fmt.desc}</span>
                        )}
                      </div>
                    </div>
                  </label>
                ))}

                {/* Custom dimensions inputs if custom */}
                {format === 'custom' && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Largeur (mm)
                      </label>
                      <input
                        type="number"
                        min="20"
                        max="210"
                        value={customWidth}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setCustomWidth(val);
                          saveCurrentSettings({ customWidth: val });
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Hauteur (mm)
                      </label>
                      <input
                        type="number"
                        min="15"
                        max="297"
                        value={customHeight}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setCustomHeight(val);
                          saveCurrentSettings({ customHeight: val });
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Printing guidance notice */}
              <div className="p-2.5 rounded-xl bg-slate-100/70 border border-slate-200/80 text-[11px] text-slate-600 leading-snug">
                <strong>Papier A4 standard :</strong> Imprime sans mise à l’échelle. Dans la
                fenêtre d’impression, mets l’échelle sur <strong>100 %</strong> (pas sur "Ajuster à
                la page").
              </div>

              {/* Trait de découpe option */}
              <label className="flex items-center gap-2 pt-1 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={traitsDecoupe}
                  onChange={(e) => {
                    setTraitsDecoupe(e.target.checked);
                    saveCurrentSettings({ traitsDecoupe: e.target.checked });
                  }}
                  className="w-4 h-4 rounded text-[#4F46E5] focus:ring-indigo-500 accent-[#4F46E5]"
                />
                <span>Afficher les traits de découpe (pointillés gris)</span>
              </label>
            </div>

            {/* E. COMBIEN D'EXEMPLAIRES */}
            <div className="space-y-2">
              <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                <span>E. Combien d’exemplaires</span>
                <span className="text-[#4F46E5] font-black">
                  {totalLabels} étiquette{totalLabels > 1 ? 's' : ''} · {totalSheets} planche
                  {totalSheets > 1 ? 's' : ''}
                </span>
              </label>

              {/* Single product mode */}
              {preSelectedProduct ? (
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">
                      Nombre d’étiquettes pour cet article :
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateQuantity(preSelectedProduct.id, -1)}
                      className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 font-bold hover:bg-slate-100 transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={quantities[preSelectedProduct.id] || 1}
                      onChange={(e) =>
                        setExactQuantity(preSelectedProduct.id, parseInt(e.target.value, 10) || 1)
                      }
                      className="w-14 text-center font-black text-sm bg-white border border-slate-200 rounded-xl py-1"
                    />
                    <button
                      type="button"
                      onClick={() => updateQuantity(preSelectedProduct.id, 1)}
                      className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 font-bold hover:bg-slate-100 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                /* Multi product list mode */
                <div className="space-y-2">
                  {/* Quick buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setAllQuantities('one')}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                    >
                      1 par produit
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllQuantities('stock')}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                    >
                      Autant que le stock
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllQuantities('twelve')}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                    >
                      Tout mettre à 12
                    </button>
                  </div>

                  {/* Product table list */}
                  <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100 bg-white">
                    {products.map((p) => {
                      const qty = quantities[p.id] || 0;
                      return (
                        <div
                          key={p.id}
                          className="px-3 py-2 flex items-center justify-between hover:bg-slate-50 text-xs"
                        >
                          <div
                            className="flex-1 pr-2 truncate cursor-pointer"
                            onClick={() => setSelectedPreviewProductId(p.id)}
                          >
                            <p className="font-bold text-slate-900 truncate">{p.name}</p>
                            <p className="text-[10px] text-slate-400">
                              {formatMoney(p.salePrice)} F · Stock: {p.stock}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => updateQuantity(p.id, -1)}
                              className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-200"
                            >
                              -
                            </button>
                            <span className="w-7 text-center font-bold font-mono">{qty}</span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(p.id, 1)}
                              className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-200"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* F. COMMENCER À L'ÉTIQUETTE N° */}
            {currentFormatMeta.countPerSheet > 1 && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
                    F. Commencer à l'étiquette n°
                  </label>
                  <span className="text-[11px] font-bold text-slate-600">
                    {startIndex > 1
                      ? countLabel(startIndex - 1, 'case sautée', 'cases sautées')
                      : 'Planche neuve'}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max={currentFormatMeta.countPerSheet}
                    value={startIndex}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 1;
                      setStartIndex(Math.min(currentFormatMeta.countPerSheet, Math.max(1, val)));
                    }}
                    className="w-20 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-center font-bold text-xs"
                  />
                  <span className="text-[11px] text-slate-500 leading-tight">
                    Pratique pour réutiliser une feuille d’étiquettes déjà entamée.
                  </span>
                </div>

                {/* Mini schema diagram of skipped positions */}
                <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <div
                    className="grid gap-1 max-w-[190px] mx-auto bg-white p-1.5 rounded-lg border border-slate-200"
                    style={{
                      gridTemplateColumns: `repeat(${currentFormatMeta.cols}, minmax(0, 1fr))`,
                    }}
                  >
                    {Array.from({ length: Math.min(24, currentFormatMeta.countPerSheet) }).map(
                      (_, idx) => {
                        const cellNum = idx + 1;
                        const isSkipped = cellNum < startIndex;
                        const isFirstPrinted = cellNum === startIndex;
                        return (
                          <div
                            key={idx}
                            onClick={() => setStartIndex(cellNum)}
                            title={`Position ${cellNum}`}
                            className={`h-4 rounded-[3px] flex items-center justify-center text-[8px] font-mono cursor-pointer transition-all ${
                              isSkipped
                                ? 'bg-slate-200 text-slate-400 line-through'
                                : isFirstPrinted
                                ? 'bg-[#4F46E5] text-white font-bold ring-1 ring-indigo-400'
                                : 'bg-indigo-50/70 text-indigo-700 border border-indigo-200/50'
                            }`}
                          >
                            {cellNum}
                          </div>
                        );
                      }
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-3 text-[9px] text-slate-400 mt-1.5">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded bg-slate-200 inline-block"></span> Sautée
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded bg-[#4F46E5] inline-block"></span> 1ère
                      imprimée
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ================= RIGHT COLUMN: LIVE PREVIEW (5 COLS) ================= */}
          <div className="md:col-span-5 p-4 sm:p-5 flex flex-col justify-between bg-slate-50/50">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
                    Aperçu en direct
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowFullSheetModal(true)}
                  className="text-[11px] font-bold text-[#4F46E5] hover:underline flex items-center gap-1"
                >
                  <Layers className="w-3 h-3" />
                  <span>Planche complète</span>
                </button>
              </div>

              {/* Notice if multiple products */}
              {!preSelectedProduct && products.length > 1 && (
                <div className="text-[10px] text-slate-400 flex items-center gap-1">
                  <span>Article montré :</span>
                  <span className="font-bold text-slate-700 truncate max-w-[130px]">
                    {previewProduct?.name}
                  </span>
                </div>
              )}

              {/* Photo excluded warning for small format */}
              {isPhotoExcluded && (
                <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-[10px] text-amber-700 font-medium">
                  Photo trop grande pour ce format (ignorée)
                </div>
              )}

              {/* THE LIVE PREVIEW LABEL CONTAINER (Exact mathematical proportions) */}
              <div className="w-full flex items-center justify-center py-2">
                <div
                  className={`w-full max-w-[270px] bg-white rounded-lg transition-all text-black relative flex flex-col justify-between overflow-hidden shadow-sm ${
                    traitsDecoupe
                      ? 'border border-dashed border-slate-300'
                      : 'border border-slate-200'
                  }`}
                  style={{
                    aspectRatio:
                      format === '65_38x21'
                        ? '38 / 21'
                        : format === '21_70x42'
                        ? '70 / 42'
                        : format === '12_105x48'
                        ? '105 / 48'
                        : format === 'thermal_58'
                        ? '58 / 40'
                        : format === 'custom'
                        ? `${customWidth} / ${customHeight}`
                        : '63 / 34',
                    padding: '8px',
                  }}
                >
                  {/* LAYOUT WITH PHOTO (3 columns) */}
                  {showPhoto ? (
                    <div className="flex items-center justify-between w-full h-full gap-2">
                      {/* Photo on left */}
                      <div className="w-14 h-14 rounded bg-slate-100 shrink-0 overflow-hidden border border-slate-200 flex items-center justify-center">
                        <img
                          src={photoUrl}
                          alt={previewProduct?.name}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Name & price center */}
                      <div className="flex-1 flex flex-col justify-between h-full min-w-0 pr-1">
                        <div>
                          {champs.includes('boutique') && settings.shopName && (
                            <p className="text-[7px] text-slate-500 truncate leading-tight">
                              {settings.shopName}
                            </p>
                          )}
                          {champs.includes('nom') && (
                            <p
                              className={`font-bold text-black leading-tight line-clamp-2 ${
                                tailleTexte === 'PETIT'
                                  ? 'text-[8.5px]'
                                  : tailleTexte === 'GRAND'
                                  ? 'text-[11px]'
                                  : 'text-[9.5px]'
                              }`}
                            >
                              {previewProduct?.name}
                            </p>
                          )}
                          {champs.includes('categorie') && previewProduct?.category && (
                            <p className="text-[7px] text-slate-400 truncate">
                              {previewProduct.category}
                            </p>
                          )}
                        </div>

                        <div>
                          {champs.includes('ancienPrix') &&
                            previewProduct?.previousPrice &&
                            previewProduct.previousPrice > previewProduct.salePrice && (
                              <p className="text-[8px] text-slate-400 line-through leading-none">
                                {formatMoney(previewProduct.previousPrice)} F
                              </p>
                            )}
                          {champs.includes('prix') && (
                            <p
                              className={`font-black text-black tracking-tight leading-none ${
                                tailleTexte === 'PETIT'
                                  ? 'text-[12px]'
                                  : tailleTexte === 'GRAND'
                                  ? 'text-[16px]'
                                  : 'text-[14px]'
                              }`}
                            >
                              {formatMoney(previewProduct?.salePrice || 0)} F
                            </p>
                          )}
                          {(champs.includes('stock') || champs.includes('unite')) && (
                            <p className="text-[7.5px] text-slate-500 mt-0.5 truncate">
                              {champs.includes('stock') ? `Stk: ${previewProduct?.stock}` : ''}
                              {champs.includes('stock') && champs.includes('unite') ? ' · ' : ''}
                              {champs.includes('unite') ? previewProduct?.unit : ''}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Code on right */}
                      {champs.includes('code') && (
                        <div className="shrink-0 flex flex-col items-center justify-center">
                          {previewQrDataUrl ? (
                            <img
                              src={previewQrDataUrl}
                              alt="QR"
                              className="w-12 h-12 object-contain"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-slate-100 rounded flex items-center justify-center text-[7px]">
                              QR
                            </div>
                          )}
                          {champs.includes('codeChiffres') && (
                            <span className="font-mono text-[6.5px] font-bold tracking-widest text-slate-700 block mt-0.5">
                              {previewProduct?.internalCode || previewProduct?.barcode || ''}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* LAYOUT WITHOUT PHOTO (Standard: Top 2-line name, bottom: price left, code right) */
                    <div className="flex flex-col justify-between w-full h-full">
                      {/* Top: Shop & Name */}
                      <div>
                        <div className="flex items-center justify-between text-[7px] text-slate-500 mb-0.5">
                          {champs.includes('boutique') && (
                            <span className="truncate max-w-[130px] font-semibold">
                              {settings.shopName}
                            </span>
                          )}
                          {champs.includes('dateImpression') && (
                            <span className="text-slate-400">
                              {new Date().toLocaleDateString('fr-FR', {
                                day: '2-digit',
                                month: '2-digit',
                              })}
                            </span>
                          )}
                        </div>

                        {champs.includes('nom') && (
                          <p
                            className={`font-bold text-black leading-snug line-clamp-2 ${
                              tailleTexte === 'PETIT'
                                ? 'text-[9px]'
                                : tailleTexte === 'GRAND'
                                ? 'text-[12px]'
                                : 'text-[10.5px]'
                            }`}
                          >
                            {previewProduct?.name}
                          </p>
                        )}
                      </div>

                      {/* Bottom row: Price left, Code right */}
                      <div className="flex items-end justify-between gap-1 pt-1">
                        <div className="flex-1 pr-1">
                          {champs.includes('ancienPrix') &&
                            previewProduct?.previousPrice &&
                            previewProduct.previousPrice > previewProduct.salePrice && (
                              <span className="text-[8px] text-slate-400 line-through block leading-none mb-0.5">
                                {formatMoney(previewProduct.previousPrice)} F
                              </span>
                            )}
                          {champs.includes('prix') && (
                            <span
                              className={`font-black text-black tracking-tight leading-none block ${
                                tailleTexte === 'PETIT'
                                  ? 'text-[13px]'
                                  : tailleTexte === 'GRAND'
                                  ? 'text-[17px]'
                                  : 'text-[15px]'
                              }`}
                            >
                              {formatMoney(previewProduct?.salePrice || 0)} F
                            </span>
                          )}

                          <div className="flex items-center gap-1 text-[7.5px] text-slate-500 mt-0.5 truncate">
                            {champs.includes('categorie') && previewProduct?.category && (
                              <span>{previewProduct.category}</span>
                            )}
                            {champs.includes('stock') && (
                              <span>Stk: {previewProduct?.stock}</span>
                            )}
                            {champs.includes('unite') && previewProduct?.unit && (
                              <span>{previewProduct.unit}</span>
                            )}
                          </div>
                        </div>

                        {/* Right: Code */}
                        {champs.includes('code') && (
                          <div className="shrink-0 flex flex-col items-center justify-end">
                            {typeCode === 'BARCODE' && previewProduct?.barcode ? (
                              <div className="flex flex-col items-center">
                                <div className="h-6 w-20 bg-slate-900 rounded-[2px] flex items-center justify-center text-[7px] text-white font-mono">
                                  ||| || |||| ||
                                </div>
                                {champs.includes('codeChiffres') && (
                                  <span className="font-mono text-[7px] tracking-wider text-black block mt-0.5">
                                    {previewProduct.barcode}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col items-center">
                                {previewQrDataUrl ? (
                                  <img
                                    src={previewQrDataUrl}
                                    alt="QR"
                                    className="w-11 h-11 object-contain"
                                  />
                                ) : (
                                  <div className="w-11 h-11 bg-slate-100 rounded flex items-center justify-center text-[7px]">
                                    QR
                                  </div>
                                )}
                                {champs.includes('codeChiffres') && (
                                  <span className="font-mono text-[6.5px] tracking-widest text-slate-700 block mt-0.5">
                                    {previewProduct?.internalCode || previewProduct?.barcode || ''}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-center">
                <span className="text-[11px] font-bold text-slate-500">
                  {currentFormatMeta.dimensions} · {currentFormatMeta.label}
                </span>
              </div>
            </div>

            {/* Mobile / WhatsApp info banner */}
            <div className="p-3 rounded-2xl bg-indigo-50/60 border border-indigo-100 flex items-center justify-between gap-2 mt-4">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-[#4F46E5] shrink-0" />
                <span className="text-[11px] text-slate-700 font-medium">
                  Imprime depuis ton téléphone ou partage sur WhatsApp
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ================= STATUS / ERROR BANNER ================= */}
        {statusMessage && (
          <div className="px-5 py-2 bg-indigo-600 text-white text-xs font-semibold flex items-center justify-between">
            <span>{statusMessage}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-white/80 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ================= FOOTER ACTIONS ================= */}
        <div className="p-3.5 sm:p-4 px-5 border-t border-slate-100 bg-white flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer transition-colors"
          >
            Annuler
          </button>

          <div className="flex items-center gap-2 flex-wrap ml-auto">
            {/* WhatsApp Share button */}
            <button
              type="button"
              id="btn-share-whatsapp-labels"
              disabled={totalLabels === 0 || isGenerating}
              onClick={handleWhatsAppShare}
              className="py-2.5 px-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              title="Envoyer le PDF sur WhatsApp"
            >
              <Share2 className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">WhatsApp</span>
            </button>

            {/* Download PDF button */}
            <button
              type="button"
              id="btn-download-labels-pdf"
              disabled={totalLabels === 0 || isGenerating}
              onClick={handleDownloadPdf}
              className="py-2.5 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Télécharger le PDF</span>
            </button>

            {/* Principal Action: Ouvrir pour imprimer */}
            <button
              type="button"
              id="btn-open-to-print-labels"
              disabled={totalLabels === 0 || isGenerating}
              onClick={handleOpenPrint}
              className="py-2.5 px-5 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 active:scale-98 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isGenerating ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
              <span>Ouvrir pour imprimer</span>
            </button>
          </div>
        </div>
      </div>

      {/* ================= FULL SHEET MINIATURE MODAL ================= */}
      {showFullSheetModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Aperçu de la planche entière (Page 1)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Format {currentFormatMeta.dimensions} · {currentFormatMeta.countPerSheet} étiquettes
                  par page
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowFullSheetModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Miniature A4 Sheet representation */}
            <div className="p-3 bg-slate-100 rounded-2xl flex items-center justify-center">
              <div
                className="bg-white shadow-md rounded p-2 grid gap-1 border border-slate-300"
                style={{
                  width: '240px',
                  aspectRatio: '210 / 297',
                  gridTemplateColumns: `repeat(${currentFormatMeta.cols}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${currentFormatMeta.rows}, minmax(0, 1fr))`,
                }}
              >
                {Array.from({ length: currentFormatMeta.countPerSheet }).map((_, idx) => {
                  const cellNum = idx + 1;
                  const isSkipped = cellNum < startIndex;
                  return (
                    <div
                      key={idx}
                      className={`rounded-[2px] p-0.5 border flex flex-col justify-between overflow-hidden text-[5px] ${
                        isSkipped
                          ? 'bg-slate-100 border-slate-200 text-slate-300'
                          : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    >
                      <span className="truncate font-bold leading-none">
                        {isSkipped ? 'Vide' : previewProduct?.name?.slice(0, 10)}
                      </span>
                      <span className="font-mono text-[4px] leading-none">
                        {isSkipped ? '' : `${formatMoney(previewProduct?.salePrice || 0)} F`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowFullSheetModal(false)}
                className="py-2 px-4 rounded-xl bg-slate-900 text-white font-bold text-xs cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
