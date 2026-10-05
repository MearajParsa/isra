import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface UpdateToastProps {
  show: boolean;
  onUpdate: () => void;
}

export const UpdateToast: React.FC<UpdateToastProps> = ({ show, onUpdate }) => {
  if (!show) return null;

  return (
    <div className="fixed top-4 start-1/2 -translate-x-1/2 z-50 p-3 px-4 bg-[#251D59] text-white rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-4">
      <RefreshCw className="w-4 h-4 animate-spin text-indigo-300 shrink-0" />
      <span className="text-xs font-medium">نسخهٔ جدید سامانه آماده است.</span>
      <Button
        variant="secondary"
        size="sm"
        onClick={onUpdate}
        className="h-8 text-xs py-1 px-3 bg-white text-slate-900 hover:bg-slate-100"
      >
        به‌روزرسانی
      </Button>
    </div>
  );
};
