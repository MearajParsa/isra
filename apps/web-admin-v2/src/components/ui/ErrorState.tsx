import React from 'react';
import { AlertTriangle, RefreshCw, Copy, Check } from 'lucide-react';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  error?: unknown;
  onRetry?: () => void;
  requestId?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'خطا در بارگذاری اطلاعات',
  message,
  error,
  onRetry,
  requestId,
}) => {
  const [copied, setCopied] = React.useState(false);

  let displayMessage = message;
  let supportCode = requestId;

  if (error && typeof error === 'object') {
    const err = error as { message?: string; getReasonMessage?: () => string; requestId?: string; code?: string };
    if (typeof err.getReasonMessage === 'function') {
      displayMessage = err.getReasonMessage();
    } else if (err.message) {
      displayMessage = err.message;
    }
    if (err.requestId) {
      supportCode = err.requestId;
    }
  }

  if (!displayMessage) {
    displayMessage = 'سرویس موقتاً در دسترس نیست؛ چند لحظه بعد دوباره تلاش کنید.';
  }

  const handleCopy = () => {
    if (supportCode) {
      navigator.clipboard.writeText(supportCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-2xl border border-rose-100 dark:border-rose-950/50 bg-rose-50/30 dark:bg-rose-950/10">
      <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-3">
        <AlertTriangle className="w-6 h-6 stroke-[1.5]" />
      </div>
      <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">{title}</h3>
      <p className="text-xs text-rose-700 dark:text-rose-300 max-w-md mb-4 leading-relaxed">{displayMessage}</p>

      <div className="flex items-center gap-3">
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} icon={<RefreshCw className="w-3.5 h-3.5" />}>
            تلاش مجدد
          </Button>
        )}
        {supportCode && (
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>کد پشتیبانی: {supportCode.slice(0, 8)}</span>
          </button>
        )}
      </div>
    </div>
  );
};
