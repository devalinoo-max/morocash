import React, { useRef } from 'react';

interface PinInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
}

/**
 * Grille de cases PIN avec avance/retour automatique entre champs.
 *
 * La saisie s'arrête net au 6e chiffre : chaque case n'accepte qu'un caractère
 * (maxLength=1), donc taper un 7e chiffre ne fait plus rien — ni ajout, ni
 * remplacement silencieux du code déjà saisi. Le serveur refuse de son côté
 * tout PIN dont la longueur n'est pas exactement 6 (voir registerSchema,
 * loginSchema, createEmployeeSchema).
 */
export const PinInput: React.FC<PinInputProps> = ({
  value,
  onChange,
  length = 6,
  autoFocus = false,
  disabled = false,
  id,
}) => {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const focusAfter = (filledCount: number) => {
    inputsRef.current[Math.min(filledCount, length - 1)]?.focus();
  };

  /** Remplit à partir de `index` et tronque à `length` — jamais un chiffre de plus. */
  const fillFrom = (index: number, clean: string) => {
    const next = (digits.slice(0, index).join('') + clean).slice(0, length);
    onChange(next);
    focusAfter(next.length);
  };

  const setDigitAt = (index: number, digit: string) => {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join('').replace(/[^0-9]/g, '').slice(0, length));
  };

  const handleChange = (index: number, raw: string) => {
    const clean = raw.replace(/\D/g, '');
    if (!clean) {
      setDigitAt(index, '');
      return;
    }
    // Certains claviers mobiles envoient plusieurs caractères d'un coup.
    if (clean.length > 1) {
      fillFrom(index, clean);
      return;
    }
    setDigitAt(index, clean);
    if (index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const clean = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!clean) return;
    e.preventDefault();
    fillFrom(index, clean);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  return (
    <div id={id} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={1}
          autoFocus={autoFocus && index === 0}
          disabled={disabled}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onPaste={(e) => handlePaste(index, e)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          className="pin-box h-12 w-full text-center text-lg font-black font-mono border border-slate-200 rounded-xl bg-slate-50/60 text-slate-900 transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4338CA] focus:border-[#4338CA] disabled:opacity-50"
        />
      ))}
    </div>
  );
};
