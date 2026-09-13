import React from 'react';
import { Check, Trash2, AlertTriangle, RectangleHorizontal } from 'lucide-react';
import {
  STANDARD_FORMATS,
  SIZE_SHORTCUTS,
  MAX_SAVED_SIZES,
  UNIT_LABELS,
  checkCustomSize,
  describePage,
  formatInUnit,
  layoutForWidth,
  pageForStandard,
  parseDimension,
  toMm,
  type PrintPageSpec,
  type PrintUnit,
  type ReceiptPrintFormat,
  type ReceiptPrintPrefs,
  type SavedPrintSize,
  type SizeCheck,
} from '../../utils/receiptPrint';

/**
 * Sélecteur de format d'impression.
 *
 * Contrôlé : l'état vit chez le parent (fenêtre « Imprimer », ou Réglages),
 * qui décide quand l'enregistrer. Le sélecteur ne fait qu'afficher et calculer.
 */

type StandardId = Exclude<ReceiptPrintFormat, 'CUSTOM'>;
export type PrintChoice = StandardId | 'CUSTOM' | `SAVED:${number}`;

export interface PrintDraft {
  choice: PrintChoice;
  unit: PrintUnit;
  /** Textes tels que saisis, dans l'unité affichée. */
  largeurText: string;
  hauteurText: string;
  saveAsName: boolean;
  name: string;
}

export function draftFromPrefs(prefs: ReceiptPrintPrefs): PrintDraft {
  const base: PrintDraft = {
    choice: prefs.formatImpression,
    unit: prefs.customUnite,
    largeurText: formatInUnit(prefs.customLargeurMm, prefs.customUnite),
    hauteurText: prefs.customHauteurMm ? formatInUnit(prefs.customHauteurMm, prefs.customUnite) : '',
    saveAsName: false,
    name: '',
  };
  if (prefs.formatImpression === 'CUSTOM') {
    const idx = prefs.taillesEnregistrees.findIndex(
      (t) => t.largeurMm === prefs.customLargeurMm && (t.hauteurMm ?? null) === (prefs.customHauteurMm ?? null)
    );
    if (idx >= 0) base.choice = `SAVED:${idx}`;
  }
  return base;
}

export interface ResolvedDraft {
  page: PrintPageSpec | null;
  check: SizeCheck;
  /** Libellé du bouton : il dit toujours ce qui va sortir. */
  buttonLabel: string;
  /** Ce qu'il faut mémoriser comme format par défaut (valeurs en mm). */
  prefs: Pick<ReceiptPrintPrefs, 'formatImpression' | 'customLargeurMm' | 'customHauteurMm' | 'customUnite'> | null;
}

export function resolveDraft(draft: PrintDraft, saved: SavedPrintSize[]): ResolvedDraft {
  if (draft.choice.startsWith('SAVED:')) {
    const size = saved[Number(draft.choice.slice(6))];
    if (!size) return { page: null, check: { ok: false, erreur: 'Taille introuvable.' }, buttonLabel: 'Imprimer', prefs: null };
    const page = { largeurMm: size.largeurMm, hauteurMm: size.hauteurMm };
    return {
      page,
      check: { ok: true },
      buttonLabel: `Imprimer en ${describePage(page)}`,
      prefs: { formatImpression: 'CUSTOM', customLargeurMm: size.largeurMm, customHauteurMm: size.hauteurMm, customUnite: draft.unit },
    };
  }
  if (draft.choice !== 'CUSTOM') {
    return {
      page: pageForStandard(draft.choice as StandardId),
      check: { ok: true },
      buttonLabel: 'Imprimer',
      prefs: { formatImpression: draft.choice as StandardId, customLargeurMm: 76, customHauteurMm: null, customUnite: draft.unit },
    };
  }

  const largeur = parseDimension(draft.largeurText);
  const hauteur = parseDimension(draft.hauteurText);
  const largeurMm = largeur === null ? null : toMm(largeur, draft.unit);
  const hauteurMm = hauteur === null ? null : toMm(hauteur, draft.unit);
  const check = checkCustomSize(largeurMm, hauteurMm, draft.hauteurText.trim() !== '');
  if (!check.ok || largeurMm === null) {
    return { page: null, check, buttonLabel: 'Imprimer', prefs: null };
  }
  // Stockage en millimètres entiers : c'est la précision d'une imprimante.
  const page = { largeurMm: Math.round(largeurMm), hauteurMm: hauteurMm ? Math.round(hauteurMm) : null };
  return {
    page,
    check,
    buttonLabel: `Imprimer en ${describePage(page)}`,
    prefs: { formatImpression: 'CUSTOM', customLargeurMm: page.largeurMm, customHauteurMm: page.hauteurMm, customUnite: draft.unit },
  };
}

// ── Miniature à l'échelle ────────────────────────────────────────────────────

/** Même échelle pour tous les formats : c'est ce qui rend la comparaison juste. */
const PX_PER_MM = 0.4;
/** Un ticket à hauteur automatique est dessiné comme s'il faisait 12 cm. */
const AUTO_HEIGHT_PREVIEW_MM = 120;

export const PageThumbnail: React.FC<{ page: PrintPageSpec | null }> = ({ page }) => {
  if (!page) {
    return (
      <div className="w-full h-[120px] rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400 text-center px-1">
        Taille à préciser
      </div>
    );
  }
  const w = Math.max(10, page.largeurMm * PX_PER_MM);
  const h = Math.max(20, (page.hauteurMm ?? AUTO_HEIGHT_PREVIEW_MM) * PX_PER_MM);
  const layout = layoutForWidth(page.largeurMm);
  const pad = layout === 'LARGE' ? 5 : 2;
  const lines = Math.max(3, Math.floor((h - 2 * pad - 14) / 5));

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="drop-shadow-sm" aria-label={`Aperçu ${describePage(page)}`}>
        <rect x="0.5" y="0.5" width={w - 1} height={h - 1} fill="#FFFFFF" stroke="#CBD5E1" strokeDasharray={page.hauteurMm ? undefined : '2 2'} />
        <rect x={w / 2 - Math.min(6, w / 5)} y={pad} width={Math.min(12, (2 * w) / 5)} height="3" fill="#0F172A" />
        {Array.from({ length: lines }).map((_, i) => {
          const y = pad + 8 + i * 5;
          if (layout === 'LARGE') {
            return <rect key={i} x={pad} y={y} width={w - 2 * pad} height="0.6" fill="#94A3B8" />;
          }
          const lineW = (w - 2 * pad) * (i % 3 === 2 ? 0.55 : 0.85);
          return <rect key={i} x={pad} y={y} width={lineW} height="1.4" fill="#94A3B8" />;
        })}
        <rect x={pad} y={h - pad - 4} width={w - 2 * pad} height="2.4" fill="#0F172A" />
      </svg>
      <span className="text-[10px] font-semibold text-slate-500 text-center leading-tight">{describePage(page)}</span>
    </div>
  );
};

// ── Sélecteur ────────────────────────────────────────────────────────────────

interface PrintFormatPickerProps {
  draft: PrintDraft;
  onChange: (draft: PrintDraft) => void;
  savedSizes: SavedPrintSize[];
  onDeleteSaved: (index: number) => void;
  /**
   * Fourni dans les Réglages : un bouton « Enregistrer » range la taille tout
   * de suite. Dans la fenêtre d'impression, elle est rangée au moment
   * d'imprimer.
   */
  onSaveSizeNow?: () => void;
}

export const PrintFormatPicker: React.FC<PrintFormatPickerProps> = ({
  draft,
  onChange,
  savedSizes,
  onDeleteSaved,
  onSaveSizeNow,
}) => {
  const resolved = resolveDraft(draft, savedSizes);
  const check = resolved.check;
  // `in` plutôt que `check.ok` : sans strictNullChecks, TypeScript ne resserre
  // pas une union sur un booléen.
  const checkMessage = 'erreur' in check ? check.erreur : check.avertissement;
  const set =(patch: Partial<PrintDraft>) => onChange({ ...draft, ...patch });
  const isCustom = draft.choice === 'CUSTOM';
  const canSaveMore = savedSizes.length < MAX_SAVED_SIZES;

  const changeUnit = (unit: PrintUnit) => {
    if (unit === draft.unit) return;
    // Convertir, jamais effacer : 76 mm → 7,6 cm → 2,99 po.
    const convert = (text: string) => {
      const v = parseDimension(text);
      return v === null ? text : formatInUnit(toMm(v, draft.unit), unit);
    };
    set({ unit, largeurText: convert(draft.largeurText), hauteurText: convert(draft.hauteurText) });
  };

  const optionClass = (selected: boolean) =>
    `w-full text-left px-3.5 py-3 rounded-[13px] border-[1.5px] transition-colors cursor-pointer flex items-center gap-3 ${
      selected ? 'border-[#4F46E5] bg-indigo-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
    }`;

  const Radio = ({ on }: { on: boolean }) => (
    <span
      className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center shrink-0 ${
        on ? 'border-[#4F46E5] bg-[#4F46E5]' : 'border-slate-300 bg-white'
      }`}
    >
      {on && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
    </span>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-3 items-start">
      <div className="space-y-2 min-w-0">
        <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">Quelle taille ?</p>

        {STANDARD_FORMATS.map((f) => {
          const on = draft.choice === f.id;
          return (
            <button key={f.id} type="button" onClick={() => set({ choice: f.id })} className={optionClass(on)}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13.5px] font-bold text-slate-900">{f.label}</span>
                  {f.id === '58' && (
                    <span className="text-[9.5px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-px">
                      Recommandé
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{f.aide}</div>
              </div>
              <Radio on={on} />
            </button>
          );
        })}

        {savedSizes.map((size, idx) => {
          const on = draft.choice === `SAVED:${idx}`;
          return (
            <div key={`${size.nom}-${idx}`} className={optionClass(on)} role="button" tabIndex={0}
              onClick={() => set({ choice: `SAVED:${idx}` })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') set({ choice: `SAVED:${idx}` });
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-bold text-slate-900 truncate">{size.nom}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{describePage(size)}</div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSaved(idx);
                }}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center shrink-0 cursor-pointer"
                title={`Supprimer « ${size.nom} »`}
                aria-label={`Supprimer ${size.nom}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <Radio on={on} />
            </div>
          );
        })}

        {/* Taille personnalisée : bordure pointillée tant qu'elle est repliée —
            ici on crée, on ne choisit pas. */}
        <div
          className={`rounded-[13px] border-[1.5px] border-[#4F46E5] bg-[#EEF2FF] ${isCustom ? 'border-solid' : 'border-dashed'}`}
        >
          <button
            type="button"
            onClick={() => set({ choice: 'CUSTOM' })}
            className="w-full text-left px-3.5 py-3 flex items-center gap-3 cursor-pointer"
            aria-expanded={isCustom}
          >
            <RectangleHorizontal className="w-5 h-5 text-[#4F46E5] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-bold text-slate-900">Taille personnalisée</div>
              <div className="text-[11px] text-slate-600 mt-0.5">Pour une imprimante qui n’est pas dans la liste</div>
            </div>
            <Radio on={isCustom} />
          </button>

          {isCustom && (
            <div className="px-3.5 pb-3.5 space-y-3">
              {/* a) Unité */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-white/80 rounded-xl border border-indigo-100">
                {(['mm', 'cm', 'po'] as PrintUnit[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => changeUnit(u)}
                    className={`py-1.5 rounded-lg text-[11.5px] font-bold transition-colors cursor-pointer ${
                      draft.unit === u ? 'bg-[#4F46E5] text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {u === 'mm' ? 'Millimètres' : u === 'cm' ? 'Centimètres' : 'Pouces'}
                  </button>
                ))}
              </div>

              {/* b) Largeur × hauteur */}
              <div className="flex items-end gap-2">
                <label className="flex-1 min-w-0">
                  <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Largeur</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draft.largeurText}
                    onChange={(e) => set({ largeurText: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-center text-[15px] font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-hidden"
                  />
                </label>
                <span className="pb-3 text-slate-400 font-bold">×</span>
                <label className="flex-1 min-w-0">
                  <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Hauteur</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draft.hauteurText}
                    placeholder="Auto"
                    onChange={(e) => set({ hauteurText: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-center text-[15px] font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-semibold focus:ring-2 focus:ring-indigo-500 outline-hidden"
                  />
                </label>
                <span className="pb-3 text-[12px] font-bold text-slate-500 w-6">{UNIT_LABELS[draft.unit]}</span>
              </div>
              <p className="text-[10.5px] text-slate-500 leading-snug">
                Laisse la hauteur vide pour un ticket qui s’adapte au nombre d’articles.
              </p>

              {/* c) Raccourcis */}
              <div className="flex flex-wrap gap-1.5">
                {SIZE_SHORTCUTS.map((sc) => (
                  <button
                    key={sc.label}
                    type="button"
                    onClick={() =>
                      set({
                        largeurText: formatInUnit(sc.largeurMm, draft.unit),
                        hauteurText: sc.hauteurMm ? formatInUnit(sc.hauteurMm, draft.unit) : '',
                      })
                    }
                    className="px-2.5 py-1 rounded-full bg-white border border-indigo-200 text-[11px] font-bold text-[#4F46E5] hover:bg-indigo-50 cursor-pointer"
                  >
                    {sc.label}
                  </button>
                ))}
              </div>

              {/* d) Avertissements, en direct */}
              {checkMessage && (
                <div className="flex items-start gap-2 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] text-[10.5px] font-medium px-2.5 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  <span>{checkMessage}</span>
                </div>
              )}

              {/* e) Enregistrer sous un nom */}
              <div className="space-y-2">
                <label className={`flex items-center gap-2 text-[11.5px] ${canSaveMore ? 'text-slate-700 cursor-pointer' : 'text-slate-400'}`}>
                  <input
                    type="checkbox"
                    checked={draft.saveAsName && canSaveMore}
                    disabled={!canSaveMore}
                    onChange={(e) => set({ saveAsName: e.target.checked })}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Enregistrer cette taille sous un nom</span>
                </label>
                {!canSaveMore && (
                  <p className="text-[10.5px] text-slate-500">
                    {MAX_SAVED_SIZES} tailles enregistrées au maximum : supprimes-en une pour en ajouter.
                  </p>
                )}
                {draft.saveAsName && canSaveMore && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={draft.name}
                      maxLength={40}
                      onChange={(e) => set({ name: e.target.value })}
                      placeholder="Mon imprimante du magasin"
                      className="flex-1 min-w-0 h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13px] text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-hidden"
                    />
                    {onSaveSizeNow && (
                      <button
                        type="button"
                        onClick={onSaveSizeNow}
                        disabled={!resolved.page || !draft.name.trim()}
                        className="h-10 px-3 rounded-xl bg-[#4F46E5] text-white text-[12px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                      >
                        Enregistrer
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="sticky top-0 pt-6">
        <PageThumbnail page={resolved.page} />
      </div>
    </div>
  );
};
