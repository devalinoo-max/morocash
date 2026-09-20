import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Package, Search, Plus, Printer, ClipboardCheck, Camera, Tag, Download } from 'lucide-react';
import { formatMoneyCompact, getTerminology } from '../../utils/formatters';
import { countLabel } from '../../utils/plural';
import { Product } from '../../types';
import { ProductFormModal } from './ProductFormModal';
import { ProductCard } from './ProductCard';
import { LabelPrintModal } from './LabelPrintModal';
import { LabelSelectionModal } from './LabelSelectionModal';
import { CatalogExportModal } from './CatalogExportModal';
import { BulkEditBar } from './BulkEditBar';
import { InventoryScanModal } from './InventoryScanModal';
import { BarcodeScannerModal } from '../pos/BarcodeScannerModal';
import { useHardwareScanner } from '../../hooks/useHardwareScanner';
import { resolveKeyboardScan } from '../../utils/hardwareScanner';
import { playScanSuccessBeep } from '../../utils/barcodeEngine';
import { LOCKED_BTN_CLASS } from '../../utils/paywall';
import { usePageMenu } from '../../context/PageMenuContext';
import { useIncrementalList } from '../../hooks/useIncrementalList';
import { ListSentinel } from '../common/ListSentinel';

export const ProductsTab: React.FC = () => {
  const {
    products,
    recordStockReception,
    settings,
    showToast,
    isWriteLocked,
    gateWrite,
    isNewProductOpen,
    setIsNewProductOpen,
    isNewSaleOpen,
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
  // « Imprimer vos étiquettes » ouvre TOUJOURS la sélection d'abord ; l'impression ne
  // travaille ensuite que sur les produits cochés.
  const [isLabelSelectionOpen, setIsLabelSelectionOpen] = useState(false);
  const [labelProductIds, setLabelProductIds] = useState<string[]>([]);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Inventory modal
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);

  // Search scanner modal
  const [isSearchScannerOpen, setIsSearchScannerOpen] = useState(false);

  // Quick Stock Adjustment Dialog
  const [adjustStockProduct, setAdjustStockProduct] = useState<Product | null>(null);
  const [stockAddAmount, setStockAddAmount] = useState<number>(10);

  // Sélection multiple : la case reste visible sur chaque carte, c'est elle qui
  // fait apparaître la barre d'édition groupée une fois cochée.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setNewProductInitialBarcode(undefined);
    setIsFormOpen(true);
  };

  const handleOpenCreate = (prefilledBarcode?: string) => {
    setEditingProduct(null);
    setNewProductInitialBarcode(prefilledBarcode);
    setIsFormOpen(true);
    setIsNewProductOpen(true);
  };

  // Étiquettes et inventaire : deux actions de fin de mois, pas de la journée.
  // Elles vivent dans le menu « ... » de la barre haute, où elles ne coûtent
  // plus une rangée de boutons au-dessus de la liste.
  usePageMenu([
    {
      id: 'labels',
      label: 'Imprimer vos étiquettes',
      icon: Printer,
      onSelect: () => setIsLabelSelectionOpen(true),
    },
    {
      id: 'inventory',
      label: 'Inventaire continu',
      icon: ClipboardCheck,
      onSelect: () => gateWrite(() => setIsInventoryOpen(true)),
    },
  ]);

  // L'adresse /produits/nouveau ouvre le formulaire, et le formulaire met
  // l'adresse à jour : les deux ne peuvent pas diverger.
  useEffect(() => {
    if (isNewProductOpen && !isFormOpen) {
      setEditingProduct(null);
      setNewProductInitialBarcode(undefined);
      setIsFormOpen(true);
    }
  }, [isNewProductOpen, isFormOpen]);

  const handleOpenSinglePrint = (p: Product) => {
    setLabelProductIds([]);
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

  const matchesFilterType = (p: Product, filtre: typeof filterType) => {
    if (filtre === 'LOW_STOCK') return !p.isService && p.stock > 0 && p.stock <= p.alertThreshold;
    if (filtre === 'OUT_OF_STOCK') return !p.isService && p.stock <= 0;
    if (filtre === 'SERVICES') return !!p.isService;
    return true;
  };

  // Filter products (supports searching by name, category, OR barcode/internal code)
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = searchQuery.trim().toLowerCase();
      if (!matchesFilterType(p, filterType)) return false;
      if (!q) return true;

      const matchesName = p.name.toLowerCase().includes(q);
      const matchesCategory = !!(p.category && p.category.toLowerCase().includes(q));
      const matchesInternalCode = !!(p.internalCode && p.internalCode.toLowerCase().includes(q));
      const matchesBarcode = !!(p.barcode && p.barcode.toLowerCase().includes(q));
      const matchesCodesList = !!(
        p.productCodes && p.productCodes.some((c) => c.code.toLowerCase().includes(q))
      );

      return (
        matchesName || matchesCategory || matchesInternalCode || matchesBarcode || matchesCodesList
      );
    });
  }, [products, searchQuery, filterType]);

  // Affichage par tranches. Les compteurs, la valeur du stock et la sélection
  // continuent de porter sur filteredProducts en entier : seule la quantité de
  // fiches DESSINÉES est limitée.
  const {
    visibleItems: visibleProducts,
    hasMore: hasMoreProducts,
    sentinelRef: productsSentinelRef,
  } = useIncrementalList(filteredProducts);

  // Les compteurs portent sur tout le catalogue, pas sur la recherche en cours :
  // ils disent combien il y en a, pas combien la recherche en montre.
  const counts = useMemo(
    () => ({
      ALL: products.length,
      LOW_STOCK: products.filter((p) => matchesFilterType(p, 'LOW_STOCK')).length,
      OUT_OF_STOCK: products.filter((p) => matchesFilterType(p, 'OUT_OF_STOCK')).length,
      SERVICES: products.filter((p) => matchesFilterType(p, 'SERVICES')).length,
    }),
    [products]
  );

  // Valeur du stock : elle se calcule sur le prix d'achat, donc elle ne
  // s'affiche que pour qui a le droit de le voir.
  const stockValue = useMemo(
    () =>
      products.reduce(
        (total, p) => (p.isService ? total : total + Math.max(0, p.stock) * p.purchasePrice),
        0
      ),
    [products]
  );

  // When scanned from search bar
  const handleProductScannedFromSearch = (product: Product) => {
    setIsSearchScannerOpen(false);
    showToast(`Produit trouvé : ${product.name}`, 'success');
    handleOpenEdit(product);
  };

  // Douchette sur l'écran Produits : l'article scanné s'ouvre ; un code
  // inconnu ouvre la création, code déjà rempli. Une fenêtre ouverte
  // par-dessus (formulaire, inventaire, étiquettes, caisse) garde la main.
  const anyModalOpen =
    isFormOpen ||
    isNewProductOpen ||
    isPrintModalOpen ||
    isLabelSelectionOpen ||
    isExportOpen ||
    isInventoryOpen ||
    isSearchScannerOpen ||
    adjustStockProduct !== null ||
    isNewSaleOpen;
  useHardwareScanner(
    (scan) => {
      const { code, product } = resolveKeyboardScan(products, scan);
      if (product) {
        playScanSuccessBeep();
        handleProductScannedFromSearch(product);
      } else {
        showToast(`Code non reconnu (${code}) : crée le produit`, 'warning');
        handleOpenCreate(code);
      }
    },
    { enabled: !anyModalOpen }
  );

  const filtres = [
    { id: 'ALL' as const, label: `Tous (${counts.ALL})`, dot: null },
    ...(terminology.stockVisible
      ? [
          { id: 'LOW_STOCK' as const, label: `Stock bas (${counts.LOW_STOCK})`, dot: '#F59E0B' },
          { id: 'OUT_OF_STOCK' as const, label: `Rupture (${counts.OUT_OF_STOCK})`, dot: '#DC2626' },
        ]
      : []),
    { id: 'SERVICES' as const, label: `Prestations (${counts.SERVICES})`, dot: null },
  ];

  return (
    <div id="products-tab-content" className="space-y-3 pb-24 animate-in fade-in duration-200">
      {/* =====================================================================
          RECHERCHE ET FILTRES
          La carte blanche « Produits & Stocks » a disparu : son titre est déjà
          dans la barre haute, et son sous-titre répétait un réglage que le
          commerçant ne peut pas changer. Elle coûtait la moitié de l'écran
          avant le premier produit.
          ===================================================================== */}
      <div className="space-y-2.5">
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              id="input-search-catalog"
              data-scanner-input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cherche un produit, un code"
              className="w-full h-11 pl-10 pr-3 rounded-full bg-white border border-slate-200 text-[13px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4F46E5] transition-all"
            />
          </div>

          <button
            id="btn-scan-to-search"
            type="button"
            onClick={() => setIsSearchScannerOpen(true)}
            className="w-11 h-11 shrink-0 rounded-full bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center cursor-pointer transition-all active:scale-95"
            title="Scanner pour rechercher"
            aria-label="Scanner un code pour rechercher"
          >
            <Camera className="w-[18px] h-[18px] text-indigo-300" />
          </button>
        </div>

        {/* Actions du catalogue — les mêmes libellés sur téléphone et sur
            ordinateur. « Ajouter un produit » en entier : une icône ou « Ajouter »
            seul ne disait pas quoi. */}
        <div className="flex flex-wrap gap-2">
          <button
            id="btn-add-new-product"
            type="button"
            onClick={() => gateWrite(() => handleOpenCreate())}
            className={`flex-1 min-w-[170px] h-10 px-3.5 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 active:scale-[0.98] text-white text-[13px] font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer ${
              isWriteLocked ? LOCKED_BTN_CLASS : ''
            }`}
          >
            <Plus className="w-4 h-4" />
            Ajouter un produit
          </button>
          <button
            id="btn-open-labels"
            type="button"
            onClick={() => setIsLabelSelectionOpen(true)}
            className="flex-1 sm:flex-none h-10 px-3.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-[13px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Tag className="w-4 h-4 text-slate-500" />
            Imprimer vos étiquettes
          </button>
          <button
            id="btn-open-catalog-export"
            type="button"
            onClick={() => setIsExportOpen(true)}
            className="flex-1 sm:flex-none h-10 px-3.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-[13px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Télécharger votre catalogue
          </button>
        </div>

        {/* Pastilles de filtre, sans emoji : un point coloré dit l'alerte mieux
            qu'un pictogramme de messagerie. « + Ajouter » tient la droite de la
            rangée plutôt qu'une pleine largeur à lui seul. */}
        <div className="flex items-center gap-2">
          {/* La rangée défile quand les pastilles ne tiennent pas, et elle
              l'annonce par son dégradé de bord : sans lui, la dernière pastille
              se coupe net contre « + Ajouter » et se lit comme recouverte. */}
          <div className="filter-pill-row flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {filtres.map((flt) => {
              const actif = filterType === flt.id;
              return (
                <button
                  key={flt.id}
                  id={`filter-prod-${flt.id}`}
                  type="button"
                  onClick={() => setFilterType(flt.id)}
                  className={`shrink-0 h-8 px-3 rounded-full text-[11.5px] font-bold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                    actif
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {flt.dot && (
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: flt.dot }}
                      aria-hidden="true"
                    />
                  )}
                  {flt.label}
                </button>
              );
            })}
          </div>

        </div>
      </div>

      {/* =====================================================================
          LIGNE DE RÉSUMÉ — ce que l'ancien sous-titre aurait dû dire
          ===================================================================== */}
      <div className="h-9 px-3 rounded-xl bg-[#F8FAFC] border border-slate-200/80 flex items-center gap-2 text-[12px] min-w-0">
        <span className="font-bold text-slate-800 shrink-0">
          {countLabel(counts.ALL, settings.activityType === 'SERVICES' ? 'prestation' : 'produit')}
        </span>
        {terminology.stockVisible && counts.LOW_STOCK > 0 && (
          <>
            <span className="text-slate-300 shrink-0">·</span>
            <span className="font-bold shrink-0" style={{ color: '#F59E0B' }}>
              {counts.LOW_STOCK} en stock bas
            </span>
          </>
        )}
        {terminology.stockVisible && isOwner && stockValue > 0 && (
          <>
            <span className="text-slate-300 shrink-0">·</span>
            <span className="text-slate-600 tabular-nums truncate">
              valeur {formatMoneyCompact(stockValue)}
            </span>
          </>
        )}
      </div>

      {/* Product List — une colonne sur téléphone (aucune grille à colonnes
          fixes sous 400 px), deux ou trois dès qu'il y a la place. */}
      <div className="space-y-2 md:space-y-0 md:grid md:grid-cols-2 xl:grid-cols-3 md:gap-2.5">
        {filteredProducts.length === 0 ? (
          <div className="md:col-span-full p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-400 space-y-2">
            <Package className="w-10 h-10 mx-auto text-slate-300 stroke-[1.5]" />
            <p className="text-sm font-semibold text-slate-600">Aucun article trouvé</p>
            <p className="text-xs">Ajoute un produit ou modifie tes critères de recherche.</p>
          </div>
        ) : (
          visibleProducts.map((prod) => (
            <ProductCard
              key={prod.id}
              product={prod}
              selected={selectedIds.includes(prod.id)}
              onToggleSelect={toggleSelected}
              onOpen={handleOpenEdit}
              onStockEntry={(p) =>
                gateWrite(() => {
                  setAdjustStockProduct(p);
                  setStockAddAmount(10);
                })
              }
              onShowCode={handleOpenSinglePrint}
              showPurchasePrice={isOwner}
              stockVisible={terminology.stockVisible}
              locked={isWriteLocked}
            />
          ))
        )}
      </div>

      {/* Le catalogue s'affiche par tranches : sur un téléphone d'entrée de
          gamme, dessiner 900 fiches d'un coup fige l'écran plusieurs secondes. */}
      <ListSentinel
        sentinelRef={productsSentinelRef}
        hasMore={hasMoreProducts}
        shown={visibleProducts.length}
        total={filteredProducts.length}
        label="articles"
      />

      <BulkEditBar selectedIds={selectedIds} onDone={() => setSelectedIds([])} />

      {/* SHARED PRODUCT CREATION / EDIT MODAL */}
      <ProductFormModal
        isOpen={isFormOpen}
        editingProduct={editingProduct}
        initialBarcode={newProductInitialBarcode}
        onClose={() => {
          setIsFormOpen(false);
          setEditingProduct(null);
          setNewProductInitialBarcode(undefined);
          setIsNewProductOpen(false);
        }}
      />

      {/* LABEL PRINT MODAL (24-label A4 sheet or single product) */}
      <LabelSelectionModal
        isOpen={isLabelSelectionOpen}
        onClose={() => setIsLabelSelectionOpen(false)}
        onConfirm={(ids) => {
          setIsLabelSelectionOpen(false);
          setSelectedProductForPrint(null);
          setLabelProductIds(ids);
          setIsPrintModalOpen(true);
        }}
      />

      <CatalogExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />

      <LabelPrintModal
        isOpen={isPrintModalOpen}
        preSelectedProduct={selectedProductForPrint}
        productIds={labelProductIds}
        onClose={() => {
          setIsPrintModalOpen(false);
          setSelectedProductForPrint(null);
        }}
      />

      {/* CONTINUOUS INVENTORY SCAN MODAL */}
      <InventoryScanModal isOpen={isInventoryOpen} onClose={() => setIsInventoryOpen(false)} />

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
