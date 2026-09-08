import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  ArrowLeftRight,
  Calendar,
  User,
  Package,
  Layers,
  FileText,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  Truck,
  ExternalLink,
} from 'lucide-react';
import { formatFCFA } from '../../utils/formatters';
import { StockMovement } from '../../types';

interface MovementDetailModalProps {
  movement: StockMovement | null;
  onClose: () => void;
}

export const MovementDetailModal: React.FC<MovementDetailModalProps> = ({
  movement,
  onClose,
}) => {
  const { cancelStockMovement, settings, setSelectedSaleForReceipt, sales } = useApp();
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!movement) return null;

  const isVendeur = settings.role === 'SELLER';
  const isOrderLinked = Boolean(
    movement.order_id || movement.type === 'SORTIE' || movement.type === 'RETOUR'
  );

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!cancelReason.trim()) {
      setErrorMsg('Le motif d’annulation est obligatoire.');
      return;
    }

    const result = await cancelStockMovement(movement.id, cancelReason.trim());
    if (!result.success) {
      setErrorMsg(result.message || 'Impossible d’annuler ce mouvement');
      return;
    }

    setIsCancelling(false);
    onClose();
  };

  const handleViewOrder = () => {
    if (movement.order_id) {
      const sale = sales.find((s) => s.id === movement.order_id);
      if (sale) {
        setSelectedSaleForReceipt(sale);
        onClose();
      }
    }
  };

  const getTypeStyle = (type: StockMovement['type']) => {
    switch (type) {
      case 'ENTREE':
        return {
          label: 'ENTRÉE DE STOCK',
          badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          gradient: 'from-emerald-600 to-teal-700',
        };
      case 'SORTIE':
        return {
          label: 'SORTIE (VENTE)',
          badge: 'bg-blue-100 text-blue-800 border-blue-300',
          gradient: 'from-blue-600 to-indigo-700',
        };
      case 'RETOUR':
        return {
          label: 'RETOUR CLIENT',
          badge: 'bg-purple-100 text-purple-800 border-purple-300',
          gradient: 'from-purple-600 to-fuchsia-700',
        };
      case 'CASSE':
        return {
          label: 'CASSÉ OU ABÎMÉ',
          badge: 'bg-amber-100 text-amber-800 border-amber-300',
          gradient: 'from-amber-500 to-orange-600',
        };
      case 'PERTE':
        return {
          label: 'PERDU OU VOLÉ',
          badge: 'bg-rose-100 text-rose-800 border-rose-300',
          gradient: 'from-rose-600 to-red-700',
        };
      case 'INVENTAIRE':
        return {
          label: 'AJUSTEMENT INVENTAIRE',
          badge: 'bg-slate-200 text-slate-800 border-slate-300',
          gradient: 'from-slate-700 to-slate-900',
        };
    }
  };

  const style = getTypeStyle(movement.type);
  const isPositive = movement.quantite > 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div
          className={`bg-gradient-to-r ${style.gradient} px-6 py-4 text-white flex items-center justify-between`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <ArrowLeftRight className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black tracking-wider uppercase px-2 py-0.5 rounded bg-white/20 text-white border border-white/30">
                  {style.label}
                </span>
                {movement.annule && (
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-rose-950 text-rose-200 border border-rose-400/40">
                    Annulé
                  </span>
                )}
              </div>
              <p className="text-xs text-white/80 font-mono mt-0.5">
                Réf : {movement.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Main Quantity & Variation Card */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Variation de stock
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span
                  className={`text-2xl font-black ${
                    isPositive ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {isPositive ? `+${movement.quantite}` : movement.quantite}
                </span>
                <span className="text-xs font-bold text-slate-500">unités</span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Évolution stock
              </span>
              <div className="flex items-center gap-2 font-black text-slate-800 text-sm mt-0.5">
                <span className="text-slate-500">{movement.stock_avant}</span>
                <span className="text-slate-400">→</span>
                <span className="text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                  {movement.stock_apres}
                </span>
              </div>
            </div>
          </div>

          {/* Details list */}
          <div className="space-y-2.5 text-xs">
            {/* Article */}
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-slate-400" />
                Article concerné
              </span>
              <span className="font-extrabold text-slate-900 text-right">
                {movement.product_name}
              </span>
            </div>

            {/* Motif */}
            <div className="flex items-start justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500 font-medium flex items-center gap-1.5 shrink-0">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                Motif
              </span>
              <span className="font-bold text-slate-800 text-right max-w-[260px] pl-2">
                {movement.motif}
              </span>
            </div>

            {/* Fournisseur */}
            {movement.fournisseur && (
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-medium flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-slate-400" />
                  Fournisseur
                </span>
                <span className="font-bold text-slate-900">
                  {movement.fournisseur}
                </span>
              </div>
            )}

            {/* Date & Auteur */}
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Date & heure
              </span>
              <span className="font-semibold text-slate-700">
                {new Date(movement.created_at).toLocaleString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                Enregistré par
              </span>
              <span className="font-bold text-slate-800">
                {movement.user_name || 'Commerçant'}
              </span>
            </div>

            {/* Financial cost (Hidden for vendeur) */}
            {!isVendeur && movement.cout_unitaire !== undefined && (
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Coût unitaire (CMP)</span>
                <span className="font-bold text-slate-900">
                  {formatFCFA(movement.cout_unitaire)}
                </span>
              </div>
            )}

            {/* Linked order */}
            {movement.order_reference && (
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Commande liée</span>
                <button
                  onClick={handleViewOrder}
                  className="inline-flex items-center gap-1 font-extrabold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                >
                  {movement.order_reference}
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Photo / Justificatif */}
            {movement.justificatif_url && (
              <div className="pt-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Justificatif joint
                </span>
                <img
                  src={movement.justificatif_url}
                  alt="Justificatif mouvement"
                  className="w-full max-h-48 object-cover rounded-xl border border-slate-200 shadow-xs"
                />
              </div>
            )}
          </div>

          {/* Cancellation section */}
          {!movement.annule && !isCancelling && (
            <div className="pt-4 border-t border-slate-200">
              {isOrderLinked ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Ce mouvement est directement lié à une commande. Pour l'annuler,
                    veuillez annuler la commande depuis l'onglet <strong>Mes commandes</strong>.
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCancelling(true)}
                  className="w-full py-2.5 px-4 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Annuler ce mouvement (créer un mouvement inverse)
                </button>
              )}
            </div>
          )}

          {/* Cancellation Form */}
          {isCancelling && (
            <form
              onSubmit={handleCancelSubmit}
              className="p-4 bg-rose-50/60 border border-rose-200 rounded-2xl space-y-3"
            >
              <div className="flex items-center gap-2 text-rose-900 font-extrabold text-xs">
                <RotateCcw className="w-4 h-4 text-rose-600" />
                Confirmation d'annulation
              </div>
              <p className="text-[11px] text-rose-800 leading-relaxed">
                Règle d'immuabilité : un mouvement inverse de{' '}
                <strong>
                  {movement.quantite > 0
                    ? `−${movement.quantite}`
                    : `+${Math.abs(movement.quantite)}`}{' '}
                  unités
                </strong>{' '}
                sera enregistré pour rétablir exactement le stock.
              </p>

              {errorMsg && (
                <p className="text-xs font-bold text-rose-700">{errorMsg}</p>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Motif de l'annulation <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Ex: Erreur de saisie, fausse déclaration..."
                  className="w-full px-3 py-2 bg-white border border-rose-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCancelling(false)}
                  className="px-3 py-1.5 border border-slate-200 bg-white rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Retour
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-black shadow-sm cursor-pointer"
                >
                  Confirmer l'annulation
                </button>
              </div>
            </form>
          )}

          {/* Close button */}
          {!isCancelling && (
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
