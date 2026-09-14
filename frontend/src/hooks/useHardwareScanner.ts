import { useEffect, useRef, type RefObject } from 'react';
import { createKeyboardScanBuffer, type KeyboardScan } from '../utils/hardwareScanner';

/**
 * Écoute une douchette (lecteur code-barres USB/Bluetooth) sur l'écran courant.
 *
 * Plusieurs écrans peuvent écouter à la fois (la caisse, puis la fenêtre de
 * scan ouverte par-dessus) : seul le plus récent reçoit le code. La saisie
 * normale n'est jamais détournée — un code « tapé » par la douchette dans un
 * champ ordinaire (nom, prix, code-barres du formulaire produit) y reste. Les
 * champs faits pour recevoir un scan portent `data-scanner-input` : la lecture
 * y est interceptée, le champ retrouve sa valeur d'avant, et l'écran traite le
 * code comme un scan caméra.
 */

type Listener = {
  onScan: RefObject<(scan: KeyboardScan) => void>;
  scope?: RefObject<HTMLElement | null>;
};

const listeners: Listener[] = [];
let installed = false;

function isEditable(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  return el instanceof HTMLInputElement && !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file'].includes(el.type);
}

function setNativeValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  // React suit la valeur via le setter du prototype : on passe par lui, puis
  // on émet « input » pour que l'état du composant suive.
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const buffer = createKeyboardScanBuffer();
  let burstField: { el: HTMLInputElement | HTMLTextAreaElement; before: string } | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  const deliver = (scan: KeyboardScan, target: EventTarget | null) => {
    if (burstField) setNativeValue(burstField.el, burstField.before);
    burstField = null;
    const scoped =
      target instanceof Node ? [...listeners].reverse().find((l) => l.scope?.current?.contains(target)) : undefined;
    const listener = scoped ?? listeners[listeners.length - 1];
    listener?.onScan.current?.(scan);
  };

  window.addEventListener(
    'keydown',
    (e) => {
      if (listeners.length === 0) return;
      const target = e.target;
      // Champ ordinaire : la saisie lui appartient.
      if (isEditable(target) && !target.closest('[data-scanner-input]')) {
        buffer.flush(Number.POSITIVE_INFINITY);
        burstField = null;
        return;
      }

      const { scan, inBurst } = buffer.push(e);
      // Premier caractère d'une nouvelle rafale : valeur du champ juste avant.
      if (buffer.length === 1 && e.key.length === 1) {
        burstField =
          target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
            ? { el: target, before: target.value }
            : null;
      }

      if (scan) {
        e.preventDefault();
        e.stopPropagation();
        clearTimeout(flushTimer);
        deliver(scan, target);
        return;
      }
      if (inBurst && e.key.length === 1) {
        // La suite de la rafale n'a pas à s'écrire à l'écran.
        e.preventDefault();
      }

      clearTimeout(flushTimer);
      flushTimer = setTimeout(() => {
        const sansEntree = buffer.flush(performance.now());
        if (sansEntree) deliver(sansEntree, target);
        else if (buffer.length === 0) burstField = null;
      }, 120);
    },
    true
  );
}

export function useHardwareScanner(
  onScan: (scan: KeyboardScan) => void,
  options: { enabled?: boolean; scope?: RefObject<HTMLElement | null> } = {}
) {
  const enabled = options.enabled ?? true;
  const handler = useRef(onScan);
  handler.current = onScan;
  const scope = options.scope;

  useEffect(() => {
    if (!enabled) return;
    install();
    const listener: Listener = { onScan: handler, scope };    listeners.push(listener);
    return () => {
      const i = listeners.indexOf(listener);
      if (i >= 0) listeners.splice(i, 1);
    };
  }, [enabled, scope]);
}
