import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import {
  NO_CATEGORY_LABEL,
  createCategory,
  listProductCategories,
  type ApiCategory,
} from '../../api/categories';

interface CategorySelectProps {
  /** Nom de la catégorie choisie, ou chaîne vide pour « Sans catégorie ». */
  value: string;
  onChange: (value: string) => void;
}

/**
 * Choix de la catégorie d'un produit.
 *
 * Trois règles, dans cet ordre d'importance :
 *   1. « Sans catégorie » est en tête de liste et c'est un choix normal — on
 *      ne bloque jamais une création de produit pour une histoire de rangement.
 *   2. On crée une catégorie depuis l'endroit où on en a besoin : « + Créer
 *      une nouvelle catégorie » ouvre un champ ici même, sans quitter le
 *      formulaire ni aller dans les réglages.
 *   3. Un seul niveau. Pas de sous-catégories.
 */
export const CategorySelect: React.FC<CategorySelectProps> = ({ value, onChange }) => {
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draftInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listProductCategories()
      .then(setCategories)
      // Hors ligne : on garde la liste vide, la saisie libre reste possible et
      // la catégorie sera créée à l'envoi de la file d'attente.
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isCreating) draftInputRef.current?.focus();
  }, [isCreating]);

  const select = (nom: string) => {
    onChange(nom);
    setIsOpen(false);
    setIsCreating(false);
    setError(null);
  };

  const confirmCreate = async () => {
    const nom = draftName.trim();
    if (!nom) return;

    // Déjà présente (à la casse et aux accents près) : on la sélectionne au
    // lieu de refuser — le commerçant voulait juste ranger son produit.
    const normalize = (s: string) =>
      s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const existing = categories.find((c) => normalize(c.nom) === normalize(nom));
    if (existing) {
      select(existing.nom);
      setDraftName('');
      return;
    }

    try {
      const created = await createCategory(nom, 'PRODUIT');
      setCategories((prev) => [...prev, created].sort((a, b) => a.nom.localeCompare(b.nom)));
      select(created.nom);
    } catch {
      // Hors ligne ou serveur indisponible : on sélectionne quand même le nom.
      // La catégorie sera créée en même temps que le produit, à l'envoi.
      select(nom);
    }
    setDraftName('');
  };

  const label = value.trim() || NO_CATEGORY_LABEL;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 cursor-pointer hover:border-slate-300"
      >
        <span className={value.trim() ? '' : 'text-slate-400'}>{label}</span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg py-1">
          <Option selected={!value.trim()} onSelect={() => select('')} muted>
            {NO_CATEGORY_LABEL}
          </Option>

          {categories.map((cat) => (
            <Option key={cat.id} selected={cat.nom === value} onSelect={() => select(cat.nom)}>
              {cat.nom}
            </Option>
          ))}

          <div className="border-t border-slate-100 mt-1 pt-1">
            {isCreating ? (
              <div className="px-2 py-1.5 space-y-1.5">
                <input
                  ref={draftInputRef}
                  type="text"
                  value={draftName}
                  onChange={(e) => {
                    setDraftName(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void confirmCreate();
                    }
                    if (e.key === 'Escape') setIsCreating(false);
                  }}
                  placeholder="Nom de la catégorie"
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
                />
                {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
                <button
                  type="button"
                  onClick={() => void confirmCreate()}
                  className="w-full py-2 rounded-lg bg-[#4F46E5] hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                >
                  Créer et choisir
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-bold text-[#4F46E5] hover:bg-indigo-50 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>Créer une nouvelle catégorie</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const Option: React.FC<{
  selected: boolean;
  muted?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}> = ({ selected, muted = false, onSelect, children }) => (
  <button
    type="button"
    onClick={onSelect}
    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold cursor-pointer hover:bg-slate-50 ${
      muted ? 'text-slate-500' : 'text-slate-700'
    }`}
  >
    <span className="truncate">{children}</span>
    {selected && <Check className="w-3.5 h-3.5 text-[#4F46E5] shrink-0" />}
  </button>
);
