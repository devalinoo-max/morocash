import React, { useMemo } from 'react';
import { Phone, X, ShoppingBag, Repeat } from 'lucide-react';
import type { Customer, Sale } from '../../types';
import { formatMoney } from '../../utils/formatters';
import { countLabel } from '../../utils/plural';
import { saleStatusStyle } from '../../utils/saleStatus';

const JOUR_MS = 24 * 60 * 60 * 1000;

/**
 * Rythme d'achat du client : l'écart moyen entre ses commandes, soit
 * (dernière − première) / (nombre de commandes − 1). Les commandes annulées
 * ne comptent pas : le client n'a finalement pas acheté ce jour-là.
 */
function frequenceAchat(commandes: Sale[]): string {
  const dates = commandes
    .filter((s) => !s.isCancelled)
    .map((s) => new Date(s.createdAt).getTime())
    .sort((a, b) => a - b);
  if (dates.length === 0) return 'Pas encore de commande';
  if (dates.length === 1) return 'Une seule commande pour l’instant';

  const ecartMoyenJours = (dates[dates.length - 1] - dates[0]) / (dates.length - 1) / JOUR_MS;
  if (ecartMoyenJours < 1) return 'Plusieurs fois par jour en moyenne';
  const jours = Math.round(ecartMoyenJours);
  return jours === 1 ? 'Tous les jours en moyenne' : `Tous les ${jours} jours en moyenne`;
}

interface CustomerDetailPanelProps {
  customer: Customer;
  sales: Sale[];
  onClose: () => void;
}

/**
 * Fiche d'un client : ses commandes, de la plus récente à la plus ancienne.
 *
 * Le commerçant l'ouvre surtout depuis la liste des dettes, pour savoir sur
 * quelles commandes porte ce qu'on lui doit : les commandes à crédit ou
 * payées en partie sont donc mises en avant, avec le reste dû de chacune.
 */
export const CustomerDetailPanel: React.FC<CustomerDetailPanelProps> = ({ customer, sales, onClose }) => {
  const commandes = useMemo(
    () =>
      sales
        .filter((s) => s.customerId === customer.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [sales, customer.id]
  );
  const nbImpayees = commandes.filter((s) => !s.isCancelled && s.remainingAmount > 0).length;
  const hasDebt = customer.totalDebt > 0;
  const frequence = frequenceAchat(commandes);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="customer-detail-panel"
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-lg max-h-[90vh] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 flex flex-col"
      >
        {/* En-tête : qui, et combien il doit */}
        <div className="p-5 pb-4 border-b border-slate-100 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-extrabold text-base text-slate-900 truncate">{customer.name}</h3>
              <a
                href={`tel:${customer.phone}`}
                className="text-xs font-bold text-slate-600 mt-0.5 inline-flex items-center gap-1 hover:text-[#4F46E5]"
              >
                <Phone className="w-3 h-3 text-slate-400" />
                {customer.phone}
              </a>
            </div>
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div
            className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${
              hasDebt ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'
            }`}
          >
            <div>
              <span
                className={`text-[10px] font-extrabold uppercase tracking-wider ${
                  hasDebt ? 'text-rose-800' : 'text-emerald-800'
                }`}
              >
                {hasDebt ? 'Montant dû' : 'Solde'}
              </span>
              <div className={`text-lg font-black ${hasDebt ? 'text-rose-700' : 'text-emerald-700'}`}>
                {hasDebt ? formatMoney(customer.totalDebt) : 'À jour (0 F)'}
              </div>
            </div>
            <span className="text-[11px] font-bold text-slate-600 text-right">
              {countLabel(commandes.length, 'commande')}
              {nbImpayees > 0 && (
                <span className="block text-rose-700">{nbImpayees} pas encore réglée{nbImpayees > 1 ? 's' : ''}</span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Repeat className="w-3.5 h-3.5 text-[#4F46E5] shrink-0" />
            <span className="font-semibold text-slate-500">Fréquence d’achat :</span>
            <span className="font-extrabold text-slate-900">{frequence}</span>
          </div>
        </div>

        {/* Commandes, la plus récente en haut */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {commandes.length === 0 ? (
            <div className="py-10 text-center text-slate-400 space-y-2">
              <ShoppingBag className="w-9 h-9 mx-auto text-slate-300 stroke-[1.5]" />
              <p className="text-sm font-semibold text-slate-600">Aucune commande pour ce client</p>
              {hasDebt && (
                <p className="text-xs">
                  Sa dette ne vient d’aucune commande enregistrée ici (dette notée à la main ou reprise d’un
                  ancien carnet).
                </p>
              )}
            </div>
          ) : (
            commandes.map((sale) => {
              const statut = saleStatusStyle(sale);
              const annulee = !!sale.isCancelled;
              const reste = annulee ? 0 : sale.remainingAmount;
              const aRegler = reste > 0;
              const nbArticles = sale.items.reduce((total, it) => total + it.quantity, 0);

              return (
                <div
                  key={sale.id}
                  className={`p-3 rounded-2xl border ${
                    aRegler ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200/80 bg-white'
                  } ${annulee ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-slate-900">
                        {new Date(sale.createdAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                        <span className="font-semibold text-slate-400"> · {sale.reference}</span>
                      </p>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {countLabel(nbArticles, 'article')} ·{' '}
                        {sale.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className={`text-sm font-black tabular-nums ${
                          annulee ? 'text-slate-400 line-through' : 'text-slate-900'
                        }`}
                      >
                        {formatMoney(sale.totalAmount)}
                      </div>
                      <span
                        className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold"
                        style={{ backgroundColor: statut.bg, color: statut.fg }}
                      >
                        {statut.label}
                      </span>
                    </div>
                  </div>

                  {aRegler && (
                    <div className="mt-2 pt-2 border-t border-rose-200/70 flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-600">
                        Déjà payé : {formatMoney(sale.paidAmount)}
                      </span>
                      <span className="font-black text-rose-700">Reste dû : {formatMoney(reste)}</span>
                    </div>
                  )}
                  {annulee && sale.cancelReason && (
                    <p className="mt-1.5 text-[11px] text-slate-500 italic">Motif : {sale.cancelReason}</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
