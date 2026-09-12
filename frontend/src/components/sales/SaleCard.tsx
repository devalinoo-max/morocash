import React, { useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { Sale } from '../../types';
import { formatMoney } from '../../utils/formatters';
import { countLabel } from '../../utils/plural';
import { avatarColor, avatarInitials } from '../../utils/avatar';
import { saleStatusStyle } from '../../utils/saleStatus';

interface SaleCardProps {
  sale: Sale;
  /** Le vendeur n'est affiché que si la boutique a plusieurs employés. */
  showSeller: boolean;
  onOpen: (sale: Sale) => void;
  onMenu: (sale: Sale) => void;
}

const APPUI_LONG_MS = 500;

/**
 * Une commande, sur téléphone.
 *
 * L'ordre de lecture est imposé par les questions que le commerçant se pose,
 * dans l'ordre où il se les pose : qui · combien · payé ou pas · quand. Le
 * numéro de commande n'est pas ici : il ne sert qu'à retrouver une commande
 * depuis un vieux reçu papier, et il vole la place du montant.
 */
export const SaleCard: React.FC<SaleCardProps> = ({ sale, showSeller, onOpen, onMenu }) => {
  const statut = saleStatusStyle(sale);
  const annulee = !!sale.isCancelled;
  const reste = annulee ? 0 : sale.remainingAmount;
  const nomClient = sale.customerName?.trim() || 'Client non renseigné';
  const nbArticles = sale.items.reduce((total, it) => total + it.quantity, 0);

  const heure = new Date(sale.createdAt).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Appui long = même menu que le bouton « ⋯ », sans viser une cible de 24px.
  const minuterie = useRef<number | null>(null);
  const aOuvertLeMenu = useRef(false);

  const demarrerAppui = () => {
    aOuvertLeMenu.current = false;
    minuterie.current = window.setTimeout(() => {
      aOuvertLeMenu.current = true;
      onMenu(sale);
    }, APPUI_LONG_MS);
  };

  const arreterAppui = () => {
    if (minuterie.current !== null) {
      window.clearTimeout(minuterie.current);
      minuterie.current = null;
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={demarrerAppui}
      onPointerUp={arreterAppui}
      onPointerLeave={arreterAppui}
      onPointerCancel={arreterAppui}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (aOuvertLeMenu.current) return;
        onOpen(sale);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(sale);
        }
      }}
      className={`w-full text-left bg-white border rounded-[14px] p-3 select-none cursor-pointer shadow-[0_1px_2px_rgba(15,23,42,0.05)] active:bg-slate-50 transition-colors ${
        annulee ? 'opacity-55' : ''
      }`}
      style={{ borderColor: '#E2E8F0' }}
    >
      {/* Ligne 1 — qui, et combien */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className="w-[34px] h-[34px] rounded-full shrink-0 flex items-center justify-center text-white font-extrabold text-[12px]"
          style={{ backgroundColor: avatarColor(nomClient) }}
          aria-hidden="true"
        >
          {avatarInitials(nomClient)}
        </div>
        <span className="flex-1 min-w-0 truncate text-[14.5px] font-bold text-slate-900">
          {nomClient}
        </span>
        <span
          className={`shrink-0 text-[16px] font-extrabold tabular-nums ${
            annulee ? 'line-through text-slate-400' : 'text-slate-900'
          }`}
        >
          {formatMoney(sale.totalAmount)}
        </span>
      </div>

      {/* Ligne 2 — quand, et où ça en est */}
      <div className="flex items-center gap-1.5 mt-1.5 pl-[44px] min-w-0">
        <span className="text-[11.5px] text-slate-500 shrink-0">{heure}</span>
        <span className="text-[11.5px] text-slate-300 shrink-0">·</span>
        <span className="text-[11.5px] text-slate-500 truncate">
          {countLabel(nbArticles, 'article')}
        </span>
        {showSeller && sale.sellerName && (
          <span className="text-[10px] text-slate-400 truncate">
            · {sale.sellerName}
          </span>
        )}
        {sale.syncStatus === 'PENDING_SYNC' && (
          <span className="shrink-0 text-[10px] font-bold px-1.5 rounded bg-amber-100 text-amber-900">
            En attente
          </span>
        )}
        <span className="flex-1" />
        <span
          className="shrink-0 text-[10.5px] font-bold rounded-full"
          style={{ backgroundColor: statut.bg, color: statut.fg, padding: '3px 9px', fontWeight: 750 }}
        >
          {statut.label}
        </span>
        <button
          type="button"
          aria-label="Actions sur cette commande"
          onClick={(e) => {
            e.stopPropagation();
            onMenu(sale);
          }}
          className="shrink-0 -mr-1 w-6 h-6 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Ligne 3 — ce qu'il reste à aller chercher */}
      {reste > 0 && (
        <div className="mt-1 pl-[44px] text-[12px] text-[#DC2626]" style={{ fontWeight: 650 }}>
          Reste à payer : {formatMoney(reste)}
        </div>
      )}
    </div>
  );
};
