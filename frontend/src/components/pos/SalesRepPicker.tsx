import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Lock, Plus, Search, UserRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  createCommercialLocal,
  lastCommercial,
  loadCommerciaux,
  useCommerciaux,
  type LocalCommercial,
} from '../../offline/commerciaux';

/** Au-delà, les puces cèdent la place à une liste avec recherche. */
const MAX_PUCES = 5;

interface SalesRepPickerProps {
  /** undefined = pas encore initialisé (pré-sélection à faire), null = aucun commercial. */
  value: string | null | undefined;
  onChange: (commercial: LocalCommercial | null) => void;
}

/**
 * « Vendu par » : à qui la vente est attribuée. Jamais obligatoire.
 *
 * - Vendeur qui est lui-même commercial : son nom, verrouillé (le serveur
 *   l'impose de toute façon).
 * - Propriétaire ou gestionnaire : libre, le dernier commercial choisi sur cet
 *   appareil est pré-sélectionné.
 */
export const SalesRepPicker: React.FC<SalesRepPickerProps> = ({ value, onChange }) => {
  const { currentUser, currentBusiness, settings } = useApp();
  const commerciaux = useCommerciaux();
  const businessId = currentBusiness?.id ?? null;
  const peutCreer = settings.role === 'OWNER' || settings.role === 'ACCOUNTANT';

  useEffect(() => {
    if (businessId) void loadCommerciaux(businessId);
  }, [businessId]);

  const moi = commerciaux.find((c) => currentUser && c.userId === currentUser.id) ?? null;
  const verrouille = settings.role === 'SELLER' && !!moi?.actif;
  const autres = useMemo(
    () => commerciaux.filter((c) => c.actif && c.id !== moi?.id).sort((a, b) => a.nom.localeCompare(b.nom)),
    [commerciaux, moi?.id]
  );

  // Pré-sélection, une fois par vente.
  useEffect(() => {
    if (value !== undefined) return;
    if (verrouille && moi) {
      onChange(moi);
      return;
    }
    const last = businessId ? lastCommercial(businessId) : null;
    onChange(commerciaux.find((c) => c.id === last && c.actif) ?? null);
  }, [value, verrouille, moi, businessId, commerciaux, onChange]);

  // Un vendeur commercial ne peut pas attribuer la vente à un collègue.
  useEffect(() => {
    if (verrouille && moi && value !== moi.id) onChange(moi);
  }, [verrouille, moi, value, onChange]);

  const [ajout, setAjout] = useState(false);
  const [nouveauNom, setNouveauNom] = useState('');
  const [listeOuverte, setListeOuverte] = useState(false);
  const [recherche, setRecherche] = useState('');

  const creer = () => {
    const nom = nouveauNom.trim();
    if (!nom) return;
    const cree = createCommercialLocal({ nom });
    onChange(cree);
    setNouveauNom('');
    setAjout(false);
    setListeOuverte(false);
  };

  const choisirMoi = () => {
    if (!currentUser) return;
    onChange(moi ?? createCommercialLocal({ nom: currentUser.nom, pourMoi: true, userId: currentUser.id }));
  };

  // Toucher la puce déjà choisie la retire : la vente reste « Non attribuée ».
  const basculer = (c: LocalCommercial) => onChange(value === c.id ? null : c);

  if (verrouille && moi) {
    return (
      <Section>
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-slate-100 border border-mc-line text-sm font-bold text-mc-ink">
          <Lock className="w-4 h-4 text-mc-soft" />
          <span>{moi.nom}</span>
        </div>
      </Section>
    );
  }

  const formulaireAjout = ajout && (
    <div className="flex gap-2">
      <input
        autoFocus
        value={nouveauNom}
        onChange={(e) => setNouveauNom(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            creer();
          }
        }}
        placeholder="Nom du commercial"
        maxLength={120}
        className="flex-1 min-w-0 px-3.5 py-2.5 rounded-2xl border border-mc-line text-sm focus:outline-none focus:border-[#5B4BF0]"
      />
      <button
        type="button"
        onClick={creer}
        disabled={!nouveauNom.trim()}
        className="px-4 py-2.5 rounded-2xl bg-mc-ink text-white text-xs font-bold cursor-pointer disabled:opacity-40"
      >
        Ajouter
      </button>
    </div>
  );

  // Aucun commercial : champ masqué, lien discret.
  if (autres.length === 0) {
    if (!peutCreer) return null;
    return (
      <div className="space-y-2">
        {!ajout ? (
          <button
            type="button"
            onClick={() => setAjout(true)}
            className="text-xs font-semibold text-[#5B4BF0] hover:underline cursor-pointer"
          >
            + Ajouter un commercial
          </button>
        ) : (
          <Section>{formulaireAjout}</Section>
        )}
      </div>
    );
  }

  const moiActif = moi?.actif ? moi : null;

  if (autres.length <= MAX_PUCES) {
    return (
      <Section>
        <div className="flex flex-wrap gap-2">
          {currentUser && (
            <Puce actif={!!moiActif && value === moiActif.id} onClick={() => (moiActif ? basculer(moiActif) : choisirMoi())}>
              Moi
            </Puce>
          )}
          {autres.map((c) => (
            <Puce key={c.id} actif={value === c.id} onClick={() => basculer(c)}>
              {c.nom}
            </Puce>
          ))}
          {peutCreer && !ajout && (
            <button
              type="button"
              onClick={() => setAjout(true)}
              className="px-3.5 py-2 rounded-full border border-dashed border-slate-300 text-xs font-bold text-mc-soft hover:text-mc-ink cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Nouveau
            </button>
          )}
        </div>
        {formulaireAjout}
      </Section>
    );
  }

  // 6 commerciaux et plus : liste avec recherche.
  const choisi = commerciaux.find((c) => c.id === value) ?? null;
  const q = recherche.trim().toLowerCase();
  const filtres = autres.filter((c) => !q || c.nom.toLowerCase().includes(q));
  return (
    <Section>
      <button
        type="button"
        onClick={() => setListeOuverte((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl border border-mc-line bg-white text-sm font-bold text-mc-ink cursor-pointer"
      >
        <span className={choisi ? '' : 'text-mc-soft font-semibold'}>
          {choisi ? (choisi.id === moi?.id ? `Moi (${choisi.nom})` : choisi.nom) : 'Non attribué'}
        </span>
        <ChevronDown className="w-4 h-4 text-mc-soft" />
      </button>
      {listeOuverte && (
        <div className="rounded-2xl border border-mc-line bg-white shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 border-b border-slate-100">
            <Search className="w-4 h-4 text-mc-soft" />
            <input
              autoFocus
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un commercial"
              className="flex-1 py-2.5 text-sm focus:outline-none"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            <LigneListe actif={!choisi} onClick={() => { onChange(null); setListeOuverte(false); }}>
              Non attribué
            </LigneListe>
            {currentUser && (
              <LigneListe
                actif={!!moiActif && value === moiActif.id}
                onClick={() => { choisirMoi(); setListeOuverte(false); }}
              >
                Moi
              </LigneListe>
            )}
            {filtres.map((c) => (
              <LigneListe key={c.id} actif={value === c.id} onClick={() => { onChange(c); setListeOuverte(false); }}>
                {c.nom}
              </LigneListe>
            ))}
          </ul>
          {peutCreer && (
            <div className="p-2 border-t border-slate-100">
              {!ajout ? (
                <button
                  type="button"
                  onClick={() => setAjout(true)}
                  className="w-full py-2 rounded-xl text-xs font-bold text-[#5B4BF0] hover:bg-slate-50 cursor-pointer flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Nouveau
                </button>
              ) : (
                formulaireAjout
              )}
            </div>
          )}
        </div>
      )}
    </Section>
  );
};

const Section: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="space-y-2">
    <label className="text-xs font-extrabold text-mc-soft uppercase tracking-wider flex items-center gap-1.5">
      <UserRound className="w-3.5 h-3.5" /> Vendu par
    </label>
    {children}
  </div>
);

const Puce: React.FC<{ actif: boolean; onClick: () => void; children: React.ReactNode }> = ({ actif, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={actif}
    className={`px-3.5 py-2 rounded-full border text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
      actif ? 'bg-mc-ink text-white border-slate-900' : 'bg-white text-slate-700 border-mc-line hover:bg-slate-100'
    }`}
  >
    {actif && <Check className="w-3.5 h-3.5" />}
    {children}
  </button>
);

const LigneListe: React.FC<{ actif: boolean; onClick: () => void; children: React.ReactNode }> = ({
  actif,
  onClick,
  children,
}) => (
  <li>
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3.5 py-2.5 text-sm flex items-center justify-between cursor-pointer hover:bg-slate-50 ${
        actif ? 'font-bold text-mc-ink' : 'text-slate-700'
      }`}
    >
      <span>{children}</span>
      {actif && <Check className="w-4 h-4 text-[#5B4BF0]" />}
    </button>
  </li>
);
