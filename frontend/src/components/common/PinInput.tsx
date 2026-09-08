import React, { useRef } from 'react';

interface PinInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
}

/** Grille de cases PIN avec avance/retour automatique entre champs. */
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

  const setDigitAt = (index: number, digit: string) => {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join('').replace(/[^0-9]/g, ''));
  };

  const handleChange = (index: number, raw: string) => {
    const clean = raw.replace(/\D/g, '');
    if (!clean) {
      setDigitAt(index, '');
      return;
    }
    // Permet de coller un code complet dans n'importe quelle case.
    if (clean.length > 1) {
      onChange(clean.slice(0, length));
      const lastFilled = Math.min(clean.length, length) - 1;
      inputsRef.current[lastFilled]?.focus();
      return;
    }
    setDigitAt(index, clean);
    if (index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
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
          maxLength={length}
          autoFocus={autoFocus && index === 0}
          disabled={disabled}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          className="pin-box h-12 w-full text-center text-lg font-black font-mono border border-slate-200 rounded-xl bg-slate-50/60 text-slate-900 transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4338CA] focus:border-[#4338CA] disabled:opacity-50"
        />
      ))}
    </div>
  );
};
