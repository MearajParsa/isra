import React, { useId } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, id: customId, ...props }, ref) => {
    const generatedId = useId();
    const id = customId || generatedId;

    return (
      <div className="w-full space-y-1.5 text-start">
        {label && (
          <label htmlFor={id} className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <select
            ref={ref}
            id={id}
            className={twMerge(
              clsx(
                'w-full h-11 ps-3.5 pe-10 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl transition-all appearance-none cursor-pointer',
                'focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800 dark:text-slate-100',
                error && 'border-rose-500',
                className
              )
            )}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled} className="bg-white dark:bg-slate-900 py-1.5">
                {opt.label}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 end-0 flex items-center pe-3.5 pointer-events-none text-slate-400">
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
        {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
