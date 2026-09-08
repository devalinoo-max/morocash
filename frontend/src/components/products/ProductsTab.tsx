import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Package,
  Search,
  Plus,
  AlertTriangle,
  Scissors,
  Edit2,
  Trash2,
  Printer,
  ClipboardCheck,
  Camera,
  QrCode,
  Barcode,
  ArrowRight,
} from 'lucide-react';
import { formatMoney, getTerminology } from '../../utils/formatters';
import { Product } from '../../types';
import { ProductFormModal } from './ProductFormModal';
import { LabelPrintModal } from './LabelPrintModal';
import { InventoryScanModal } from './InventoryScanModal';
import { BarcodeScannerModal } from '../pos/BarcodeScannerModal';

export const ProductsTab: React.FC = () => {
  const {
    products,
    updateProduct,
    recordStockReception,
    settings,
    showToast,
    findProductByCode,
  } = useApp();

  const terminology = getTerminology(settings.activityType);
  const isOwner = settings.role === 'OWNER';

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'SERVICES'>('ALL');

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [newProductInitialBarcode, setNewProductInitialBarcode] = useState<string | undefined>(undefined);

  // Label print modal
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedProductForPrint, setSelectedProductForPrint] = useState<Product | null>(null);

  // Inventory modal
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);

  // Search scanner modal
  const [isSearchScannerOpen, setIsSearchScannerOpen] = useState(false);

  // Quick Stock Adjustment Dialog
  const [adjustStockProduct, setAdjustStockProduct] = useState<Product | null>(null);
  const [stockAddAmount, setStockAddAmount] = useState<number>(10);

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setNewProductInitialBarcode(undefined);
    setIsFormOpen(true);
  };

  const handleOpenCreate = (prefilledBarcode?: string) => {
    setEditingProduct(null);
    setNewProductInitialBarcode(prefilledBarcode);
    setIsFormOpen(true);
  };

  const handleOpenSinglePrint = (p: Product) => {
    setSelectedProductForPrint(p);
    setIsPrintModalOpen(true);
  };

  const handleApplyStockAdjustment = async () => {
    if (!adjustStockProduct || stockAddAmount <= 0) return;
    await recordStockReception({
      lines: [
        {
          productId: adjustStockProduct.id,
          productName: adjustStockProduct.name,
          quantity: stockAddAmount,
          purchasePrice: adjustStockProduct.purchasePrice,
        },
      ],
      note: 'Entrée rapide depuis le catalogue',
    });
    setAdjustStockProduct(null);
  };

  // Filter products (supports searching by name, category, OR barcode/internal code)
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) {
        let matchesFilter = true;
        if (filterType === 'LOW_STOCK') {
          matchesFilter = !p.isService && p.stock > 0 && p.stock <= p.alertThreshold;
        } else if (filterType === 'OUT_OF_STOCK') {
          matchesFilter = !p.isService && p.stock <= 0;
        } else if (filterType === 'SERVICES') {
          matchesFilter = !!p.isService;
        }
        return matchesFilter;
      }

      const matchesName = p.name.toLowerCase().includes(q);
      const matchesCategory = !!(p.category && p.category.toLowerCase().includes(q));
      const matchesInternalCode = !!(p.internalCode && p.internalCode.toLowerCase().includes(q));
      const matchesBarcode = !!(p.barcode && p.barcode.toLowerCase().includes(q));
      const matchesCodesList = !!(
        p.productCodes && p.productCodes.some((c) => c.code.toLowerCase().includes(q))
      );

      const matchesSearch =
        matchesName ||
        matchesCategory ||
        matchesInternalCode ||
        matchesBarcode ||
        matchesCodesList;

      let matchesFilter = true;
      if (filterType === 'LOW_STOCK') {
        matchesFilter = !p.isService && p.stock > 0 && p.stock <= p.alertThreshold;
      } else if (filterType === 'OUT_OF_STOCK') {
        matchesFilter = !p.isService && p.stock <= 0;
      } else if (filterType === 'SERVICES') {
        matchesFilter = !!p.isService;
      }

      return matchesSearch && matchesFilter;
    });
  }, [products, searchQuery, filterType]);

  // When scanned from search bar
  const handleProductScannedFromSearch = (product: Product) => {
    setIsSearchScannerOpen(false);
    showToast(`Produit trouvé : ${product.name}`, 'success');
    handleOpenEdit(product);
  };

  return (
    <div id="products-tab-content" className="space-y-4 pb-24 animate-in fade-in duration-200">
      {/* Top Header with Print & Inventory actions */}
      <div className="mx-4 sm:mx-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            {terminology.catalogTitle}
          </h2>
          <p className="text-xs text-slate-500">
            {products.length} {terminology.itemPlural.toLowerCase()} dans le catalogue · Codes-barres & QR activés
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Label print button */}
          <button
            id="btn-open-label-printer"
            onClick={() => {
              setSelectedProductForPrint(null);
              setIsPrintModalOpen(true);
            }}
            className="px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            title="Imprimer une planche de 24 étiquettes A4"
          >
            <Printer className="w-4 h-4 text-indigo-600" />
            <span className="hidden sm:inline">Imprimer les étiquettes</span>
            <span className="sm:hidden">Étiquettes</span>
          </button>

          {/* Continuous inventory button */}
          <button
            id="btn-open-inventory-scan"
            onClick={() => setIsInventoryOpen(true)}
            className="px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            title="Faire un inventaire physique en scannant les rayons"
          >
            <ClipboardCheck className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">Inventaire continu</span>
            <span className="sm:hidden">Inventaire</span>
          </button>

          {/* Create Product button */}
          <button
            id="btn-add-new-product"
            onClick={() => handleOpenCreate()}
            className="px-4 py-2.5 rounded-2xl bg-[#4F46E5] hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Ajouter {terminology.itemSingular.toLowerCase()}</span>
          </button>
        </div>
      </div>

      {/* Search Bar with Camera Scanner button & Quick Filters */}
      <div className="mx-4 sm:mx-0 space-y-2.5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="input-search-catalog"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Rechercher par nom, catégorie ou code (MC-..., EAN)...`}
              className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white border border-slate-200 text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#4F46E5] transition-all shadow-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                Effacer
              </button>
            )}
          </div>

          {/* Scanner Button right next to search */}
          <button
            id="btn-scan-to-search"
            type="button"
            onClick={() => setIsSearchScannerOpen(true)}
            className="px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-all active:scale-95 shrink-0"
            title="Scanner pour rechercher"
          >
            <Camera className="w-4 h-4 text-indigo-400" />
            <span className="hidden sm:inline">Scanner</span>
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {[
            { id: 'ALL', label: 'Tous' },
            ...(terminology.stockVisible
              ? [
                  { id: 'LOW_STOCK', label: '⚠️ Stock bas' },
                  { id: 'OUT_OF_STOCK', label: '🚨 Rupture / Négatif' },
                ]
              : []),
            { id: 'SERVICES', label: '⚡ Prestations' },
          ].map((flt) => (
            <button
              key={flt.id}
              id={`filter-prod-${flt.id}`}
              onClick={() => setFilterType(flt.id as any)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                filterType === flt.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {flt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Product List */}
      <div className="mx-4 sm:mx-0 space-y-2.5">
        {filteredProducts.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-400 space-y-2">
            <Package className="w-10 h-10 mx-auto text-slate-300 stroke-[1.5]" />
            <p className="text-sm font-semibold text-slate-600">Aucun article trouvé</p>
            <p className="text-xs">Ajoute un produit ou modifie tes critères de recherche.</p>
          </div>
        ) : (
          filteredProducts.map((prod) => {
            const isLow = !prod.isService && prod.stock > 0 && prod.stock <= prod.alertThreshold;
            const isNegative = !prod.isService && prod.stock < 0;
            const isZero = !prod.isService && prod.stock === 0;

            const primaryCode =
              prod.productCodes?.find((c) => c.est_principal)?.code ||
              prod.internalCode ||
              prod.barcode;

            const isHouseCode =
              prod.productCodes?.find((c) => c.est_principal)?.origine === 'GENERE' ||
              (!prod.barcode && !!prod.internalCode);

            return (
              <div
                key={prod.id}
                id={`product-card-${prod.id}`}
                className={`p-4 rounded-3xl bg-white border transition-all shadow-xs ${
                  isNegative
                    ? 'border-rose-300 bg-rose-50/20'
                    : isLow
                    ? 'border-amber-300 bg-amber-50/20'
                    : 'border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {prod.photo ? (
                      <img
                        src={prod.photo}
                        alt={prod.name}
                        referrerPolicy="no-referrer"
                        className="w-14 h-14 rounded-2xl object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[#4F46E5] font-extrabold text-lg shrink-0">
                        {prod.isService ? <Scissors className="w-6 h-6" /> : prod.name.charAt(0)}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {prod.name}
                        </h3>
                        {prod.isService && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-purple-100 text-purple-800">
                            Prestation
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-1 text-xs">
                        <span className="font-extrabold text-[#4F46E5]">
                          {formatMoney(prod.salePrice)} F
                        </span>
                        {isOwner && prod.purchasePrice > 0 && (
                          <span className="text-slate-400 text-[11px]">
                            Achat : {formatMoney(prod.purchasePrice)}
                          </span>
                        )}
                      </div>

                      {/* Scannable Code Pill */}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {primaryCode && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[10px] font-bold border border-slate-200/60">
                            {isHouseCode ? (
                              <QrCode className="w-2.5 h-2.5 text-indigo-600" />
                            ) : (
                              <Barcode className="w-2.5 h-2.5 text-slate-600" />
                            )}
                            <span>{primaryCode}</span>
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">
                          Catégorie : {prod.category || 'Général'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Stock & Quick Actions */}
                  <div className="text-right shrink-0">
                    {!prod.isService && terminology.stockVisible && (
                      <div className="mb-2">
                        <div
                          className={`text-xs sm:text-sm font-black ${
                            isNegative
                              ? 'text-rose-600'
                              : isZero
                              ? 'text-rose-500'
                              : isLow
                              ? 'text-amber-600'
                              : 'text-slate-800'
                          }`}
                        >
                          Stock : {prod.stock} {prod.unit}
                        </div>
                        {isNegative && (
                          <span className="inline-block text-[10px] font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded-md mt-0.5">
                            Stock négatif — Saisis ton entrée !
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-1.5">
                      {/* Print single label button */}
                      <button
                        type="button"
                        onClick={() => handleOpenSinglePrint(prod)}
                        title="Imprimer l’étiquette"
                        className="p-2 rounded-xl bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-[#4F46E5] flex items-center justify-center transition-all cursor-pointer border border-slate-200/60"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </button>

                      {!prod.isService && terminology.stockVisible && (
                        <button
                          id={`btn-adjust-stock-${prod.id}`}
                          onClick={() => {
                            setAdjustStockProduct(prod);
                            setStockAddAmount(10);
                          }}
                          className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                        >
                          + Entrée
                        </button>
                      )}

                      <button
                        id={`btn-edit-prod-${prod.id}`}
                        onClick={() => handleOpenEdit(prod)}
                        className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 flex items-center justify-center transition-all cursor-pointer border border-slate-200/60"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* SHARED PRODUCT CREATION / EDIT MODAL */}
      <ProductFormModal
        isOpen={isFormOpen}
        editingProduct={editingProduct}
        initialBarcode={newProductInitialBarcode}
        onClose={() => {
          setIsFormOpen(false);
          setEditingProduct(null);
          setNewProductInitialBarcode(undefined);
        }}
      />

      {/* LABEL PRINT MODAL (24-label A4 sheet or single product) */}
      <LabelPrintModal
        isOpen={isPrintModalOpen}
        preSelectedProduct={selectedProductForPrint}
        onClose={() => {
          setIsPrintModalOpen(false);
          setSelectedProductForPrint(null);
        }}
      />

      {/* CONTINUOUS INVENTORY SCAN MODAL */}
      <InventoryScanModal
        isOpen={isInventoryOpen}
        onClose={() => setIsInventoryOpen(false)}
      />

      {/* SEARCH / LOOKUP SCANNER MODAL */}
      <BarcodeScannerModal
        isOpen={isSearchScannerOpen}
        onClose={() => setIsSearchScannerOpen(false)}
        onProductScanned={handleProductScannedFromSearch}
        onOpenQuickProductWithBarcode={(barcode) => {
          setIsSearchScannerOpen(false);
          handleOpenCreate(barcode);
        }}
      />

      {/* QUICK STOCK INFLOW MODAL */}
      {adjustStockProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full p-5 rounded-3xl shadow-2xl space-y-4">
            <h3 className="font-extrabold text-base text-slate-900">
              Entrée de stock : {adjustStockProduct.name}
            </h3>
            <p className="text-xs text-slate-500">
              Stock actuel : <strong>{adjustStockProduct.stock}</strong> {adjustStockProduct.unit}
            </p>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Quantité reçue du fournisseur :
              </label>
              <input
                id="input-stock-inflow"
                type="number"
                min="1"
                value={stockAddAmount}
                onChange={(e) => setStockAddAmount(parseInt(e.target.value, 10) || 1)}
                className="w-full px-3.5 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-900"
              />
            </div>

            <div className="flex gap-2">
              {[5, 10, 20, 50].map((qty) => (
                <button
                  key={qty}
                  onClick={() => setStockAddAmount(qty)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  +{qty}
                </button>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setAdjustStockProduct(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 font-bold text-xs text-slate-600 cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleApplyStockAdjustment}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-md cursor-pointer hover:bg-emerald-700"
              >
                Valider l’entrée
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
