import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User,
  KeyRound,
  Smartphone,
  ShieldCheck,
  Save,
  LogOut,
  Eye,
  EyeOff,
  CheckCircle2,
} from 'lucide-react';
import {
  H02_getMyAccount,
  H03_updateMyProfile,
  H04_setMyPassword,
  H05_getMySessions,
  H06_deleteMySession,
  H07_revokeOtherSessions,
  H94_getMyAccess,
} from '@/api/endpoints/account';
import { performSilentRefresh } from '@/api/http';
import { useAuth } from '@/app/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatJalaliDate } from '@/lib/jalali';
import { toPersianDigits, maskPhoneNumber } from '@/lib/format';

export const AccountRoute: React.FC = () => {
  const queryClient = useQueryClient();
  const { refetchActor } = useAuth();
  const { showSuccess, showError } = useToast();

  const [activeTab, setActiveTab] = useState<'profile' | 'password' | 'sessions' | 'access'>('profile');

  // Profile fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // My Account Query
  const { data: account, isLoading, error, refetch } = useQuery({
    queryKey: ['my', 'account'],
    queryFn: H02_getMyAccount,
  });

  // My Sessions Query
  const { data: sessions, isLoading: loadingSessions, refetch: refetchSessions } = useQuery({
    queryKey: ['my', 'sessions'],
    queryFn: () => H05_getMySessions(),
    enabled: activeTab === 'sessions',
  });

  // My Access Query
  const { data: myAccess, isLoading: loadingAccess } = useQuery({
    queryKey: ['my', 'access'],
    queryFn: H94_getMyAccess,
    enabled: activeTab === 'access',
  });

  React.useEffect(() => {
    if (account) {
      setFirstName(account.firstName);
      setLastName(account.lastName);
    }
  }, [account]);

  // Update Profile Mutation
  const updateProfileMutation = useMutation({
    mutationFn: (body: { firstName: string; lastName: string }) => H03_updateMyProfile(body),
    onSuccess: (updated) => {
      showSuccess('اطلاعات نام و نام‌خانوادگی با موفقیت به‌روزرسانی شد');
      queryClient.setQueryData(['my', 'account'], updated);
      refetchActor();
    },
    onError: (err) => showError(err, 'خطا در ویرایش اطلاعات'),
  });

  // Change Password Mutation (calls Step-Up automatically if required)
  const changePasswordMutation = useMutation({
    mutationFn: (body: { currentPassword?: string; newPassword: string }) => H04_setMyPassword(body),
    onSuccess: async () => {
      showSuccess('رمز عبور شما با موفقیت تغییر یافت');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await performSilentRefresh();
      refetch();
    },
    onError: (err) => showError(err, 'خطا در تغییر رمز عبور'),
  });

  // Revoke other sessions
  const revokeOthersMutation = useMutation({
    mutationFn: H07_revokeOtherSessions,
    onSuccess: () => {
      showSuccess('تمام نشست‌های دیگر با موفقیت بسته شدند');
      refetchSessions();
    },
    onError: (err) => showError(err, 'خطا در بستن نشست‌ها'),
  });

  // Revoke single session
  const revokeSessionMutation = useMutation({
    mutationFn: (id: string) => H06_deleteMySession(id),
    onSuccess: () => {
      showSuccess('نشست دستگاه با موفقیت منقضی شد');
      refetchSessions();
    },
    onError: (err) => showError(err, 'خطا در بستن نشست'),
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    updateProfileMutation.mutate({ firstName: firstName.trim(), lastName: lastName.trim() });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      showError(null, 'رمز عبور جدید باید حداقل ۸ کاراکتر باشد');
      return;
    }
    if (newPassword !== confirmPassword) {
      showError(null, 'رمز جدید با تکرار آن همخوانی ندارد');
      return;
    }

    changePasswordMutation.mutate({
      currentPassword: currentPassword || undefined,
      newPassword,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </div>
    );
  }

  if (error || !account) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6 text-start pb-16">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <User className="w-5 h-5 text-indigo-600" />
          <span>حساب کاربری من</span>
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          مدیریت هویت شخصی، رمز عبور، نشست‌های فعال و دسترسی‌های مؤثر
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="profile">مشخصات فردی</TabsTrigger>
          <TabsTrigger value="password">تغییر رمز عبور</TabsTrigger>
          <TabsTrigger value="sessions">دستگاه‌ها و نشست‌های من</TabsTrigger>
          <TabsTrigger value="access">مجوزها و دسترسی‌های من</TabsTrigger>
        </TabsList>

        {/* Tab 1: Profile */}
        <TabsContent value="profile">
          <div className="max-w-xl p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-6">
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="نام"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
                <Input
                  label="نام خانوادگی"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>

              <div>
                <Input
                  label="شماره موبایل (غیرقابل‌تغییر توسط کاربر)"
                  value={maskPhoneNumber(account.phone)}
                  disabled
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  جهت تغییر شماره موبایل با مدیریت کل سیستم تماس حاصل نمایید.
                </p>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  size="sm"
                  loading={updateProfileMutation.isPending}
                  icon={<Save className="w-3.5 h-3.5" />}
                >
                  ذخیره مشخصات
                </Button>
              </div>
            </form>
          </div>
        </TabsContent>

        {/* Tab 2: Password */}
        <TabsContent value="password">
          <div className="max-w-xl p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-6">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">تغییر رمز عبور ورود</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                جهت افزایش امنیت، تغییر رمز نیازمند تأیید هویت پیامکی (Step-Up) است.
              </p>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <Input
                label="رمز عبور فعلی"
                type={showPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="رمز عبور فعلی خود را وارد کنید"
                normalizeDigits={false}
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

              <Input
                label="رمز عبور جدید (حداقل ۸ کاراکتر)"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="رمز عبور جدید"
                normalizeDigits={false}
                required
              />

              <Input
                label="تکرار رمز عبور جدید"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="تکرار رمز عبور جدید"
                normalizeDigits={false}
                required
              />

              <div className="pt-2">
                <Button
                  type="submit"
                  size="sm"
                  loading={changePasswordMutation.isPending}
                  icon={<KeyRound className="w-3.5 h-3.5" />}
                >
                  ثبت رمز عبور جدید
                </Button>
              </div>
            </form>
          </div>
        </TabsContent>

        {/* Tab 3: Sessions */}
        <TabsContent value="sessions" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">نشست‌های فعال حساب شما</h3>
            <Button
              variant="outline"
              size="sm"
              loading={revokeOthersMutation.isPending}
              onClick={() => revokeOthersMutation.mutate()}
              icon={<LogOut className="w-3.5 h-3.5" />}
            >
              خروج از تمام دستگاه‌های دیگر
            </Button>
          </div>

          {loadingSessions ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-2xl" />
              ))}
            </div>
          ) : sessions && sessions.length > 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs divide-y divide-slate-100 dark:divide-slate-800">
              {sessions.map((s) => (
                <div key={s.id} className="p-4 flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>{s.deviceLabel || 'دستگاه ناشناس'}</span>
                        {s.current && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-emerald-50 text-emerald-700 rounded font-medium">
                            این دستگاه
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        آی‌پی: {s.ipMasked} · آخرین فعالیت: {formatJalaliDate(s.lastActiveAt, 'medium')}
                      </p>
                    </div>
                  </div>

                  {!s.current && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                      onClick={() => revokeSessionMutation.mutate(s.id)}
                    >
                      خروج
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-8 text-center">نشستی ثبت نشده است</p>
          )}
        </TabsContent>

        {/* Tab 4: My Access */}
        <TabsContent value="access" className="space-y-4">
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">دسترسی‌ها و نقش‌های من</h3>
              {myAccess?.stepUpExempt && (
                <span className="text-xs font-bold text-purple-700 bg-purple-50 dark:bg-purple-950/40 px-2.5 py-0.5 rounded-full">
                  معاف از Step-Up
                </span>
              )}
            </div>

            {loadingAccess ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-2xl" />
                ))}
              </div>
            ) : myAccess?.permissions && myAccess.permissions.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
                {myAccess.permissions.map((p) => (
                  <div key={p.key} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-mono font-bold text-slate-900 dark:text-white block">{p.key}</span>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1">
                        <span>منابع:</span>
                        {p.sources.map((s, idx) => (
                          <span key={idx} className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">
                            {s.type === 'role' ? `نقش ${s.ref}` : s.type === 'module' ? `ماژول ${s.ref}` : 'مستقیم'}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-lg ${
                        p.stepUp === 'required' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {p.stepUp === 'required' ? 'تأیید پیامکی' : 'عادی'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-6 text-center">مجوز فعالی یافت نشد</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
