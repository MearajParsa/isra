import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, Lock, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { H04_setMyPassword } from '@/api/endpoints/account';
import { performSilentRefresh } from '@/api/http';
import { useAuth } from './AuthContext';
import { toPersianDigits } from '@/lib/format';

export const PasswordChangeForced: React.FC = () => {
  const { setMustChangePassword, refetchActor } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Password strength calculation
  const calculateStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) score++;
    if (/\d/.test(pass)) score++;
    if (/[^a-zA-Z0-9]/.test(pass)) score++;
    return score; // 0..4
  };

  const strength = calculateStrength(newPassword);
  const strengthLabels = ['بسیار ضعیف', 'ضعیف', 'متوسط', 'خوب', 'بسیار قوی'];
  const strengthColors = ['bg-rose-500', 'bg-amber-500', 'bg-yellow-500', 'bg-blue-500', 'bg-emerald-500'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setErrorMsg('لطفاً رمز عبور موقت فعلی خود را وارد کنید');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMsg('رمز عبور جدید باید حداقل ۸ کاراکتر باشد');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('تکرار رمز عبور جدید با رمز وارد شده یکسان نیست');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      await H04_setMyPassword({
        currentPassword,
        newPassword,
      });

      // Token rotation after password change
      await performSilentRefresh();
      await refetchActor();
      setMustChangePassword(false);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e.message || 'خطا در تغییر رمز عبور');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#F0F3F7] dark:bg-[#0B0F19] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6 text-start">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">تغییر اجباری رمز عبور</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
            حساب شما دارای رمز عبور موقت است. جهت حفظ امنیت سامانه، پیش از ورود به پنل باید یک رمز عبور جدید تعیین نمایید.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="رمز عبور موقت فعلی"
            type={showPass ? 'text' : 'password'}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="رمز موقتی که دریافت کرده‌اید"
            normalizeDigits={false}
            autoComplete="current-password"
            startIcon={<KeyRound className="w-4 h-4" />}
            endIcon={
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="text-slate-400 hover:text-slate-600 focus:outline-none"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />

          <div className="space-y-1.5">
            <Input
              label="رمز عبور جدید"
              type={showPass ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="حداقل ۸ کاراکتر"
              normalizeDigits={false}
              autoComplete="new-password"
              startIcon={<Lock className="w-4 h-4" />}
            />
            {newPassword && (
              <div className="space-y-1 pt-1">
                <div className="flex h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${strengthColors[strength]}`}
                    style={{ width: `${((strength + 1) / 5) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>قدرت رمز:</span>
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    {strengthLabels[strength]}
                  </span>
                </div>
              </div>
            )}
          </div>

          <Input
            label="تکرار رمز عبور جدید"
            type={showPass ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="تکرار رمز عبور جدید"
            normalizeDigits={false}
            autoComplete="new-password"
            startIcon={<Lock className="w-4 h-4" />}
          />

          {errorMsg && (
            <p className="text-xs font-medium text-rose-500 bg-rose-50 dark:bg-rose-950/40 py-2.5 px-3.5 rounded-xl">
              {errorMsg}
            </p>
          )}

          <Button type="submit" className="w-full" loading={loading} icon={<CheckCircle2 className="w-4 h-4" />}>
            ثبت رمز عبور جدید و ورود به پنل
          </Button>
        </form>
      </div>
    </div>
  );
};
