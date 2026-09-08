import React, { useEffect, useRef, useState } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import { listProductCategories } from '../../api/products';
import type { ApiCategory } from '../../api/expenses';

interface CategoryComboboxProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Texte libre (le "+" rappelle qu'on peut taper une catégorie inédite — elle
 * sera créée à l'enregistrement du produit, voir resolveProductCategoryId) +
 * flèche qui déroule la liste des catégories déjà utilisées par la boutique.
 */
export const CategoryCombobox: React.FC<CategoryComboboxProps> = ({ value, onChange }) => {
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listProductCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const query = value.trim().toLowerCase();
  const filtered = query
    ? categories.filter((c) => c.nom.toLowerCase().includes(query))
    : categories;
  const exactMatch = categories.some((c) => c.nom.toLowerCase() === query);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Plus className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Alimentation, Boissons, etc."
          className="w-full pl-8 pr-8 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold"
        />
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
          aria-label="Voir les catégories existantes"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg py-1">
          {query && !exactMatch && (
            <button
              type="button"
              onClick={() => {
                onChange(value.trim());
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-bold text-[#4F46E5] hover:bg-indigo-50 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Créer "{value.trim()}"</span>
            </button>
          )}

          {filtered.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                onChange(cat.nom);
                setIsOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              {cat.nom}
            </button>
          ))}

          {filtered.length === 0 && !query && (
            <p className="px-3 py-2 text-[11px] text-slate-400">
              Aucune catégorie pour l'instant — tape pour en créer une.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
