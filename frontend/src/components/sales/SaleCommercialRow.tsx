import React, { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Sale } from '../../types';
import { loadCommerciaux, useCommerciaux } from '../../offline/commerciaux';

/**
 * Commercial de la vente (suivi par commercial activé). Le propriétaire, et
 * lui seul, peut le corriger : le serveur trace qui, quand, ancien, nouveau.
 */
export const SaleCommercialRow: React.FC<{ sale: Sale }> = ({ sale }) => {
  const { settings, currentUser, currentBusiness, setSaleCommercial, isSalePending } = useApp();
  const commerciaux = useCommerciaux();
  const [edition, setEdition] = useState(false);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (currentBusiness?.id) void loadCommerciaux(currentBusiness.id);
  }, [currentBusiness?.id]);

  if (!settings.suiviCommercialActif) return null;

  const estProprietaire = currentUser?.role === 'OWNER';
  const actuel = commerciaux.find((c) => c.id === sale.commercialId) ?? null;
  // Un commercial pas encore envoyé n'est pas encore connu du serveur.
  const choix = commerciaux.filter((c) => !c.pending && (c.actif || c.id === sale.commercialId));
  // Une vente encore en attente d'envoi n'existe pas côté serveur : rien à corriger.
  const peutCorriger = estProprietaire && !isSalePending(sale.id);

  const changer = async (valeur: string) => {
    setEnCours(true);
    const ok = await setSaleCommercial(sale.id, valeur || null);
    setEnCours(false);
    if (ok) setEdition(false);
  };

  return (
    <section className="bg-white rounded-2xl border border-mc-line p-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <UserRound className="w-4 h-4 text-mc-soft shrink-0" />
        <div className="min-w-0">
          <div className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">Commercial</div>
          {edition ? (
            <select
              autoFocus
              disabled={enCours}
              defaultValue={sale.commercialId ?? ''}
              onChange={(e) => void changer(e.target.value)}
              className="mt-1 px-2 py-1 rounded-lg border border-mc-line text-xs font-bold text-mc-ink bg-white"
            >
              <option value="">Non attribué</option>
              {choix.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                  {c.actif ? '' : ' (inactif)'}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-[12px] font-bold text-mc-ink mt-0.5 truncate">
              {actuel?.nom ?? (sale.commercialId ? 'Commercial' : 'Non attribué')}
            </div>
          )}
        </div>
      </div>
      {peutCorriger && (
        <button
          type="button"
          onClick={() => setEdition((v) => !v)}
          disabled={enCours}
          className="shrink-0 text-xs font-bold text-[#5B4BF0] hover:underline cursor-pointer disabled:opacity-50"
        >
          {edition ? 'Fermer' : 'Changer'}
        </button>
      )}
    </section>
  );
};
