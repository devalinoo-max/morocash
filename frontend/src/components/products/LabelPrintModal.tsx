import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Product, LabelFormat, LabelSettings } from '../../types';
import { countLabel } from '../../utils/plural';
import {
  X,
  Printer,
  Download,
  Share2,
  RotateCcw,
  Plus,
  Minus,
  Eye,
  Smartphone,
  Layers,
} from 'lucide-react';
import { formatMoney } from '../../utils/currency';
import { photoToJpeg } from '../../utils/catalogExport';
import {
  DEFAULT_LABEL_VARIANT,
  LABEL_PALETTES,
  LabelVariant,
  formatLabelPrice,
} from '../../utils/labelTicket';
import { LabelTicketPreview } from './LabelTicketPreview';
import QRCode from 'qrcode';

interface LabelPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  preSelectedProduct?: Product | null;
  /**
   * Produits cochés dans l'écran de sélection : la fenêtre ne travaille que
   * sur eux. Jamais tout le catalogue d'office.
   */
  productIds?: string[];
}

const DEFAULT_LABEL_SETTINGS: LabelSettings = {
  champs: ['nom', 'prix', 'code'],
  format: '24_63x34',
  tailleTexte: 'NORMAL',
  typeCode: 'QR',
  traitsDecoupe: true,
  variante: DEFAULT_LABEL_VARIANT,
};

// Dimensions du papier de chaque format, en mm (thermique : 58 × 40).
const FORMAT_MM: Record<Exclude<LabelFormat, 'custom'>, [number, number]> = {
  '24_63x34': [63, 34],
  '21_70x42': [70, 42],
  '12_105x48': [105, 48],
  '65_38x21': [38, 21],
  thermal_58: [58, 40],
};

export const LabelPrintModal: React.FC<LabelPrintModalProps> = ({
  isOpen,
  onClose,
  preSelectedProduct,
  productIds,
}) => {
  const { products: allProducts, settings, updateSettings } = useApp();
  const products = useMemo(() => {
    // Ouverte depuis la fiche d'un produit, la fenêtre n'a pas de sélection :
    // sans ce cas, le PDF d'une étiquette individuelle sortait vide.
    if (preSelectedProduct && !productIds?.length) {
      return [allProducts.find((p) => p.id === preSelectedProduct.id) ?? preSelectedProduct];
    }
    if (!productIds) return [];
    const wanted = new Set(productIds);
    return allProducts.filter((p) => wanted.has(p.id));
  }, [allProducts, productIds, preSelectedProduct]);

  // Load remembered settings or defaults
  const savedSettings = settings.labelSettings || DEFAULT_LABEL_SETTINGS;

  const [format, setFormat] = useState<LabelFormat>(savedSettings.format || '24_63x34');
  const [variante, setVariante] = useState<LabelVariant>(savedSettings.variante || DEFAULT_LABEL_VARIANT);
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
      setFormat(active.format || '24_63x34');
      setVariante(active.variante || DEFAULT_LABEL_VARIANT);
      setStartIndex(1);
      setStatusMessage(null);

      // Quantities
      const initialQtys: Record<string, number> = {};
      if (preSelectedProduct) {
        initialQtys[preSelectedProduct.id] = 1; // Default 1 copy from product sheet
        setSelectedPreviewProductId(preSelectedProduct.id);
      } else {
        // Un exemplaire de chaque produit coché, et seulement d'eux.
        products.forEach((p) => {
          initialQtys[p.id] = 1;
        });
        if (products.length > 0) {
          setSelectedPreviewProductId(products[0].id);
        }
      }
      setQuantities(initialQtys);
    }
  }, [isOpen, preSelectedProduct, productIds, settings.labelSettings]);

  // Persist settings changes
  const saveCurrentSettings = (partial: Partial<LabelSettings>) => {
    const updated: LabelSettings = {
      ...(settings.labelSettings || DEFAULT_LABEL_SETTINGS),
      format,
      variante,
      customWidth,
      customHeight,
      ...partial,
    };
    updateSettings({ labelSettings: updated });
  };

  // Reset to default settings
  const handleResetDefaults = () => {
    setFormat(DEFAULT_LABEL_SETTINGS.format);
    setVariante(DEFAULT_LABEL_VARIANT);
    updateSettings({ labelSettings: DEFAULT_LABEL_SETTINGS });
    setStatusMessage('Réglages par défaut rétablis');
    setTimeout(() => setStatusMessage(null), 2500);
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

    // Même QR que le PDF : zone de silence de 2 modules, indispensable pour
    // qu'il se lise sur le fond indigo.
    QRCode.toDataURL(textToEncode, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 240,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    })
      .then((url) => setPreviewQrDataUrl(url))
      .catch((err) => console.error('Preview QR error:', err));
  }, [previewProduct]);

  // Le prix le plus long fixe la taille du prix de toute la planche, comme
  // dans le PDF : l'aperçu montre exactement le gabarit imprimé.
  const priceChars = useMemo(
    () => Math.max(0, ...products.map((p) => formatLabelPrice(p.salePrice).length)),
    [products]
  );
  const [labelWidthMm, labelHeightMm] =
    format === 'custom' ? [customWidth || 63, customHeight || 34] : FORMAT_MM[format];

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

    // Les photos partent déjà lues, en JPEG. Le générateur tourne côté serveur
    // et ne pouvait pas les télécharger lui-même : l'adresse d'une photo est
    // relative (/api/v1/products/…/raw, protégée par la session du navigateur)
    // et le moteur PDF ne lit pas le WebP. Résultat : aucune photo imprimée.
    const photos = await Promise.all(
      activeProducts.map(async (p) => {
        const src = p.photo || p.photos?.[0];
        if (!src) return undefined;
        if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/png')) return src;
        // 200 px suffisent pour quelques centimètres d'étiquette, et gardent
        // une grosse planche sous la limite de taille des requêtes Vercel.
        return (await photoToJpeg(src, 200)) ?? src;
      })
    );

    const payload = {
      productIds,
      copies: quantities,
      options: {
        format,
        variante,
        startIndex,
        customDimensions: {
          width: customWidth,
          height: customHeight,
        },
      },
      products: activeProducts.map((p, i) => ({
        id: p.id,
        name: p.name,
        salePrice: p.salePrice,
        previousPrice: p.previousPrice,
        stock: p.stock,
        unit: p.unit,
        category: p.category,
        barcode: p.barcode,
        internalCode: p.internalCode,
        photo: photos[i],
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

  // Photo du produit montré dans l'aperçu (case vide s'il n'en a pas)
  const photoUrl = previewProduct?.photo || previewProduct?.photos?.[0];

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
            {/* A. COULEUR DE L'ÉTIQUETTE */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
                A. Couleur de l’étiquette
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'claire', title: 'Claire', desc: 'Fond blanc, contour indigo' },
                    { id: 'couleur', title: 'Pleine couleur', desc: 'Fond indigo, texte blanc' },
                  ] as { id: LabelVariant; title: string; desc: string }[]
                ).map((v) => {
                  const palette = LABEL_PALETTES[v.id];
                  const actif = variante === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={actif}
                      onClick={() => {
                        setVariante(v.id);
                        saveCurrentSettings({ variante: v.id });
                      }}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                        actif
                          ? 'border-[#4F46E5] bg-indigo-50/50 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className="w-7 h-7 rounded-md shrink-0"
                        style={{ background: palette.paper, border: `2px solid ${palette.stroke}` }}
                        aria-hidden="true"
                      />
                      <span>
                        <span className="flex items-center gap-1.5 font-bold text-slate-900">
                          {v.title}
                          {v.id === DEFAULT_LABEL_VARIANT && (
                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                              Recommandée
                            </span>
                          )}
                        </span>
                        <span className="block text-[11px] text-slate-500">{v.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Chaque étiquette porte le nom de ta boutique, la photo et le nom du produit, sa
                catégorie, son prix et un QR code à scanner.
              </p>
            </div>

            {/* B. FORMAT DE LA PLANCHE */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
                B. Format de la planche
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

            </div>

            {/* C. COMBIEN D'EXEMPLAIRES */}
            <div className="space-y-2">
              <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                <span>C. Combien d’exemplaires</span>
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
                              {formatMoney(p.salePrice)} · Stock: {p.stock}
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

            {/* D. COMMENCER À L'ÉTIQUETTE N° */}
            {currentFormatMeta.countPerSheet > 1 && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
                    D. Commencer à l'étiquette n°
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

              {/* Aperçu à l'échelle : même gabarit que le PDF imprimé */}
              <div className="w-full flex items-center justify-center py-2">
                {previewProduct ? (
                  <LabelTicketPreview
                    widthMm={labelWidthMm}
                    heightMm={labelHeightMm}
                    widthPx={
                      labelHeightMm > labelWidthMm
                        ? Math.round((220 * labelWidthMm) / labelHeightMm)
                        : 270
                    }
                    variant={variante}
                    shopName={settings.shopName?.trim() || 'Ma boutique'}
                    name={previewProduct.name}
                    category={previewProduct.category}
                    price={previewProduct.salePrice}
                    photoUrl={photoUrl}
                    qrDataUrl={previewQrDataUrl}
                    priceChars={priceChars}
                  />
                ) : null}
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
                        {isSkipped ? '' : formatMoney(previewProduct?.salePrice || 0)}
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
