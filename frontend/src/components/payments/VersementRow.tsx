import React from 'react';
import type { Versement } from '../../types';
import { formatMoney, formatPaymentMethod } from '../../utils/formatters';
import { orderLabel, relativeDay, versementLabel } from '../../utils/versements';

/** Pastille « 2e versement » : la même partout où un versement apparaît. */
export const VersementBadge: React.FC<{
  versement: Pick<Versement, 'numero' | 'atOrder' | 'isPending'> & Partial<Pick<Versement, 'remainingAfter'>>;
}> = ({ versement }) => (
  <span
    className="inline-block shrink-0 whitespace-nowrap font-bold"
    style={{ backgroundColor: '#EDE9FE', color: '#5B21B6', borderRadius: 999, fontSize: 12, padding: '2px 9px' }}
  >
    {/* Un seul paiement qui solde tout : « 1er versement » laisserait croire qu'il en manque. */}
    {versement.isPending
      ? 'Versement'
      : versement.numero === 1 && versement.remainingAfter === 0
        ? 'Payé en une fois'
        : versementLabel(versement.numero)}
    {versement.atOrder ? ' (à la commande)' : ''}
  </span>
);

interface VersementRowProps {
  versement: Versement;
  /** Nom du client en tête de ligne (liste du jour) ; inutile sur sa propre fiche. */
  showCustomer?: boolean;
  /** Sur ordinateur, tout tient sur une ligne (listes pleine largeur) ; pas dans un panneau étroit. */
  inline?: boolean;
  /** Tap sur la ligne : ouvre le reçu de ce versement. */
  onOpenReceipt: (versement: Versement) => void;
  /** Tap sur « Commande #0042 » : ouvre la commande. Sans lui, le libellé n'est pas un lien. */
  onOpenOrder?: (orderId: string) => void;
}

/**
 * Une ligne de versement : son rang, sa commande, sa date, son montant, son
 * mode et le reste après. Un versement annulé reste visible, barré.
 */
export const VersementRow: React.FC<VersementRowProps> = ({
  versement: v,
  showCustomer = false,
  inline = false,
  onOpenReceipt,
  onOpenOrder,
}) => {
  const heure = new Date(v.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const commande = orderLabel(v);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenReceipt(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenReceipt(v);
        }
      }}
      className={`min-h-[48px] p-3 rounded-2xl border bg-white cursor-pointer hover:border-slate-300 transition-colors ${
        inline ? 'md:px-4 md:py-2.5' : ''
      } ${v.isCancelled ? 'border-mc-line opacity-60' : 'border-mc-line'}`}
    >
      <div className={`flex items-start justify-between gap-3 ${inline ? 'md:items-center' : ''}`}>
        <div
          className={`min-w-0 space-y-1 ${
            inline ? 'md:flex-1 md:flex md:items-center md:gap-3 md:space-y-0' : ''
          }`}
        >
          <div className={`flex flex-wrap items-center gap-1.5 ${inline ? 'md:flex-nowrap md:shrink-0' : ''}`}>
            <VersementBadge versement={v} />
            {v.isPending && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-900">
                En attente d’envoi
              </span>
            )}
            {v.isCancelled && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-slate-200 text-slate-700">
                Annulé
              </span>
            )}
          </div>
          {showCustomer && (
            <p className={`text-[13px] font-extrabold text-mc-ink truncate ${inline ? 'md:text-[14px] md:min-w-0' : ''}`}>
              {v.customerName || 'Client'}
            </p>
          )}
          {v.orderId && onOpenOrder ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenOrder(v.orderId!);
              }}
              className={`block text-left text-[11.5px] font-bold text-[#5B4BF0] hover:underline cursor-pointer ${
                inline ? 'md:text-[12px] md:shrink-0 md:whitespace-nowrap' : ''
              }`}
            >
              {commande}
            </button>
          ) : (
            <p className={`text-[11.5px] font-semibold text-slate-600 ${inline ? 'md:text-[12px] md:truncate' : ''}`}>
              {v.isPending ? 'Sera réparti sur ses commandes à l’envoi' : commande}
            </p>
          )}
          <p className={`text-[11px] text-mc-soft ${inline ? 'md:text-[12px] md:shrink-0 md:whitespace-nowrap' : ''}`}>
            {relativeDay(v.createdAt)} à {heure} · {formatPaymentMethod(v.method)}
          </p>
        </div>
        <div
          className={`text-right shrink-0 ${
            inline ? 'md:flex md:flex-row-reverse md:items-baseline md:gap-4' : ''
          }`}
        >
          <div
            className={`text-sm font-extrabold tabular-nums ${inline ? 'md:text-[16px]' : ''} ${
              v.isCancelled ? 'text-slate-400 line-through' : 'text-mc-ink'
            }`}
          >
            {formatMoney(v.amount)}
          </div>
          {v.remainingAfter !== null && !v.isCancelled && (
            <div
              className={`text-[11px] font-semibold text-mc-soft tabular-nums mt-0.5 ${
                inline ? 'md:text-[12px] md:mt-0' : ''
              }`}
            >
              Reste après : {formatMoney(v.remainingAfter)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
