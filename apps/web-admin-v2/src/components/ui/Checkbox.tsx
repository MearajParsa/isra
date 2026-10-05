import React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface CheckboxProps extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  label?: React.ReactNode;
}

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, label, id, ...props }, ref) => (
  <div className="flex items-center gap-2.5">
    <CheckboxPrimitive.Root
      ref={ref}
      id={id}
      className={twMerge(
        clsx(
          'peer h-5 w-5 shrink-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'data-[state=checked]:bg-[#251D59] dark:data-[state=checked]:bg-indigo-600 data-[state=checked]:border-[#251D59] dark:data-[state=checked]:border-indigo-600 data-[state=checked]:text-white',
          'transition-all cursor-pointer',
          className
        )
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <Check className="h-3.5 w-3.5 stroke-[3]" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
    {label && (
      <label htmlFor={id} className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
        {label}
      </label>
    )}
  </div>
));

Checkbox.displayName = CheckboxPrimitive.Root.displayName;
