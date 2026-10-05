import React, { useRef, useEffect } from 'react';
import { normalizeToLatinDigits } from '@/lib/format';

export interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  error?: boolean;
}

export const OtpInput: React.FC<OtpInputProps> = ({
  length = 5,
  value = '',
  onChange,
  disabled = false,
  autoFocus = true,
  error = false,
}) => {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus && inputsRef.current[0]) {
      inputsRef.current[0].focus();
    }
  }, [autoFocus]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const rawVal = e.target.value;
    const clean = normalizeToLatinDigits(rawVal).replace(/\D/g, '');

    if (!clean) {
      // Clear current cell
      const chars = value.split('');
      chars[index] = '';
      onChange(chars.join(''));
      return;
    }

    // Handle single digit or pasted sequence
    if (clean.length > 1) {
      const pasted = clean.slice(0, length);
      onChange(pasted);
      const nextIdx = Math.min(pasted.length, length - 1);
      inputsRef.current[nextIdx]?.focus();
      return;
    }

    // Single digit
    const chars = value.split('');
    chars[index] = clean;
    const nextVal = chars.join('').slice(0, length);
    onChange(nextVal);

    if (index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index > 0) {
      // In RTL, ArrowRight moves visually to the right, which is lower index
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text/plain');
    const clean = normalizeToLatinDigits(pastedData).replace(/\D/g, '').slice(0, length);
    if (clean) {
      onChange(clean);
      const nextIdx = Math.min(clean.length, length - 1);
      inputsRef.current[nextIdx]?.focus();
    }
  };

  return (
    <div className="flex items-center justify-center gap-2.5 sm:gap-3 dir-ltr" onPaste={handlePaste}>
      {Array.from({ length }).map((_, i) => {
        const char = value[i] || '';
        return (
          <input
            key={i}
            ref={(el) => {
              inputsRef.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={char}
            disabled={disabled}
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            onChange={(e) => handleChange(e, i)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={`w-12 h-14 sm:w-13 sm:h-15 text-center text-xl font-bold font-mono rounded-2xl border transition-all ${
              error
                ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300'
                : char
                ? 'border-indigo-600 bg-indigo-50/30 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white'
            } focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600 disabled:opacity-50`}
          />
        );
      })}
    </div>
  );
};
