import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, FileText, MessageCircle, Phone, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { PaymentMethod, Sale } from '../../types';
import { formatMoney, formatPaymentMethod } from '../../utils/formatters';
import { avatarColor, avatarInitials } from '../../utils/avatar';
import { saleStatusStyle } from '../../utils/saleStatus';
import { buildHistory, debtSentence, statusSubtitle } from '../../utils/orderDetail';
import { paymentMethodColors } from '../../utils/paymentMethods';
import { buildReceiptMessage, buildReminderMessage, openWhatsApp } from '../../utils/saleMessages';
import { CancelOrderDialog } from './CancelOrderDialog';
import { CollectRemainingModal } from './CollectRemainingModal';

interface OrderDetailPanelProps {
  sale: Sale;
  onClose: () => void;
}

const APPUI_LONG_MS = 500;
const VINGT_QUATRE_HEURES_MS = 24 * 60 * 60 * 1000;

/** « auj. à 14:32 », « hier à 15:52 », « 9 sept. à 10:04 ». */
function dateRelative(iso: string): string {
  const d = new Date(iso);
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const jour = d.toISOString().slice(0, 10);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const hierObj = new Date();
  hierObj.setDate(hierObj.getDate() - 1);
  const hier = hierObj.toISOString().slice(0, 10);

  if (jour === aujourdhui) return `auj. à ${heure}`;
  if (jour === hier) return `hier à ${heure}`;
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${heure}`;
}

/**
 * Le détail d'une commande.
 *
 * L'ordre des blocs suit l'ordre des questions : est-ce payé, pour qui, quand
 * et par qui, quoi, combien a été reçu, ce qui s'est passé depuis. Le numéro
 * de commande arrive en troisième position et en petit : il ne sert qu'à
 * faire le lien avec un vieux reçu papier.
 *
 * Une commande validée ne se modifie jamais. La seule correction possible est
 * l'annulation avec motif — d'où l'absence totale de bouton « Modifier ».
 */
export const OrderDetailPanel: React.FC<OrderDetailPanelProps> = ({ sale, onClose }) => {
  const {
    customers,
    settings,
    setSelectedSaleForReceipt,
    recordReceiptDelivery,
    receiptDeliveries,
    cancelSale,
    collectSalePayment,
    showToast,
    focusCustomer,
  } = useApp();

  const [annulationOuverte, setAnnulationOuverte] = useState(false);
  const [encaissementOuvert, setEncaissementOuvert] = useState(false);

  const statut = saleStatusStyle(sale);
  const annulee = !!sale.isCancelled;
  const reste = annulee ? 0 : sale.remainingAmount;
  const nomClient = sale.customerName?.trim() || 'Client non renseigné';
  const client = customers.find((c) => c.id === sale.customerId);

  const paiementsValides = (sale.payments ?? []).filter((p) => !p.isCancelled);

  // Ce que le statut veut dire, ce que le client doit au total, ce qui est
  // arrivé à la commande : trois calculs vérifiables hors de cet écran
  // (utils/orderDetail, tests/commandes).
  const sousTitreStatut = statusSubtitle(sale);
  const phraseDette = debtSentence(sale, client?.totalDebt);
  const historique = useMemo(
    () => buildHistory(sale, receiptDeliveries),
    [sale, receiptDeliveries]
  );

  // Appui long sur le numéro : c'est la seule chose qu'on recopie à la main.
  const minuterie = useRef<number | null>(null);
  const copierNumero = async () => {
    try {
      await navigator.clipboard.writeText(sale.reference);
      showToast('Numéro copié', 'success');
    } catch {
      showToast('Impossible de copier le numéro sur cet appareil', 'error');
    }
  };

  const voirLeRecu = () => setSelectedSaleForReceipt(sale);

  const envoyerRecu = () => {
    openWhatsApp(sale.customerPhone, buildReceiptMessage(sale, settings.shopName));
    recordReceiptDelivery(sale.id, 'WHATSAPP', sale.reference);
  };

  const relancer = () => {
    openWhatsApp(sale.customerPhone, buildReminderMessage(sale, settings.shopName));
  };

  const appeler = () => {
    const numero = (sale.customerPhone ?? '').replace(/[^0-9+]/g, '');
    if (!numero) {
      showToast('Aucun numéro enregistré pour ce client', 'warning');
      return;
    }
    window.location.href = `tel:${numero}`;
  };

  const encaisser = async (montant: number, methode: PaymentMethod) => {
    const ok = await collectSalePayment(sale.id, montant, methode);
    if (ok) onClose();
    return ok;
  };

  const confirmerAnnulation = async (motif: string) => {
    await cancelSale(sale.id, motif);
    setAnnulationOuverte(false);
    onClose();
  };

  // Une commande payée depuis plus de 24h ne s'annule plus d'un geste : à ce
  // stade, le client est parti avec sa marchandise et son reçu.
  const annulationPossible =
    !annulee && (reste > 0 || Date.now() - new Date(sale.createdAt).getTime() < VINGT_QUATRE_HEURES_MS);

  return (
    <div className="fixed inset-0 z-[60] flex md:justify-end">
      <button
        type="button"
        aria-label="Fermer le détail"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs hidden md:block cursor-default"
      />

      <div className="relative w-full md:w-[480px] h-full bg-[#F8FAFC] flex flex-col shadow-2xl">
        <div className="h-14 shrink-0 bg-white border-b border-slate-200 px-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-600 cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 md:hidden" />
            <X className="w-5 h-5 hidden md:block" />
          </button>
          <span className="text-sm font-black text-slate-900">Détail de la commande</span>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-3 pb-4">
          {/* B1 — Est-ce payé, et combien */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
            <span
              className="inline-block rounded-full"
              style={{
                backgroundColor: statut.bg,
                color: statut.fg,
                padding: '8px 18px',
                fontSize: '14px',
                fontWeight: 800,
              }}
            >
              {statut.symbol} {statut.longLabel}
            </span>
            <div
              className={`mt-3 tabular-nums ${annulee ? 'line-through text-slate-400' : 'text-slate-900'}`}
              style={{ fontSize: '34px', fontWeight: 800, letterSpacing: '-0.035em' }}
            >
              {formatMoney(sale.totalAmount)}
            </div>
            <p className="text-xs text-slate-500 mt-1">{sousTitreStatut}</p>
          </section>

          {/* B2 — Le client */}
          <button
            type="button"
            onClick={() => {
              if (!client) return;
              focusCustomer(client.id);
              onClose();
            }}
            disabled={!client}
            className="w-full bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-3 text-left enabled:hover:bg-slate-50 enabled:cursor-pointer transition-colors"
          >
            <div
              className="w-[38px] h-[38px] rounded-full shrink-0 flex items-center justify-center text-white font-extrabold text-[13px]"
              style={{ backgroundColor: avatarColor(nomClient) }}
              aria-hidden="true"
            >
              {avatarInitials(nomClient)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-bold text-slate-900 truncate">{nomClient}</div>
              <div className="text-[11.5px] text-slate-500 truncate">
                {sale.customerPhone || 'Pas de numéro'}
                {client && (
                  <>
                    {' · '}
                    {client.totalDebt > 0 ? (
                      <span className="text-[#DC2626] font-bold">
                        doit déjà {formatMoney(client.totalDebt)}
                      </span>
                    ) : (
                      <span className="text-emerald-600 font-bold">à jour</span>
                    )}
                  </>
                )}
              </div>
            </div>
            {client && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
          </button>

          {/* B3 — Quand, par qui, et sous quel numéro */}
          <section className="bg-white rounded-2xl border border-slate-200 grid grid-cols-3 divide-x divide-slate-100">
            <div className="p-3 min-w-0">
              <div className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">Date</div>
              <div className="text-[11px] font-bold text-slate-800 mt-1 truncate">
                {dateRelative(sale.createdAt)}
              </div>
            </div>
            <div className="p-3 min-w-0">
              <div className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">
                Vendu par
              </div>
              <div className="text-[11px] font-bold text-slate-800 mt-1 truncate">
                {sale.sellerName || '—'}
              </div>
            </div>
            <div
              className="p-3 min-w-0 cursor-pointer select-none"
              title="Appui long pour copier le numéro"
              onPointerDown={() => {
                minuterie.current = window.setTimeout(() => void copierNumero(), APPUI_LONG_MS);
              }}
              onPointerUp={() => minuterie.current && window.clearTimeout(minuterie.current)}
              onPointerLeave={() => minuterie.current && window.clearTimeout(minuterie.current)}
              onContextMenu={(e) => {
                e.preventDefault();
                void copierNumero();
              }}
            >
              <div className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">N°</div>
              <div className="text-[10.5px] font-semibold text-slate-500 mt-1 truncate">
                {sale.reference}
              </div>
            </div>
          </section>

          {/* B4 — Ce qui a été vendu */}
          <section className="bg-white rounded-2xl border border-slate-200 p-3">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Ce qui a été vendu
            </h3>
            <div className="divide-y divide-slate-100">
              {sale.items.map((item, index) => (
                <div
                  key={`${item.productId}-${index}`}
                  className="py-2 flex items-center gap-2.5 min-w-0"
                >
                  <div
                    className="w-[34px] h-[34px] rounded-lg shrink-0 flex items-center justify-center text-white font-extrabold text-[13px]"
                    style={{ backgroundColor: avatarColor(item.name) }}
                    aria-hidden="true"
                  >
                    {item.name.trim().charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold text-slate-900 truncate">
                      {item.name}
                    </div>
                    <div className="text-[10.5px] text-slate-500 tabular-nums">
                      {item.quantity} × {formatMoney(item.unitPrice)}
                    </div>
                  </div>
                  <span className="text-[12.5px] font-bold text-slate-900 tabular-nums shrink-0">
                    {formatMoney(item.total)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between text-[12px] text-slate-600">
                <span>Sous-total</span>
                <span className="tabular-nums font-semibold">{formatMoney(sale.subtotal)}</span>
              </div>
              {sale.discount > 0 && (
                <div className="flex items-center justify-between text-[12px] text-[#DC2626] font-bold">
                  <span>
                    Remise
                    {sale.discountMode === 'PERCENTAGE' && sale.discountValue
                      ? ` (${sale.discountValue} %)`
                      : ''}
                  </span>
                  <span className="tabular-nums">− {formatMoney(sale.discount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-[12px] font-bold text-slate-600">Total</span>
                <span
                  className="tabular-nums text-slate-900"
                  style={{ fontSize: '22px', fontWeight: 800 }}
                >
                  {formatMoney(sale.totalAmount)}
                </span>
              </div>
            </div>
          </section>

          {/* B5 — Ce qui a été payé */}
          <section className="bg-white rounded-2xl border border-slate-200 p-3">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Ce qui a été payé
            </h3>

            {paiementsValides.length === 0 ? (
              <p className="text-[12px] text-slate-400 py-2">Aucun encaissement pour l’instant.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {paiementsValides.map((p) => {
                  const couleurs = paymentMethodColors(p.method);
                  return (
                    <div key={p.id} className="py-2 flex items-center gap-2.5 min-w-0">
                      <span
                        className="shrink-0 text-[10px] font-bold rounded-full px-2 py-1"
                        style={{ backgroundColor: couleurs.bg, color: couleurs.fg }}
                      >
                        {formatPaymentMethod(p.method)}
                      </span>
                      <span className="text-[11px] text-slate-500 flex-1 min-w-0 truncate">
                        {dateRelative(p.createdAt)}
                      </span>
                      <span className="text-[12.5px] font-bold text-emerald-600 tabular-nums shrink-0">
                        + {formatMoney(p.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {reste > 0 && (
              <div
                className="mt-3 rounded-xl p-3 flex items-center justify-between"
                style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}
              >
                <span className="text-[12px] font-bold text-[#991B1B]">Reste à payer</span>
                <span
                  className="tabular-nums text-[#DC2626]"
                  style={{ fontSize: '19px', fontWeight: 800 }}
                >
                  {formatMoney(reste)}
                </span>
              </div>
            )}

            {phraseDette && (
              <p className="text-[11.5px] text-slate-500 mt-3 leading-relaxed">{phraseDette}</p>
            )}
          </section>

          {/* B6 — Ce qui s'est passé */}
          <section className="bg-white rounded-2xl border border-slate-200 p-3">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Historique
            </h3>
            <ul className="space-y-2">
              {historique.map((ligne, index) => (
                <li key={`${ligne.at}-${index}`} className="flex gap-2 text-[11px] leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="font-semibold text-slate-800">{ligne.titre}</span>
                    {ligne.detail && <span className="text-slate-500"> — {ligne.detail}</span>}
                    <span className="text-slate-400"> · {dateRelative(ligne.at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* B7 — Les actions, qui changent selon le statut */}
        <div className="shrink-0 bg-white border-t border-slate-200 p-3 space-y-2">
          {annulee ? (
            <button
              type="button"
              onClick={voirLeRecu}
              className="w-full h-[50px] rounded-2xl border border-slate-300 text-slate-700 text-sm font-bold hover:bg-slate-50 cursor-pointer inline-flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" /> Voir le reçu d’origine
            </button>
          ) : reste > 0 ? (
            <>
              <button
                type="button"
                onClick={() => setEncaissementOuvert(true)}
                className="w-full h-[50px] rounded-2xl bg-[#4F46E5] hover:bg-indigo-700 text-white text-sm font-black shadow-md shadow-indigo-600/20 cursor-pointer"
              >
                Encaisser les {formatMoney(reste)} →
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={relancer}
                  className="h-[42px] rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer inline-flex items-center justify-center gap-1.5"
                >
                  <MessageCircle className="w-4 h-4" /> Relancer
                </button>
                <button
                  type="button"
                  onClick={voirLeRecu}
                  className="h-[42px] rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer inline-flex items-center justify-center gap-1.5"
                >
                  <FileText className="w-4 h-4" /> Voir le reçu
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={envoyerRecu}
                className="w-full h-[50px] rounded-2xl text-white text-sm font-black shadow-md cursor-pointer inline-flex items-center justify-center gap-2"
                style={{ backgroundColor: '#25D366' }}
              >
                <MessageCircle className="w-4 h-4" /> Renvoyer le reçu sur WhatsApp
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={voirLeRecu}
                  className="h-[42px] rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer inline-flex items-center justify-center gap-1.5"
                >
                  <FileText className="w-4 h-4" /> Voir le reçu
                </button>
                <button
                  type="button"
                  onClick={appeler}
                  className="h-[42px] rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer inline-flex items-center justify-center gap-1.5"
                >
                  <Phone className="w-4 h-4" /> Appeler
                </button>
              </div>
            </>
          )}

          {annulationPossible && (
            <button
              type="button"
              onClick={() => setAnnulationOuverte(true)}
              className="w-full text-center text-[12px] font-bold text-[#DC2626] py-1.5 hover:underline cursor-pointer"
            >
              Annuler cette commande
            </button>
          )}
        </div>
      </div>

      {annulationOuverte && (
        <CancelOrderDialog
          sale={sale}
          onClose={() => setAnnulationOuverte(false)}
          onConfirm={confirmerAnnulation}
        />
      )}
      {encaissementOuvert && (
        <CollectRemainingModal
          sale={sale}
          onClose={() => setEncaissementOuvert(false)}
          onCollect={encaisser}
        />
      )}
    </div>
  );
};
