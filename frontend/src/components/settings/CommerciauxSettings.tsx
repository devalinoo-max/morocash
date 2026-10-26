import React, { useEffect, useState } from 'react';
import { Plus, UserRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  createCommercialLocal,
  loadCommerciaux,
  updateCommercialRemote,
  useCommerciaux,
} from '../../offline/commerciaux';

/**
 * Réglages → « Suivre les ventes par commercial ».
 *
 * Désactivé (défaut) : rien d'autre ne s'affiche, nulle part. Activé : liste
 * des commerciaux, ajout (nom obligatoire, téléphone facultatif) et passage
 * actif / inactif. Un commercial n'est jamais supprimé : inactif, il sort du
 * sélecteur de vente mais ses ventes passées restent comptées.
 */
export const CommerciauxSettings: React.FC = () => {
  const { settings, currentBusiness, updateSuiviCommercial, showToast } = useApp();
  const actif = !!settings.suiviCommercialActif;
  const commerciaux = useCommerciaux();
  const [enCours, setEnCours] = useState(false);
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');

  useEffect(() => {
    if (actif && currentBusiness?.id) void loadCommerciaux(currentBusiness.id);
  }, [actif, currentBusiness?.id]);

  const basculer = async () => {
    setEnCours(true);
    await updateSuiviCommercial(!actif);
    setEnCours(false);
  };

  const ajouter = () => {
    if (!nom.trim()) return;
    createCommercialLocal({ nom, telephone: telephone || undefined });
    showToast(`${nom.trim()} ajouté aux commerciaux`, 'success');
    setNom('');
    setTelephone('');
  };

  const changerActif = async (id: string, valeur: boolean) => {
    try {
      await updateCommercialRemote(id, { actif: valeur });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Modification impossible.', 'error');
    }
  };

  return (
    <div className="mc-setting-row p-4 rounded-2xl border border-mc-line bg-mc-bg/50 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <label className="text-[14px] font-bold text-mc-ink">Suivre les ventes par commercial</label>
          <p className="text-[12px] text-mc-soft mt-0.5 leading-relaxed">
            À chaque vente, tu choisis qui a vendu. Tu vois ensuite dans Rapports combien chacun a vendu et encaissé.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={actif}
          disabled={enCours}
          onClick={() => void basculer()}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
            actif ? 'bg-mc-primary' : 'bg-slate-300'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              actif ? 'translate-x-5' : ''
            }`}
          />
        </button>
      </div>

      {actif && (
        <div className="space-y-3 pt-1">
          {commerciaux.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-xl border border-mc-line bg-white">
              {commerciaux.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <UserRound className="w-4 h-4 text-mc-soft shrink-0" />
                    <div className="min-w-0">
                      <p className={`text-sm font-bold truncate ${c.actif ? 'text-mc-ink' : 'text-slate-400'}`}>
                        {c.nom}
                        {c.userId && <span className="ml-1.5 text-[10px] font-semibold text-mc-soft">(a un compte)</span>}
                      </p>
                      {c.telephone && <p className="text-[11px] text-mc-soft">{c.telephone}</p>}
                    </div>
                  </div>
                  {c.pending ? (
                    <span className="text-[11px] font-semibold text-amber-700">En attente d’envoi</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void changerActif(c.id, !c.actif)}
                      className="shrink-0 text-xs font-bold text-[#5B4BF0] hover:underline cursor-pointer"
                    >
                      {c.actif ? 'Désactiver' : 'Réactiver'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Nom du commercial"
              maxLength={120}
              className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-mc-line bg-white text-sm focus:ring-2 focus:ring-mc-primary"
            />
            <input
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              placeholder="Téléphone (facultatif)"
              inputMode="tel"
              maxLength={30}
              className="sm:w-44 px-3 py-2 rounded-xl border border-mc-line bg-white text-sm focus:ring-2 focus:ring-mc-primary"
            />
            <button
              type="button"
              onClick={ajouter}
              disabled={!nom.trim()}
              className="px-4 py-2 rounded-xl bg-mc-ink text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" /> Ajouter
            </button>
          </div>
          <p className="text-[11px] text-mc-soft">
            Un employé avec un compte peut aussi être commercial : coche « Commercial » sur sa fiche (Équipe). Ses
            ventes lui sont alors attribuées d’office.
          </p>
        </div>
      )}
    </div>
  );
};
