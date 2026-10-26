import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';

export interface SettingsSection {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** Libellés courts et groupes du menu ordinateur (le téléphone garde sa liste). */
const SECTION_META: Record<string, { label: string; group: string }> = {
  boutique: { label: 'Boutique', group: 'Ma boutique' },
  vente: { label: 'Ventes et caisse', group: 'Ma boutique' },
  categories: { label: 'Catégories', group: 'Ma boutique' },
  recus: { label: 'Reçus', group: 'Documents' },
  etiquettes: { label: 'Étiquettes', group: 'Documents' },
  affichage: { label: 'Écran d’accueil', group: 'Pour moi' },
  compte: { label: 'Mon compte', group: 'Pour moi' },
};

const GROUPS = ['Ma boutique', 'Documents', 'Pour moi'];

/**
 * Index de la recherche : ce que le commerçant tape (« remise », « logo »,
 * « mot de passe ») mène à la rubrique, puis à la ligne (`focus` = texte du
 * libellé à l'écran, mis en surbrillance).
 */
const INDEX: { section: string; titre: string; focus: string; mots?: string }[] = [
  { section: 'boutique', titre: 'Nom de la boutique', focus: 'Nom de la boutique' },
  { section: 'boutique', titre: 'Logo de la boutique', focus: 'Logo de la boutique', mots: 'image photo' },
  { section: 'boutique', titre: 'Type d’activité', focus: 'Type d', mots: 'commerce services' },
  { section: 'boutique', titre: 'Téléphone et adresse', focus: 'Ville ou quartier', mots: 'telephone ville quartier coordonnees whatsapp' },
  { section: 'boutique', titre: 'Fuseau horaire', focus: 'Fuseau horaire', mots: 'heure' },
  { section: 'recus', titre: 'Contenu des reçus', focus: 'Taille du texte', mots: 'recu ticket message merci qr' },
  { section: 'recus', titre: 'Format d’envoi des reçus', focus: 'Format d', mots: 'whatsapp pdf image impression' },
  { section: 'recus', titre: 'Numérotation des commandes', focus: 'Numérotation', mots: 'numero' },
  { section: 'etiquettes', titre: 'Format des étiquettes', focus: 'Format d’impression', mots: 'code barre prix planche' },
  { section: 'etiquettes', titre: 'Couleur des étiquettes', focus: 'Couleur de l', mots: 'etiquette' },
  { section: 'vente', titre: 'Remise maximale des vendeurs', focus: 'Remise maximale', mots: 'reduction rabais pourcentage' },
  { section: 'vente', titre: 'Vendre quand le stock est à zéro', focus: 'stock est à zéro', mots: 'stock negatif rupture' },
  { section: 'vente', titre: 'Écart de comptage', focus: 'unités manquantes', mots: 'inventaire comptage ecart' },
  { section: 'vente', titre: 'Dépense automatique à la réception', focus: 'Créer une dépense automatique', mots: 'achat marchandise reception' },
  { section: 'vente', titre: 'Fond de caisse habituel', focus: 'Fond de caisse', mots: 'caisse especes ouverture' },
  { section: 'vente', titre: 'Mode de caisse (libre ou stricte)', focus: 'Mode de caisse', mots: 'caisse ouverture fermeture' },
  { section: 'vente', titre: 'Suivre les ventes par commercial', focus: 'Suivre les ventes par commercial', mots: 'commercial vendeur vendu par equipe' },
  { section: 'categories', titre: 'Catégories de produits et de dépenses', focus: '', mots: 'categorie rayon famille' },
  { section: 'affichage', titre: 'Vue du tableau de bord', focus: 'Vue du tableau de bord', mots: 'accueil' },
  { section: 'affichage', titre: 'Période affichée par défaut', focus: 'Période affichée', mots: 'jour semaine mois' },
  { section: 'affichage', titre: 'Langue de l’application', focus: 'Langue', mots: 'francais' },
  { section: 'compte', titre: 'Mon nom', focus: 'Mon nom', mots: 'profil' },
  { section: 'compte', titre: 'Changer mon mot de passe', focus: 'Ancien mot de passe', mots: 'code pin securite' },
  { section: 'compte', titre: 'Appareils connectés', focus: 'appareils', mots: 'session telephone deconnecter' },
  { section: 'compte', titre: 'Télécharger toutes mes données', focus: 'Télécharger toutes mes données', mots: 'sauvegarde export' },
  { section: 'compte', titre: 'Fermer mon compte', focus: 'Fermer mon compte', mots: 'supprimer resilier' },
];

const normaliser = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ');

interface Props {
  sections: SettingsSection[];
  active: string;
  onOpen: (sectionId: string, focus?: string) => void;
}

/**
 * Menu des réglages sur ordinateur : court, groupé par thème, avec une
 * recherche qui mène directement au bon réglage. Les pages de réglages de
 * référence (Stripe, Shopify, Linear) suivent ce schéma : on ne lit pas un
 * menu de réglages, on le parcourt des yeux.
 */
export const SettingsDesktopNav: React.FC<Props> = ({ sections, active, onOpen }) => {
  const [q, setQ] = useState('');
  const visibles = new Set(sections.map((s) => s.id));

  const resultats = useMemo(() => {
    const n = normaliser(q.trim());
    if (n.length < 2) return [];
    return INDEX.filter(
      (e) => visibles.has(e.section) && normaliser(`${e.titre} ${e.mots ?? ''} ${SECTION_META[e.section]?.label ?? ''}`).includes(n)
    ).slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sections]);

  return (
    <nav aria-label="Rubriques des réglages" className="hidden lg:block w-64 shrink-0 sticky top-4 space-y-4">
      <div className="relative">
        <Search className="w-4 h-4 text-mc-soft absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          role="searchbox"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && resultats[0]) {
              onOpen(resultats[0].section, resultats[0].focus);
              setQ('');
            }
            if (e.key === 'Escape') setQ('');
          }}
          placeholder="Chercher un réglage"
          aria-label="Chercher un réglage"
          className="w-full h-10 pl-9 pr-8 rounded-xl border border-mc-line bg-white text-[14px] text-mc-ink placeholder:text-mc-soft focus:outline-none focus:ring-2 focus:ring-mc-primary"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            aria-label="Effacer la recherche"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer"
          >
            <X className="w-3.5 h-3.5 text-mc-soft" />
          </button>
        )}
      </div>

      {q.trim().length >= 2 ? (
        <div className="rounded-xl border border-mc-line bg-white overflow-hidden">
          {resultats.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-mc-soft">Aucun réglage ne correspond.</p>
          ) : (
            <ul>
              {resultats.map((r) => (
                <li key={`${r.section}-${r.titre}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpen(r.section, r.focus);
                      setQ('');
                    }}
                    className="w-full text-left px-3 py-2.5 hover:bg-mc-bg cursor-pointer"
                  >
                    <span className="block text-[13px] font-bold text-mc-ink">{r.titre}</span>
                    <span className="block text-[11px] text-mc-soft">{SECTION_META[r.section]?.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        GROUPS.map((groupe) => {
          const items = sections.filter((s) => SECTION_META[s.id]?.group === groupe);
          if (items.length === 0) return null;
          return (
            <div key={groupe} className="space-y-0.5">
              <p className="px-3 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-mc-soft">{groupe}</p>
              {items.map((s) => {
                const Icon = s.icon;
                const isActive = s.id === active;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onOpen(s.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full h-10 flex items-center gap-2.5 px-3 rounded-xl text-left text-[14px] cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-mc-primary-tint text-mc-primary-dark font-bold'
                        : 'text-slate-700 font-semibold hover:bg-white hover:text-mc-ink'
                    }`}
                  >
                    <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-mc-primary' : 'text-mc-soft'}`} />
                    <span className="truncate">{SECTION_META[s.id]?.label ?? s.id}</span>
                  </button>
                );
              })}
            </div>
          );
        })
      )}
    </nav>
  );
};
