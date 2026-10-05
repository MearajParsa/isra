import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export type TableDensity = 'compact' | 'relaxed';

export const Table = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-x-auto">
      <table ref={ref} className={twMerge(clsx('w-full caption-bottom text-xs text-start', className))} {...props} />
    </div>
  )
);
Table.displayName = 'Table';

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={twMerge(clsx('border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60', className))} {...props} />
));
TableHeader.displayName = 'TableHeader';

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={twMerge(clsx('divide-y divide-slate-100 dark:divide-slate-800/60', className))} {...props} />
));
TableBody.displayName = 'TableBody';

export const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={twMerge(
      clsx(
        'transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 data-[state=selected]:bg-slate-100',
        className
      )
    )}
    {...props}
  />
));
TableRow.displayName = 'TableRow';

export const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & { density?: TableDensity }
>(({ className, density = 'relaxed', ...props }, ref) => (
  <th
    ref={ref}
    className={twMerge(
      clsx(
        'text-start font-semibold text-slate-500 dark:text-slate-400 select-none',
        density === 'compact' ? 'px-3 py-2 text-[11px]' : 'px-4 py-3 text-xs',
        className
      )
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

export const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & { density?: TableDensity }
>(({ className, density = 'relaxed', ...props }, ref) => (
  <td
    ref={ref}
    className={twMerge(
      clsx(
        'align-middle text-slate-700 dark:text-slate-200',
        density === 'compact' ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm',
        className
      )
    )}
    {...props}
  />
));
TableCell.displayName = 'TableCell';
