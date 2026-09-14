import type { Product } from '../types';
import { findProductByCode } from './productCodeLookup';

/**
 * Douchettes (lecteurs code-barres USB ou Bluetooth), sur ordinateur, tablette
 * ou iPhone.
 *
 * Une douchette se présente comme un clavier : elle « tape » le code en
 * quelques millisecondes, puis appuie sur Entrée. On la distingue d'une
 * personne par la vitesse — personne ne tape 13 chiffres à moins de 50 ms
 * d'intervalle.
 *
 * Piège fréquent en Afrique francophone : l'ordinateur est en AZERTY, la
 * douchette en QWERTY (réglage d'usine). Elle envoie la touche « 1 » du
 * clavier américain, l'ordinateur la lit comme « & » : « 3017620422003 »
 * arrivait sous la forme « "à&è&é)àééàà" ». On garde donc deux lectures : ce
 * que l'ordinateur a écrit (`typed`), et la touche physique pressée
 * (`physical`, e.code), qui ne dépend pas de la disposition du clavier.
 */

export interface ScanKeyEvent {
  key: string;
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  timeStamp: number;
}

export interface KeyboardScan {
  typed: string;
  physical: string;
}

/** Caractère de la touche PHYSIQUE, comme sur un clavier américain. */
function physicalChar(e: ScanKeyEvent): string {
  const { code } = e;
  let m = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (m) return m[1];
  m = /^Key([A-Z])$/.exec(code);
  if (m) return e.shiftKey ? m[1] : m[1].toLowerCase();
  const table: Record<string, string> = {
    Minus: e.shiftKey ? '_' : '-',
    NumpadSubtract: '-',
    Period: '.',
    NumpadDecimal: '.',
    Slash: '/',
    NumpadDivide: '/',
    Space: ' ',
    Equal: e.shiftKey ? '+' : '=',
    NumpadAdd: '+',
  };
  return table[code] ?? e.key;
}

export interface ScanBufferOptions {
  /** Écart maximal entre deux touches d'une même lecture. */
  maxGapMs?: number;
  /** Longueur minimale d'un code terminé par Entrée. */
  minLength?: number;
  /** Longueur minimale d'un code SANS Entrée final (douchette sans suffixe). */
  minLengthWithoutEnter?: number;
  /** Écart toléré entre les 3 premiers caractères (l'écran peut ralentir). */
  startGapMs?: number;
}

export function createKeyboardScanBuffer(options: ScanBufferOptions = {}) {
  const maxGapMs = options.maxGapMs ?? 50;
  const minLength = options.minLength ?? 4;
  const minLengthWithoutEnter = options.minLengthWithoutEnter ?? 6;
  const startGapMs = Math.max(maxGapMs, options.startGapMs ?? 300);

  let typed = '';
  let physical = '';
  let lastAt = Number.NEGATIVE_INFINITY;

  const reset = () => {
    typed = '';
    physical = '';
    lastAt = Number.NEGATIVE_INFINITY;
  };

  return {
    /** Nombre de caractères de la rafale en cours. */
    get length() {
      return typed.length;
    },

    /**
     * Une touche. Rend la lecture terminée quand Entrée (ou Tab) clôt une
     * rafale assez longue et assez rapide ; `inBurst` dit si la touche fait
     * partie d'une rafale de douchette (à ne pas laisser agir sur l'écran).
     */
    push(e: ScanKeyEvent): { scan: KeyboardScan | null; inBurst: boolean } {
      if (e.ctrlKey || e.altKey || e.metaKey) {
        reset();
        return { scan: null, inBurst: false };
      }
      // Maj seule : la douchette la presse pour écrire une majuscule.
      if (e.key === 'Shift' || e.key === 'CapsLock') return { scan: null, inBurst: typed.length > 0 };

      // Les deux premiers caractères arrivent encore dans le champ et le
      // font réagir (filtrage du catalogue) : l'écran peut retenir la touche
      // suivante bien plus que 50 ms. Tolérance sur ces deux intervalles
      // seulement ; la suite doit rester à vitesse de douchette, ce qu'aucune
      // personne ne tape.
      const gapLimit = typed.length > 0 && typed.length < 3 ? startGapMs : maxGapMs;
      const fast = e.timeStamp - lastAt <= gapLimit;

      if (e.key === 'Enter' || e.key === 'Tab') {
        const done = fast && typed.length >= minLength ? { typed, physical } : null;
        reset();
        return { scan: done, inBurst: Boolean(done) };
      }

      if (e.key.length !== 1) {
        reset();
        return { scan: null, inBurst: false };
      }

      if (!fast) {
        typed = '';
        physical = '';
      }
      typed += e.key;
      physical += physicalChar(e);
      lastAt = e.timeStamp;
      // Dès le 3e caractère rapide, c'est une douchette, pas quelqu'un qui tape.
      return { scan: null, inBurst: typed.length >= 3 };
    },

    /** À appeler après un silence : rend un code arrivé sans Entrée final. */
    flush(now: number): KeyboardScan | null {
      const done =
        typed.length >= minLengthWithoutEnter && now - lastAt > maxGapMs ? { typed, physical } : null;
      if (now - lastAt > maxGapMs) reset();
      return done;
    },
  };
}

const lisible = (s: string) => (s.match(/[A-Za-z0-9]/g) ?? []).length;

/**
 * Le code réellement lu par la douchette : celle des deux lectures qui ramène
 * un produit, sinon la plus lisible (celle qui ne contient pas « é&"' »).
 */
export function resolveKeyboardScan(
  products: Product[],
  scan: KeyboardScan
): { code: string; product: Product | undefined } {
  const typed = scan.typed.trim();
  const physical = scan.physical.trim();
  for (const code of [typed, physical]) {
    const product = code ? findProductByCode(products, code) : undefined;
    if (product) return { code, product };
  }
  return { code: lisible(physical) > lisible(typed) ? physical : typed, product: undefined };
}
