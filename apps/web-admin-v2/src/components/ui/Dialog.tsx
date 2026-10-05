import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export interface DialogContentProps extends Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'title'> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  showCloseButton?: boolean;
}

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, title, description, showCloseButton = true, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs transition-opacity animate-in fade-in" />
    <DialogPrimitive.Content
      ref={ref}
      className={twMerge(
        clsx(
          'fixed start-[50%] top-[50%] z-50 translate-x-[50%] -translate-y-1/2 w-[calc(100%-2rem)] max-w-lg',
          'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-2xl',
          'duration-200 animate-in fade-in-0 zoom-in-95 focus:outline-none max-h-[90vh] overflow-y-auto',
          className
        )
      )}
      {...props}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          {title && (
            <DialogPrimitive.Title className="text-base font-bold text-slate-900 dark:text-white">
              {title}
            </DialogPrimitive.Title>
          )}
          {description && (
            <DialogPrimitive.Description className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              {description}
            </DialogPrimitive.Description>
          )}
        </div>
        {showCloseButton && (
          <DialogPrimitive.Close className="rounded-xl p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none">
            <X className="w-5 h-5" />
            <span className="sr-only">بستن</span>
          </DialogPrimitive.Close>
        )}
      </div>
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));

DialogContent.displayName = DialogPrimitive.Content.displayName;
