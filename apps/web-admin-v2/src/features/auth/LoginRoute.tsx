import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Phone, Lock, Eye, EyeOff, ShieldCheck, ArrowRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { OtpInput } from '@/components/ui/OtpInput';
import { L01_requestOtp, L02_verifyOtp, L03_loginPassword } from '@/api/endpoints/auth';
import { setAuthSession } from '@/api/auth';
import { getDeviceId, getDeviceLabel } from '@/lib/deviceInfo';
import { isValidIranPhone, toPersianDigits, normalizeToLatinDigits } from '@/lib/format';
import { useAuth } from '@/app/AuthContext';

export const LoginRoute: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { refetchActor } = useAuth();

  const [tab, setTab] = useState<'otp' | 'password'>('otp');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // OTP step
  const [otpStep, setOtpStep] = useState<'request' | 'verify'>('request');
  const [challengeId, setChallengeId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const returnTo = (location.state as { returnTo?: string })?.returnTo || '/';

  // Resend countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((p) => (p > 0 ? p - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleRequestOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleanPhone = normalizeToLatinDigits(phone);
    if (!isValidIranPhone(cleanPhone)) {
      setErrorMsg('لطفاً یک شماره موبایل معتبر (مانند ۰۹۱۲۳۴۵۶۷۸۹) وارد کنید');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const challenge = await L01_requestOtp({ phone: cleanPhone });
      setChallengeId(challenge.challengeId);
      setResendCooldown(challenge.resendAfterSec || 60);
      setOtpStep('verify');
    } catch (err: unknown) {
      const e = err as { message?: string; details?: { retryAfterSec?: number } };
      if (e.details?.retryAfterSec) {
        setErrorMsg(`تعداد درخواست بیش از حد مجاز است. لطفاً ${toPersianDigits(e.details.retryAfterSec)} ثانیه صبر کنید.`);
      } else {
        setErrorMsg(e.message || 'خطا در ارسال کد تأیید');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (otpCode.length < 5 || !challengeId) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await L02_verifyOtp({
        challengeId,
        code: otpCode,
        deviceId: getDeviceId(),
        deviceLabel: getDeviceLabel(),
      });

      setAuthSession(result.accessToken, result.accessExpiresIn, result.user);
      await refetchActor();
      navigate(returnTo, { replace: true });
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      if (e.code === 'AUTH_OTP_EXHAUSTED' || e.code === 'AUTH_OTP_EXPIRED') {
        setErrorMsg('کد تأیید منقضی یا تعداد دفعات تلاش تمام شده است. لطفاً کد جدید درخواست کنید.');
      } else {
        setErrorMsg(e.message || 'کد وارد شده صحیح نمی‌باشد');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = normalizeToLatinDigits(phone);
    if (!isValidIranPhone(cleanPhone)) {
      setErrorMsg('شماره موبایل معتبر نیست');
      return;
    }
    if (!password) {
      setErrorMsg('رمز عبور را وارد کنید');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await L03_loginPassword({
        phone: cleanPhone,
        password,
        deviceId: getDeviceId(),
        deviceLabel: getDeviceLabel(),
      });

      setAuthSession(result.accessToken, result.accessExpiresIn, result.user);
      await refetchActor();
      navigate(returnTo, { replace: true });
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e.message || 'شماره موبایل یا رمز عبور اشتباه است');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F3F7] dark:bg-[#0B0F19] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-start">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 p-3 flex items-center justify-center">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="اسراء" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">ورود به پنل مدیریت اسراء</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              سامانه جامع مدیریت و یادگیری قرآن کریم
            </p>
          </div>
        </div>

        {/* Auth Mode Tabs */}
        {otpStep === 'request' && (
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setTab('otp');
                setErrorMsg(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all ${
                tab === 'otp'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              کد یکبار مصرف (پیامک)
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('password');
                setErrorMsg(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all ${
                tab === 'password'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              رمز عبور
            </button>
          </div>
        )}

        {/* Tab 1: OTP Flow */}
        {tab === 'otp' && (
          <>
            {otpStep === 'request' ? (
              <form onSubmit={handleRequestOtp} className="space-y-4">
                <Input
                  label="شماره موبایل"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                  startIcon={<Phone className="w-4 h-4" />}
                  autoFocus
                />

                {errorMsg && (
                  <p className="text-xs font-medium text-rose-500 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl">
                    {errorMsg}
                  </p>
                )}

                <Button type="submit" className="w-full" loading={loading}>
                  دریافت کد تأیید
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-5 text-center">
                <div className="space-y-1">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    کد ۵ رقمی ارسال شده به شماره <strong className="font-mono dir-ltr">{phone}</strong> را وارد کنید:
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpStep('request');
                      setOtpCode('');
                      setErrorMsg(null);
                    }}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    تغییر شماره موبایل
                  </button>
                </div>

                <OtpInput
                  value={otpCode}
                  onChange={(val) => {
                    setOtpCode(val);
                    if (val.length === 5) {
                      setErrorMsg(null);
                    }
                  }}
                  disabled={loading}
                  error={Boolean(errorMsg)}
                />

                {errorMsg && (
                  <p className="text-xs font-medium text-rose-500 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl text-start">
                    {errorMsg}
                  </p>
                )}

                <div className="flex items-center justify-between text-xs">
                  {resendCooldown > 0 ? (
                    <span className="text-slate-400">
                      ارسال مجدد تا {toPersianDigits(resendCooldown)} ثانیه دیگر
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleRequestOtp()}
                      className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-medium cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>ارسال مجدد کد</span>
                    </button>
                  )}
                </div>

                <Button type="submit" className="w-full" loading={loading} disabled={otpCode.length < 5}>
                  تأیید و ورود
                </Button>
              </form>
            )}
          </>
        )}

        {/* Tab 2: Password Flow */}
        {tab === 'password' && (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <Input
              label="شماره موبایل"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="۰۹۱۲۳۴۵۶۷۸۹"
              startIcon={<Phone className="w-4 h-4" />}
              autoFocus
            />

            <Input
              label="رمز عبور"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="رمز عبور خود را وارد کنید"
              normalizeDigits={false}
              startIcon={<Lock className="w-4 h-4" />}
              endIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />

            {errorMsg && (
              <p className="text-xs font-medium text-rose-500 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl">
                {errorMsg}
              </p>
            )}

            <Button type="submit" className="w-full" loading={loading}>
              ورود با رمز عبور
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};
