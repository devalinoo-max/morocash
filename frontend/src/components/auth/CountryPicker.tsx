import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js/max';

/** Tous les pays que libphonenumber-js connaît, avec drapeau, nom français et indicatif. */
export interface PhoneCountry {
  code: CountryCode;
  name: string;
  dialCode: string;
  flag: string;
}

const regionNames =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['fr'], { type: 'region' }) : null;

function flagOf(code: string): string {
  return String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

export const PHONE_COUNTRIES: PhoneCountry[] = getCountries()
  .map((code) => ({
    code,
    name: regionNames?.of(code) ?? code,
    dialCode: `+${getCountryCallingCode(code)}`,
    flag: flagOf(code),
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface CountryPickerProps {
  value: CountryCode;
  onChange: (code: CountryCode) => void;
  disabled?: boolean;
}

/** Sélecteur drapeau + indicatif, avec recherche par nom (ou par indicatif). */
export const CountryPicker: React.FC<CountryPickerProps> = ({ value, onChange, disabled }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const current = PHONE_COUNTRIES.find((c) => c.code === value) ?? PHONE_COUNTRIES[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return PHONE_COUNTRIES;
    return PHONE_COUNTRIES.filter(
      (c) => normalize(c.name).includes(q) || c.dialCode.includes(q) || c.code.toLowerCase() === q
    );
  }, [query]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Indicatif pays : ${current.name} ${current.dialCode}`}
        onClick={() => {
          setQuery('');
          setOpen((o) => !o);
        }}
        className="h-12 bg-slate-50 pl-3 pr-2 flex items-center gap-1 text-sm font-bold text-slate-600 border-r border-mc-line cursor-pointer disabled:opacity-60"
      >
        <span aria-hidden>{current.flag}</span>
        <span>{current.dialCode}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-[min(18rem,calc(100vw-3rem))] rounded-xl border border-mc-line bg-white shadow-xl">
          <div className="flex items-center gap-2 px-3 border-b border-mc-line">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un pays"
              aria-label="Rechercher un pays"
              className="w-full h-11 text-sm outline-none"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {results.length === 0 && <li className="px-3 py-3 text-xs text-slate-400">Aucun pays trouvé.</li>}
            {results.map((c) => (
              <li key={c.code} role="option" aria-selected={c.code === value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(c.code);
                    setOpen(false);
                  }}
                  className={`w-full min-h-11 px-3 flex items-center gap-2 text-left text-sm hover:bg-slate-50 cursor-pointer ${
                    c.code === value ? 'font-bold text-mc-ink' : 'text-slate-700'
                  }`}
                >
                  <span aria-hidden>{c.flag}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-slate-400">{c.dialCode}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
