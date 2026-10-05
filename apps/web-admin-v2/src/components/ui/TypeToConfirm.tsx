import React, { useState } from 'react';
import { Dialog, DialogContent } from './Dialog';
import { Button } from './Button';
import { Input } from './Input';
import { AlertTriangle } from 'lucide-react';

export interface TypeToConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  expectedValue: string;
  promptLabel: string;
  confirmLabel?: string;
  onConfirm: () => void;
  loading?: boolean;
}

export const TypeToConfirm: React.FC<TypeToConfirmProps> = ({
  open,
  onOpenChange,
  title,
  description,
  expectedValue,
  promptLabel,
  confirmLabel = 'حذف قطعی',
  onConfirm,
  loading = false,
}) => {
  const [typedValue, setTypedValue] = useState('');

  const isMatched = typedValue.trim() === expectedValue.trim();

  const handleClose = () => {
    if (!loading) {
      setTypedValue('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent title={title} showCloseButton={!loading}>
        <div className="space-y-4 text-start">
          <div className="flex items-start gap-3 p-3 bg-rose-50 dark:bg-rose-950/30 rounded-2xl border border-rose-100 dark:border-rose-900/40">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-800 dark:text-rose-200 leading-relaxed">
              {description}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {promptLabel}: <strong className="text-slate-900 dark:text-white select-all font-mono">{expectedValue}</strong>
            </p>
            <Input
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              placeholder={expectedValue}
              normalizeDigits={false}
              autoFocus
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button variant="outline" size="sm" disabled={loading} onClick={handleClose}>
              انصراف
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={!isMatched || loading}
              loading={loading}
              onClick={() => {
                onConfirm();
                setTypedValue('');
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
