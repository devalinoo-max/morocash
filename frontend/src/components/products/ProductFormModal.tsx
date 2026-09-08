import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Product } from '../../types';
import {
  X,
  ChevronDown,
  ChevronUp,
  Trash2,
  Plus,
  Image as ImageIcon,
  Camera,
  QrCode,
  Sparkles,
} from 'lucide-react';
import { MoneyInput } from '../common/UIStates';
import { ProductCodeSection } from './ProductCodeSection';
import { AddCodeModal } from './AddCodeModal';
import { ProductPhotoUploader } from './ProductPhotoUploader';
import { CategoryCombobox } from './CategoryCombobox';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductSaved?: (product: Product) => void;
  editingProduct?: Product | null;
  submitLabel?: string;
  initialBarcode?: string;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  onProductSaved,
  editingProduct,
  submitLabel,
  initialBarcode,
}) => {
  const { addProduct, updateProduct, deleteProduct, settings, showToast } = useApp();
  const isOwner = settings.role === 'OWNER';

  // Form states
  const [name, setName] = useState('');
  const [salePrice, setSalePrice] = useState<number>(0);
  const [stock, setStock] = useState<number>(10);
  const [isService, setIsService] = useState(false);

  // Photos (up to 3)
  const [photos, setPhotos] = useState<string[]>([]);

  // Collapsed advanced fields
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [alertThreshold, setAlertThreshold] = useState<number>(3);
  const [category, setCategory] = useState('Alimentation');
  const [unit, setUnit] = useState('Unité');
  const [barcode, setBarcode] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (editingProduct) {
        setName(editingProduct.name);
        setSalePrice(editingProduct.salePrice);
        setStock(editingProduct.stock);
        setIsService(!!editingProduct.isService);
        setPurchasePrice(editingProduct.purchasePrice || 0);
        setAlertThreshold(editingProduct.alertThreshold ?? 3);
        setCategory(editingProduct.category || 'Alimentation');
        setUnit(editingProduct.unit || 'Unité');
        setBarcode(editingProduct.barcode || '');
        const existingPhotos: string[] = [];
        if (editingProduct.photos && editingProduct.photos.length > 0) {
          existingPhotos.push(...editingProduct.photos);
        } else if (editingProduct.photo) {
          existingPhotos.push(editingProduct.photo);
        }
        setPhotos(existingPhotos);
        setShowAdvanced(true);
      } else {
        setName('');
        setSalePrice(0);
        setStock(10);
        setIsService(settings.activityType === 'SERVICES');
        setPurchasePrice(0);
        setAlertThreshold(3);
        setCategory('Alimentation');
        setUnit('Unité');
        setBarcode(initialBarcode || '');
        setPhotos([]);
        setShowAdvanced(false);
      }
    }
  }, [isOpen, editingProduct, initialBarcode, settings.activityType]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Donne un nom au produit', 'warning');
      return;
    }
    if (salePrice <= 0) {
      showToast('Indique un prix de vente valide', 'warning');
      return;
    }

    const primaryPhoto = photos[0] || undefined;

    if (editingProduct) {
      await updateProduct(editingProduct.id, {
        name: name.trim(),
        salePrice,
        stock: isService ? 999 : stock,
        isService,
        purchasePrice: purchasePrice || Math.round(salePrice * 0.7),
        alertThreshold,
        category: category.trim() || 'DIVERS',
        unit: unit.trim() || 'Unité',
        photo: primaryPhoto,
        photos,
        barcode: barcode.trim() || undefined,
      });
      showToast('Article mis à jour avec succès', 'success');
      if (onProductSaved) {
        onProductSaved({
          ...editingProduct,
          name: name.trim(),
          salePrice,
          stock: isService ? 999 : stock,
          isService,
          purchasePrice: purchasePrice || Math.round(salePrice * 0.7),
          alertThreshold,
          category: category.trim() || 'DIVERS',
          unit: unit.trim() || 'Unité',
          photo: primaryPhoto,
          photos,
          barcode: barcode.trim() || undefined,
        });
      }
      onClose();
    } else {
      const created = await addProduct({
        name: name.trim(),
        salePrice,
        purchasePrice: purchasePrice || Math.round(salePrice * 0.7),
        stock: isService ? 999 : stock,
        alertThreshold,
        category: category.trim() || 'Alimentation',
        unit: unit.trim() || 'Unité',
        photo: primaryPhoto,
        photos,
        isService,
        barcode: barcode.trim() || undefined,
      });
      if (!created) return;
      showToast(`Produit "${created.name}" créé avec succès`, 'success');
      if (onProductSaved) {
        onProductSaved(created);
      }
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex flex-col justify-end sm:justify-center sm:items-center sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white w-full sm:max-w-lg max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-sm">
              {editingProduct ? 'Modifier l’article' : 'Ajouter un produit'}
            </h3>
            <p className="text-[11px] text-slate-300">
              {editingProduct ? 'Modifier les détails du produit' : 'Création complète du catalogue'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 1. Nom */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Nom du produit / article *
            </label>
            <input
              id="input-product-form-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Riz Parfumé Mémé Cassé 5kg"
              className="w-full px-3.5 py-3 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
            />
          </div>

          {/* 2. Photos (3 max) with 3 entries, drag and drop, paste, reordering */}
          <div>
            <ProductPhotoUploader
              photos={photos}
              onChangePhotos={setPhotos}
              maxPhotos={3}
            />
          </div>

          {/* 3. Prix de vente */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Prix de vente (FCFA) *
            </label>
            <MoneyInput
              id="input-product-form-sale-price"
              value={salePrice}
              onChange={(val) => setSalePrice(val)}
              placeholder="0"
            />
          </div>

          {/* 4. Prestation / Service */}
          <div className="flex items-center gap-3 py-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={isService}
                onChange={(e) => setIsService(e.target.checked)}
                className="w-4 h-4 text-[#4F46E5] rounded-sm focus:ring-[#4F46E5]"
              />
              <span>C'est une prestation / service (Pas de stock physique)</span>
            </label>
          </div>

          {/* 5. Quantité en stock initiale */}
          {!isService && (
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Quantité en stock initiale
              </label>
              <input
                id="input-product-form-stock"
                type="number"
                value={stock}
                onChange={(e) => setStock(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3.5 py-3 rounded-xl border border-slate-200 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
              />
            </div>
          )}

          {/* 6. Expandable Advanced Fields (Repliés par défaut) */}
          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full py-2 text-xs font-bold text-[#4F46E5] hover:text-indigo-800 cursor-pointer"
            >
              <span>
                {showAdvanced
                  ? 'Masquer les options avancées'
                  : '+ Options avancées (Prix d’achat, Catégorie, Unité, Alerte, Code-barres)'}
              </span>
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAdvanced && (
              <div className="space-y-3 pt-2 animate-in fade-in duration-150">
                {isOwner && (
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Prix d'achat grossiste (FCFA)
                    </label>
                    <MoneyInput
                      id="input-product-form-purchase-price"
                      value={purchasePrice}
                      onChange={(val) => setPurchasePrice(val)}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Catégorie
                    </label>
                    <CategoryCombobox value={category} onChange={setCategory} />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Unité de vente
                    </label>
                    <input
                      type="text"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="Pièce, Kg, Sac, etc."
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Seuil d'alerte stock bas
                    </label>
                    <input
                      type="number"
                      value={alertThreshold}
                      onChange={(e) => setAlertThreshold(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700 block">
                        Code-barres emballage
                      </label>
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        id="input-product-barcode"
                        type="text"
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        placeholder="Ex: 6181100..."
                        className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold font-mono"
                      />
                    </div>
                  </div>
                </div>

                {!editingProduct && (
                  <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-2xl flex items-start gap-2.5 text-[11px] text-indigo-950">
                    <QrCode className="w-4 h-4 text-[#4F46E5] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Code maison automatique MoroCash</p>
                      <p className="text-indigo-800 mt-0.5">
                        Dès la création, un QR code maison unique et scannable (MC-{settings.shopCode || 'A7K2X'}-...) sera automatiquement attribué à ce produit.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* If Editing existing product: Display full ProductCodeSection */}
          {editingProduct && (
            <ProductCodeSection
              product={editingProduct}
              onRefreshProduct={(updated) => {
                setBarcode(updated.barcode || '');
              }}
            />
          )}

          {/* Actions */}
          <div className="pt-4 flex items-center justify-between gap-3 border-t border-slate-100">
            {editingProduct && (
              <button
                type="button"
                onClick={async () => {
                  // deleteProduct affiche déjà son propre toast (supprimé ou
                  // désactivé si le produit a un historique de ventes).
                  await deleteProduct(editingProduct.id);
                  onClose();
                }}
                className="p-3 text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer transition-colors"
                title="Supprimer l'article"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}

            <button
              id="btn-submit-product-form"
              type="submit"
              className="flex-1 py-3.5 px-5 rounded-2xl bg-[#4F46E5] hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all cursor-pointer text-center"
            >
              {submitLabel || (editingProduct ? 'Enregistrer les modifications' : 'Créer l’article')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
