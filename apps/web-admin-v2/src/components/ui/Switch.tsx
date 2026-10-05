import React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface SwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  label?: string;
  description?: string;
}

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(({ className, label, description, id, ...props }, ref) => (
  <div className="flex items-center justify-between gap-3">
    {(label || description) && (
      <div className="text-start space-y-0.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-slate-800 dark:text-slate-200 cursor-pointer">
            {label}
          </label>
        )}
        {description && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>
    )}
    <SwitchPrimitive.Root
      ref={ref}
      id={id}
      className={twMerge(
        clsx(
          'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'data-[state=checked]:bg-[#251D59] dark:data-[state=checked]:bg-indigo-600 data-[state=unchecked]:bg-slate-200 dark:data-[state=unchecked]:bg-slate-700',
          className
        )
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={clsx(
          'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform',
          'data-[state=checked]:-translate-x-5 data-[state=unchecked]:translate-x-0'
        )}
      />
    </SwitchPrimitive.Root>
  </div>
));

Switch.displayName = SwitchPrimitive.Root.displayName;
