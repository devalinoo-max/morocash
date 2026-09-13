import React from 'react';
import { Pencil, QrCode, Scissors } from 'lucide-react';
import type { Product } from '../../types';
import { formatMoneyCompact } from '../../utils/formatters';
import { avatarColor, avatarInitials } from '../../utils/avatar';
import { stockLabel } from '../../utils/stockLabel';

interface ProductCardProps {
  product: Product;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  /** Ouvre la fiche : c'est là que vivent le code interne, le QR et le détail. */
  onOpen: (product: Product) => void;
  onStockEntry: (product: Product) => void;
  onShowCode: (product: Product) => void;
  /** Le prix d'achat n'existe pas pour un vendeur. */
  showPurchasePrice: boolean;
  /** Faux pour une activité de services : ni stock ni entrée de stock. */
  stockVisible: boolean;
  locked?: boolean;
}

/**
 * Un produit, sur téléphone.
 *
 * Quatre blocs empilés, jamais trois colonnes : la mise en page en colonnes
 * venait de l'écran d'ordinateur et, tassée sous 400 px, faisait passer le
 * prix sous le QR et « + Entrée » par-dessus « Achat : ». Ici chaque ligne est
 * un bloc à part entière — rien ne peut en recouvrir un autre, quelle que
 * soit la longueur du nom ou du montant.
 */
export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  selected,
  onToggleSelect,
  onOpen,
  onStockEntry,
  onShowCode,
  showPurchasePrice,
  stockVisible,
  locked,
}) => {
  const stock = stockLabel(product);
  const afficheStock = stockVisible || product.isService;
  const peutEntrerDuStock = stockVisible && !product.isService;

  const meta = [
    product.category || 'Sans catégorie',
    showPurchasePrice && product.purchasePrice > 0
      ? `achat ${formatMoneyCompact(product.purchasePrice)}`
      : null,
  ].filter(Boolean);

  // Bouton carré des actions secondaires : 44 px, la taille d'un pouce.
  const CARRE =
    'w-11 h-9 shrink-0 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-[#4F46E5] hover:border-indigo-200 hover:bg-indigo-50/60 flex items-center justify-center transition-all cursor-pointer';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(product)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(product);
        }
      }}
      id={`product-card-${product.id}`}
      className="w-full text-left bg-white border rounded-[14px] p-3 min-h-[108px] flex cursor-pointer shadow-[0_1px_2px_rgba(15,23,42,0.05)] active:bg-slate-50 transition-colors"
      style={{ borderColor: selected ? '#4F46E5' : '#E2E8F0' }}
    >
      <div className="flex-1 flex items-start gap-2.5 min-w-0">
        <input
          type="checkbox"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect(product.id)}
          aria-label={`Sélectionner ${product.name}`}
          className="w-[22px] h-[22px] mt-0.5 shrink-0 text-[#4F46E5] rounded-md cursor-pointer focus:ring-[#4F46E5]"
        />

        {/* Vignette : couleur calculée sur le nom, donc stable pour un produit
            et différente d'un voisin. L'ancienne initiale indigo sur gris pâle
            rendait toutes les lignes identiques au premier coup d'œil. */}
        {product.photo ? (
          <img
            src={product.photo}
            alt=""
            referrerPolicy="no-referrer"
            className="w-11 h-11 rounded-[11px] object-cover border border-slate-200 shrink-0"
          />
        ) : (
          <div
            className="w-11 h-11 rounded-[11px] shrink-0 flex items-center justify-center text-white text-[16px]"
            style={{ backgroundColor: avatarColor(product.name), fontWeight: 800 }}
            aria-hidden="true"
          >
            {product.isService ? (
              <Scissors className="w-5 h-5" />
            ) : (
              avatarInitials(product.name).charAt(0)
            )}
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col">
          {/* LIGNE 1 — le nom, et l'état du stock */}
          <div className="flex items-start gap-2 min-w-0">
            <h3 className="flex-1 min-w-0 text-[14px] font-bold text-slate-900 leading-snug line-clamp-2">
              {product.name}
            </h3>
            {afficheStock && (
              <span
                className="shrink-0 text-[12.5px] tabular-nums leading-snug"
                style={{ color: stock.color, fontWeight: 700 }}
              >
                {stock.text}
              </span>
            )}
          </div>

          {/* LIGNE 2 — le prix de vente, la seule chose qu'on cherche vraiment */}
          <div className="mt-1 text-[16px] tabular-nums text-[#4F46E5]" style={{ fontWeight: 800 }}>
            {formatMoneyCompact(product.salePrice)}
          </div>

          {/* LIGNE 3 — catégorie et prix d'achat, sur une seule ligne */}
          {meta.length > 0 && (
            <div className="mt-0.5 text-[11px] text-slate-400 truncate">{meta.join(' · ')}</div>
          )}

          {/* LIGNE 4 — le filet, puis les trois actions */}
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-2">
            {peutEntrerDuStock ? (
              <button
                id={`btn-adjust-stock-${product.id}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onStockEntry(product);
                }}
                className={`flex-1 min-w-0 h-9 rounded-xl bg-[#EEF2FF] text-[#4F46E5] text-[12.5px] font-bold hover:bg-indigo-100 active:scale-[0.98] transition-all cursor-pointer ${
                  locked ? 'opacity-50' : ''
                }`}
              >
                + Entrée
              </button>
            ) : (
              <span className="flex-1" />
            )}

            <button
              id={`btn-edit-prod-${product.id}`}
              type="button"
              aria-label={`Modifier ${product.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpen(product);
              }}
              className={CARRE}
            >
              <Pencil className="w-4 h-4" />
            </button>

            <button
              type="button"
              aria-label={`Code et étiquette de ${product.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onShowCode(product);
              }}
              className={CARRE}
            >
              <QrCode className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
