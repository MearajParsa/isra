import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { toPersianDigits } from '@/lib/format';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  duration?: number;
  countdownSec?: number;
  requestId?: string;
}

interface ToastContextType {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, 'id'>) => string;
  removeToast: (id: string) => void;
  showSuccess: (message: string, title?: string) => void;
  showError: (error: unknown, fallbackMessage?: string) => void;
  showRateLimit: (retryAfterSec: number) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `toast-${Date.now()}`;
      const newToast: ToastItem = { ...toast, id };

      setToasts((prev) => [...prev, newToast]);

      if (toast.countdownSec && toast.countdownSec > 0) {
        let remaining = toast.countdownSec;
        const interval = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            clearInterval(interval);
            removeToast(id);
          } else {
            setToasts((prev) =>
              prev.map((t) => (t.id === id ? { ...t, countdownSec: remaining } : t))
            );
          }
        }, 1000);
      } else {
        const dur = toast.duration ?? (toast.type === 'error' ? 6000 : 4000);
        setTimeout(() => removeToast(id), dur);
      }

      return id;
    },
    [removeToast]
  );

  const showSuccess = useCallback(
    (message: string, title?: string) => {
      addToast({ type: 'success', message, title });
    },
    [addToast]
  );

  const showError = useCallback(
    (error: unknown, fallbackMessage = 'خطایی رخ داده است') => {
      let msg = fallbackMessage;
      let reqId: string | undefined;

      if (error && typeof error === 'object') {
        const err = error as { message?: string; getReasonMessage?: () => string; requestId?: string };
        if (typeof err.getReasonMessage === 'function') {
          msg = err.getReasonMessage();
        } else if (err.message) {
          msg = err.message;
        }
        reqId = err.requestId;
      }

      addToast({
        type: 'error',
        message: msg,
        requestId: reqId,
      });
    },
    [addToast]
  );

  const showRateLimit = useCallback(
    (retryAfterSec: number) => {
      addToast({
        type: 'warning',
        title: 'محدودیت درخواست (Rate Limit)',
        message: `لطفاً ${toPersianDigits(retryAfterSec)} ثانیه تا ارسال درخواست بعدی منتظر بمانید.`,
        countdownSec: retryAfterSec,
      });
    },
    [addToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, showSuccess, showError, showRateLimit }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 end-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className="pointer-events-auto p-4 rounded-2xl shadow-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 flex items-start gap-3 transition-all animate-in slide-in-from-bottom-5 duration-200"
          >
            <div className="shrink-0 mt-0.5">
              {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
              {t.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-500" />}
              {t.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
              {t.type === 'info' && <Info className="w-5 h-5 text-indigo-500" />}
            </div>
            <div className="flex-1 min-w-0 space-y-1 text-start">
              {t.title && <p className="text-xs font-bold text-slate-900 dark:text-white">{t.title}</p>}
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{t.message}</p>
              {t.countdownSec !== undefined && t.countdownSec > 0 && (
                <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  زمان باقی‌مانده: {toPersianDigits(t.countdownSec)} ثانیه
                </p>
              )}
              {t.requestId && (
                <div className="pt-1 flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 font-mono">کد پیگیری: {t.requestId.slice(0, 8)}</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(t.requestId!)}
                    className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    کپی کد
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
