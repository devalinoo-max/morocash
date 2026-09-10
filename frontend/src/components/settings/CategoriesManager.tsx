import React, { useCallback, useEffect, useState } from 'react';
import { Check, Lock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ApiError } from '../../api/client';
import {
  createCategory,
  deleteCategory,
  listCategories,
  moveCategoryProducts,
  renameCategory,
  type ApiCategory,
} from '../../api/categories';

type CategoryType = 'PRODUIT' | 'DEPENSE';

/**
 * Une seule page de gestion des catégories : deux listes côte à côte, Produits
 * et Dépenses, chaque ligne modifiable sur place, avec le nombre d'éléments qui
 * l'utilisent. Avant, l'écran modifiait une liste purement locale qui n'avait
 * aucun rapport avec les catégories réellement enregistrées — renommer ici ne
 * changeait rien au catalogue.
 */
export const CategoriesManager: React.FC = () => {
  const { showToast } = useApp();
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Catégorie dont la suppression a été refusée : on propose alors de
  // déplacer ses produits plutôt que de laisser le commerçant coincé.
  const [blocked, setBlocked] = useState<{ category: ApiCategory; usageCount: number } | null>(null);

  const reload = useCallback(async () => {
    try {
      setCategories(await listCategories());
    } catch {
      // Hors ligne : la gestion des catégories demande le serveur (elle touche
      // à des données partagées entre appareils). On laisse la liste vide et
      // l'écran explique pourquoi, plutôt que d'afficher un cache trompeur.
      setCategories([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async (nom: string, type: CategoryType) => {
    try {
      await createCategory(nom, type);
      await reload();
      showToast(`Catégorie « ${nom} » créée`, 'success');
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'Création impossible.', 'error');
    }
  };

  const handleRename = async (category: ApiCategory, nom: string) => {
    if (nom.trim() === category.nom) return;
    try {
      await renameCategory(category.id, nom.trim());
      await reload();
      showToast('Catégorie renommée — les produits suivent', 'success');
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'Renommage impossible.', 'error');
    }
  };

  const handleDelete = async (category: ApiCategory) => {
    try {
      await deleteCategory(category.id);
      await reload();
      showToast('Catégorie supprimée', 'info');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CATEGORY_IN_USE') {
        // Le serveur donne le motif chiffré : on l'affiche tel quel et on
        // propose le geste qui débloque, au lieu d'un simple refus.
        const details = error.details as { usageCount?: number } | undefined;
        showToast(error.message, 'warning');
        setBlocked({ category, usageCount: details?.usageCount ?? category.usageCount });
        return;
      }
      showToast(error instanceof ApiError ? error.message : 'Suppression impossible.', 'error');
    }
  };

  const handleMove = async (from: ApiCategory, toCategoryId: string | null) => {
    try {
      const moved = await moveCategoryProducts(from.id, toCategoryId);
      showToast(`${moved} produit${moved > 1 ? 's' : ''} déplacé${moved > 1 ? 's' : ''}`, 'success');
      setBlocked(null);
      await reload();
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'Déplacement impossible.', 'error');
    }
  };

  const productCategories = categories.filter((c) => c.type === 'PRODUIT');
  const expenseCategories = categories.filter((c) => c.type === 'DEPENSE');

  if (isLoading) {
    return <p className="text-xs text-slate-400 font-medium">Chargement des catégories…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CategoryColumn
          title="Produits"
          emptyHint="Aucune catégorie. Un produit sans catégorie se vend normalement."
          categories={productCategories}
          countLabel={(n) => `${n} produit${n > 1 ? 's' : ''}`}
          onCreate={(nom) => handleCreate(nom, 'PRODUIT')}
          onRename={handleRename}
          onDelete={handleDelete}
        />
        <CategoryColumn
          title="Dépenses"
          emptyHint="Aucune catégorie de dépense."
          categories={expenseCategories}
          countLabel={(n) => `${n} dépense${n > 1 ? 's' : ''}`}
          onCreate={(nom) => handleCreate(nom, 'DEPENSE')}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      </div>

      {blocked && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-xs font-bold text-amber-950">
            « {blocked.category.nom} » est utilisée par {blocked.usageCount} produit
            {blocked.usageCount > 1 ? 's' : ''}. Déplace-les d’abord, ou renomme-la.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-amber-900">
              Déplacer ces {blocked.usageCount} produit{blocked.usageCount > 1 ? 's' : ''} vers…
            </span>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value === '') return;
                void handleMove(blocked.category, e.target.value === '__none__' ? null : e.target.value);
              }}
              className="px-3 py-2 rounded-xl border border-amber-300 bg-white text-xs font-semibold text-slate-800 cursor-pointer"
            >
              <option value="">Choisir…</option>
              <option value="__none__">Sans catégorie</option>
              {productCategories
                .filter((c) => c.id !== blocked.category.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={() => setBlocked(null)}
              className="text-[11px] font-bold text-amber-900 hover:underline cursor-pointer px-2"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface CategoryColumnProps {
  title: string;
  emptyHint: string;
  categories: ApiCategory[];
  countLabel: (n: number) => string;
  onCreate: (nom: string) => void | Promise<void>;
  onRename: (category: ApiCategory, nom: string) => void | Promise<void>;
  onDelete: (category: ApiCategory) => void | Promise<void>;
}

const CategoryColumn: React.FC<CategoryColumnProps> = ({
  title,
  emptyHint,
  categories,
  countLabel,
  onCreate,
  onRename,
  onDelete,
}) => {
  const [draft, setDraft] = useState('');

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
        {title} ({categories.length})
      </h3>

      <div className="space-y-1.5">
        {categories.length === 0 && (
          <p className="text-[11px] text-slate-400 font-medium py-2">{emptyHint}</p>
        )}
        {categories.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            countLabel={countLabel}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
      </div>

      <div className="pt-1 flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !draft.trim()) return;
            e.preventDefault();
            void onCreate(draft.trim());
            setDraft('');
          }}
          placeholder="Nouvelle catégorie…"
          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-hidden"
        />
        <button
          type="button"
          disabled={!draft.trim()}
          onClick={() => {
            void onCreate(draft.trim());
            setDraft('');
          }}
          className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold cursor-pointer transition-colors"
          aria-label={`Ajouter une catégorie ${title.toLowerCase()}`}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

/** Une ligne, modifiable sur place — pas de modale pour renommer un mot. */
const CategoryRow: React.FC<{
  category: ApiCategory;
  countLabel: (n: number) => string;
  onRename: (category: ApiCategory, nom: string) => void | Promise<void>;
  onDelete: (category: ApiCategory) => void | Promise<void>;
}> = ({ category, countLabel, onRename, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(category.nom);

  useEffect(() => setDraft(category.nom), [category.nom]);

  const commit = () => {
    setIsEditing(false);
    if (draft.trim()) void onRename(category, draft);
    else setDraft(category.nom);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white">
      {isEditing ? (
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(category.nom);
              setIsEditing(false);
            }
          }}
          onBlur={commit}
          className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-indigo-200 text-xs font-semibold text-slate-900 outline-hidden focus:ring-2 focus:ring-indigo-500"
        />
      ) : (
        <>
          <span className="flex-1 min-w-0 truncate text-xs font-semibold text-slate-800">
            {category.nom}
          </span>
          <span className="text-[10px] font-bold text-slate-400 shrink-0">
            {countLabel(category.usageCount)}
          </span>
        </>
      )}

      {category.systeme ? (
        <span
          title="Catégorie de MoroCash : elle ne peut pas être supprimée"
          className="shrink-0 text-slate-400"
        >
          <Lock className="w-3.5 h-3.5" />
        </span>
      ) : isEditing ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={commit}
          className="shrink-0 p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 cursor-pointer"
          aria-label="Valider le nouveau nom"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
            aria-label={`Renommer ${category.nom}`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void onDelete(category)}
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
            aria-label={`Supprimer ${category.nom}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
};
