import React, { useState, useEffect } from 'react';
import { Download, X, Share } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    // Detect iOS
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

    if (isIosDevice && !isStandalone) {
      setIsIos(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    } else if (isIos) {
      setShowIosGuide(true);
    }
  };

  if (!showPrompt && !isIos) return null;

  return (
    <>
      {showPrompt && (
        <div className="fixed bottom-20 sm:bottom-6 start-4 sm:start-6 z-40 max-w-sm p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Download className="w-5 h-5" />
            </div>
            <div className="text-start">
              <p className="text-xs font-bold text-slate-900 dark:text-white">نصب برنامه اسراء</p>
              <p className="text-[11px] text-slate-500">دسترسی سریع‌تر بدون نیاز به مرورگر</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" onClick={handleInstallClick}>
              نصب
            </Button>
            <button
              type="button"
              onClick={() => setShowPrompt(false)}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {showIosGuide && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 text-start space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">نصب روی آی‌اواس (iOS)</h4>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="p-1 rounded-lg text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              برای نصب پنل مدیریت اسراء بر روی صفحه اصلی گوشی خود:
            </p>
            <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-2 list-decimal list-inside leading-relaxed">
              <li>
                در نوار پایین سافاری دکمه اشتراک‌گذاری <Share className="w-3.5 h-3.5 inline mx-1 text-indigo-600" /> را لمس کنید.
              </li>
              <li>گزینه «Add to Home Screen» (افزودن به صفحه اصلی) را انتخاب کنید.</li>
              <li>روی «Add» در گوشه بالا ضربه بزنید.</li>
            </ol>
            <Button className="w-full" size="sm" onClick={() => setShowIosGuide(false)}>
              متوجه شدم
            </Button>
          </div>
        </div>
      )}
    </>
  );
};
