import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { OtpInput } from '@/components/ui/OtpInput';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import { L06_requestStepUpOtp, L07_verifyStepUpOtp } from '@/api/endpoints/auth';
import { registerStepUpDialogOpener } from '@/api/stepUp';
import { toPersianDigits } from '@/lib/format';

export const StepUpModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [challengeId, setChallengeId] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resolverRef = useRef<((token: string) => void) | null>(null);
  const rejecterRef = useRef<((err: unknown) => void) | null>(null);

  // Register with stepUp.ts coordinator
  useEffect(() => {
    const unregister = registerStepUpDialogOpener(() => {
      return new Promise<string>((resolve, reject) => {
        resolverRef.current = resolve;
        rejecterRef.current = reject;
        setCode('');
        setErrorMsg(null);
        setIsOpen(true);
        requestOtpCode();
      });
    });

    return () => {
      unregister();
    };
  }, []);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const requestOtpCode = async () => {
    setRequestingOtp(true);
    setErrorMsg(null);
    try {
      const challenge = await L06_requestStepUpOtp();
      setChallengeId(challenge.challengeId);
      setResendCooldown(challenge.resendAfterSec || 60);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e.message || 'خطا در ارسال کد تأیید هویت');
    } finally {
      setRequestingOtp(false);
    }
  };

  const handleVerify = async () => {
    if (code.length < 5 || !challengeId) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await L07_verifyStepUpOtp({
        challengeId,
        code,
      });

      setIsOpen(false);
      resolverRef.current?.(result.stepUpToken);
      resolverRef.current = null;
      rejecterRef.current = null;
    } catch (err: unknown) {
      const e = err as { message?: string; details?: { attemptsLeft?: number } };
      let msg = e.message || 'کد وارد شده نامعتبر یا منقضی شده است';
      if (e.details?.attemptsLeft !== undefined) {
        msg += ` (${toPersianDigits(e.details.attemptsLeft)} تلاش باقی‌مانده)`;
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (loading) return;
    setIsOpen(false);
    rejecterRef.current?.(new Error('STEP_UP_CANCELLED'));
    resolverRef.current = null;
    rejecterRef.current = null;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent
        title="تأیید مجدد هویت (Step-Up)"
        description="انجام این عملیات حساس نیازمند تأیید مجدد هویت از طریق کد پیامکی است."
        showCloseButton={!loading}
      >
        <div className="space-y-6 pt-2 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <ShieldAlert className="w-7 h-7" />
          </div>

          <div className="space-y-1">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              کد تأیید ۵ رقمی به شماره موبایل شما پیامک شد.
            </p>
          </div>

          <div className="py-2">
            <OtpInput
              value={code}
              onChange={(val) => {
                setCode(val);
                if (val.length === 5) {
                  setErrorMsg(null);
                }
              }}
              disabled={loading || requestingOtp}
              error={Boolean(errorMsg)}
            />
          </div>

          {errorMsg && (
            <p className="text-xs font-medium text-rose-500 bg-rose-50 dark:bg-rose-950/40 py-2 px-3 rounded-xl">
              {errorMsg}
            </p>
          )}

          <div className="flex items-center justify-between text-xs pt-1">
            {resendCooldown > 0 ? (
              <span className="text-slate-400">
                ارسال مجدد تا {toPersianDigits(resendCooldown)} ثانیه دیگر
              </span>
            ) : (
              <button
                type="button"
                disabled={requestingOtp || loading}
                onClick={requestOtpCode}
                className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-medium cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${requestingOtp ? 'animate-spin' : ''}`} />
                <span>ارسال مجدد کد</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={loading}>
              انصراف
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={loading}
              disabled={code.length < 5 || requestingOtp}
              onClick={handleVerify}
            >
              تأیید و ادامه
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
