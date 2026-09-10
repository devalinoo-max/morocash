import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Product } from '../../types';
import { Check, ChevronDown, ChevronUp, Copy, QrCode, Trash2, X } from 'lucide-react';
import { MoneyInput } from '../common/UIStates';
import { ProductCodeSection } from './ProductCodeSection';
import { ProductPhotoUploader } from './ProductPhotoUploader';
import { CategorySelect } from './CategorySelect';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductSaved?: (product: Product) => void;
  editingProduct?: Product | null;
  submitLabel?: string;
  initialBarcode?: string;
}

/** Valeurs du formulaire, dans l'ordre où le commerçant les rencontre. */
interface FormValues {
  name: string;
  salePrice: number;
  stock: number;
  isService: boolean;
  photos: string[];
  purchasePrice: number;
  category: string;
  alertThreshold: number;
  unit: string;
  barcode: string;
}

const EMPTY: FormValues = {
  name: '',
  salePrice: 0,
  stock: 0,
  isService: false,
  photos: [],
  purchasePrice: 0,
  category: '',
  alertThreshold: 3,
  unit: 'Unité',
  barcode: '',
};

function valuesOf(product: Product): FormValues {
  const photos =
    product.photos && product.photos.length > 0
      ? [...product.photos]
      : product.photo
        ? [product.photo]
        : [];
  return {
    name: product.name,
    salePrice: product.salePrice,
    stock: product.stock,
    isService: !!product.isService,
    photos,
    purchasePrice: product.purchasePrice || 0,
    category: product.category === 'Sans catégorie' ? '' : product.category || '',
    alertThreshold: product.alertThreshold ?? 3,
    unit: product.unit || 'Unité',
    barcode: product.barcode || '',
  };
}

/**
 * Formulaire produit.
 *
 * Trois champs visibles, pas un de plus : le nom, le prix de vente, et combien
 * il en a. Tout le reste (prix d'achat, catégorie, seuil, unité, code-barres)
 * vit sous « Plus de détails », replié — un commerçant qui ajoute son premier
 * produit ne doit pas avoir à trancher huit questions avant de pouvoir vendre.
 *
 * En modification, il n'y a pas de bouton « Enregistrer » : chaque champ part
 * dès qu'on le quitte, et affiche « Enregistré ». Un bouton global, c'est un
 * bouton qu'on oublie de cliquer, donc des modifications perdues.
 */
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

  const [values, setValues] = useState<FormValues>(EMPTY);
  const [showDetails, setShowDetails] = useState(false);
  // Produit en cours de modification. Passe à null quand on clique « Créer un
  // produit similaire » : le formulaire garde les valeurs mais repart en création.
  const [target, setTarget] = useState<Product | null>(null);
  // Champs dont la sauvegarde automatique vient d'aboutir (badge « Enregistré »).
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});
  const nameInputRef = useRef<HTMLInputElement>(null);
  // Dernière valeur transmise au serveur, par champ : sert à ne rien renvoyer
  // quand on traverse un champ sans y toucher.
  const lastSaved = useRef<FormValues>(EMPTY);

  useEffect(() => {
    if (!isOpen) return;
    if (editingProduct) {
      const next = valuesOf(editingProduct);
      setValues(next);
      lastSaved.current = next;
      setTarget(editingProduct);
      setShowDetails(false);
    } else {
      const next: FormValues = {
        ...EMPTY,
        isService: settings.activityType === 'SERVICES',
        barcode: initialBarcode || '',
      };
      setValues(next);
      lastSaved.current = next;
      setTarget(null);
      setShowDetails(false);
    }
    setSavedFields({});
  }, [isOpen, editingProduct, initialBarcode, settings.activityType]);

  if (!isOpen) return null;

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const flashSaved = (field: string) => {
    setSavedFields((prev) => ({ ...prev, [field]: true }));
    setTimeout(() => setSavedFields((prev) => ({ ...prev, [field]: false })), 2000);
  };

  /**
   * Sauvegarde automatique d'un champ, à la sortie du champ. Ne fait rien en
   * création (il n'y a pas encore de produit à modifier) ni si la valeur n'a
   * pas bougé. L'appel ne bloque pas : updateProduct met l'écran à jour tout
   * de suite et envoie en arrière-plan.
   */
  const autoSave = (field: keyof FormValues, override?: Partial<FormValues>) => {
    if (!target) return;
    const next = { ...values, ...override };
    if (next[field] === lastSaved.current[field]) return;
    if (field === 'name' && !String(next.name).trim()) return;

    lastSaved.current = { ...lastSaved.current, [field]: next[field] };

    const patch: Partial<Product> = {};
    switch (field) {
      case 'name':
        patch.name = String(next.name).trim();
        break;
      case 'salePrice':
        patch.salePrice = next.salePrice;
        break;
      case 'stock':
        patch.stock = next.isService ? 999 : next.stock;
        break;
      case 'isService':
        patch.isService = next.isService;
        patch.stock = next.isService ? 999 : next.stock;
        break;
      case 'purchasePrice':
        patch.purchasePrice = next.purchasePrice;
        break;
      case 'category':
        patch.category = next.category.trim();
        break;
      case 'alertThreshold':
        patch.alertThreshold = next.alertThreshold;
        break;
      case 'unit':
        patch.unit = next.unit.trim() || 'Unité';
        break;
      case 'photos':
        patch.photos = next.photos;
        patch.photo = next.photos[0];
        break;
      case 'barcode':
        patch.barcode = next.barcode.trim() || undefined;
        break;
    }

    void updateProduct(target.id, patch);
    flashSaved(field);
    if (onProductSaved) onProductSaved({ ...target, ...patch });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.name.trim()) {
      showToast('Donne un nom au produit', 'warning');
      return;
    }
    if (values.salePrice <= 0) {
      showToast('Indique un prix de vente valide', 'warning');
      return;
    }

    const created = await addProduct({
      name: values.name.trim(),
      salePrice: values.salePrice,
      // Sans prix d'achat saisi, on ne devine pas une marge : 0 signifie
      // « inconnu », ce que les rapports savent traiter. Inventer 70 % du prix
      // de vente rendrait le bénéfice affiché faux sans que personne le sache.
      purchasePrice: values.purchasePrice,
      stock: values.isService ? 999 : values.stock,
      alertThreshold: values.alertThreshold,
      category: values.category.trim(),
      unit: values.unit.trim() || 'Unité',
      photo: values.photos[0],
      photos: values.photos,
      isService: values.isService,
      barcode: values.barcode.trim() || undefined,
    });

    if (!created) return;
    if (onProductSaved) onProductSaved(created);
    onClose();
  };

  /**
   * « Créer un produit similaire » : on garde toutes les valeurs et on repasse
   * en création, curseur dans le nom. Pour qui vend le même article en trois
   * formats, c'est le gain de temps le plus concret du catalogue.
   */
  const startSimilar = () => {
    setTarget(null);
    setValues((prev) => ({ ...prev, name: '', photos: [], barcode: '' }));
    lastSaved.current = EMPTY;
    setSavedFields({});
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const SavedBadge: React.FC<{ field: string }> = ({ field }) =>
    savedFields[field] ? (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600">
        <Check className="w-3 h-3" />
        Enregistré
      </span>
    ) : null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex flex-col justify-end sm:justify-center sm:items-center sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white w-full sm:max-w-lg max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-sm truncate">
              {target ? target.name : 'Ajouter un produit'}
            </h3>
            <p className="text-[11px] text-slate-300">
              {target
                ? 'Chaque modification est enregistrée toute seule'
                : 'Trois champs suffisent pour commencer à vendre'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 1. Nom du produit */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700">Nom du produit</label>
              <SavedBadge field="name" />
            </div>
            <input
              id="input-product-form-name"
              ref={nameInputRef}
              type="text"
              required
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              onBlur={() => autoSave('name')}
              placeholder="Ex: Riz parfumé 5 kg"
              className="w-full px-3.5 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
            />
          </div>

          {/* 2. Prix de vente */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700">Prix de vente</label>
              <SavedBadge field="salePrice" />
            </div>
            <div onBlur={() => autoSave('salePrice')}>
              <MoneyInput
                id="input-product-form-sale-price"
                value={values.salePrice}
                onChange={(val) => set('salePrice', val)}
                placeholder="0"
              />
            </div>
          </div>

          {/* 3. Combien tu en as */}
          {!values.isService && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">Combien tu en as</label>
                <SavedBadge field="stock" />
              </div>
              <input
                id="input-product-form-stock"
                type="number"
                inputMode="numeric"
                value={values.stock}
                onChange={(e) => set('stock', parseInt(e.target.value, 10) || 0)}
                onBlur={() => autoSave('stock')}
                className="w-full px-3.5 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
              />
            </div>
          )}

          {/* Photos : appareil photo, fichier, glisser-déposer, collage.
              Une photo qui ne part pas n'empêche jamais la création. */}
          <ProductPhotoUploader
            photos={values.photos}
            onChangePhotos={(photos) => {
              set('photos', photos);
              autoSave('photos', { photos });
            }}
            maxPhotos={3}
          />

          {/* Plus de détails — replié par défaut */}
          <div className="pt-1 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              className="flex items-center justify-between w-full py-2.5 text-xs font-bold text-[#4F46E5] hover:text-indigo-800 cursor-pointer"
            >
              <span>{showDetails ? 'Masquer les détails' : 'Plus de détails'}</span>
              {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showDetails && (
              <div className="space-y-3 pb-1 animate-in fade-in duration-150">
                {isOwner && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">
                        Prix d’achat (ce qu’il t’a coûté)
                      </label>
                      <SavedBadge field="purchasePrice" />
                    </div>
                    <div onBlur={() => autoSave('purchasePrice')}>
                      <MoneyInput
                        id="input-product-form-purchase-price"
                        value={values.purchasePrice}
                        onChange={(val) => set('purchasePrice', val)}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">Catégorie</label>
                    <SavedBadge field="category" />
                  </div>
                  <CategorySelect
                    value={values.category}
                    onChange={(category) => {
                      set('category', category);
                      autoSave('category', { category });
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">Unité de vente</label>
                      <SavedBadge field="unit" />
                    </div>
                    <input
                      type="text"
                      value={values.unit}
                      onChange={(e) => set('unit', e.target.value)}
                      onBlur={() => autoSave('unit')}
                      placeholder="Pièce, Kg, Sac..."
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">Alerte stock bas</label>
                      <SavedBadge field="alertThreshold" />
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={values.alertThreshold}
                      onChange={(e) => set('alertThreshold', parseInt(e.target.value, 10) || 0)}
                      onBlur={() => autoSave('alertThreshold')}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">Code-barres emballage</label>
                    <SavedBadge field="barcode" />
                  </div>
                  <input
                    id="input-product-barcode"
                    type="text"
                    value={values.barcode}
                    onChange={(e) => set('barcode', e.target.value)}
                    onBlur={() => autoSave('barcode')}
                    placeholder="Ex: 6181100..."
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold font-mono"
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 py-1">
                  <input
                    type="checkbox"
                    checked={values.isService}
                    onChange={(e) => {
                      set('isService', e.target.checked);
                      autoSave('isService', { isService: e.target.checked });
                    }}
                    className="w-4 h-4 text-[#4F46E5] rounded-sm focus:ring-[#4F46E5]"
                  />
                  <span>C’est une prestation / un service (pas de stock)</span>
                </label>

                {!target && (
                  <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-2xl flex items-start gap-2.5 text-[11px] text-indigo-950">
                    <QrCode className="w-4 h-4 text-[#4F46E5] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Code maison automatique</p>
                      <p className="text-indigo-800 mt-0.5">
                        Un QR code unique et scannable sera attribué à ce produit dès sa création.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {target && (
            <ProductCodeSection
              product={target}
              onRefreshProduct={(updated) => set('barcode', updated.barcode || '')}
            />
          )}

          {/* Actions */}
          <div className="pt-4 flex items-center gap-3 border-t border-slate-100">
            {target ? (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    await deleteProduct(target.id);
                    onClose();
                  }}
                  className="p-3 text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer transition-colors shrink-0"
                  title="Supprimer l’article"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={startSimilar}
                  className="flex-1 py-3.5 px-4 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-800 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Copy className="w-4 h-4 text-[#4F46E5]" />
                  <span>Créer un produit similaire</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="py-3.5 px-5 rounded-2xl bg-slate-900 hover:bg-black text-white font-bold text-sm cursor-pointer transition-all shrink-0"
                >
                  Terminé
                </button>
              </>
            ) : (
              <button
                id="btn-submit-product-form"
                type="submit"
                className="flex-1 py-3.5 px-5 rounded-2xl bg-[#4F46E5] hover:bg-indigo-700 active:scale-[0.99] text-white font-bold text-sm shadow-md transition-all cursor-pointer text-center"
              >
                {submitLabel || 'Créer le produit'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
