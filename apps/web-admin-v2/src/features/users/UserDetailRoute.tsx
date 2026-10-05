import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User,
  Shield,
  Smartphone,
  History,
  AlertTriangle,
  ArrowRight,
  Lock,
  KeyRound,
  LogOut,
  Trash2,
  UserCheck,
  UserX,
  Edit3,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
} from 'lucide-react';
import {
  H21_getUser,
  H22_setUserRoles,
  H23_setUserGrants,
  H25_updateUser,
  H26_setUserStatus,
  H27_deleteUser,
  H28_setUserPassword,
  H29_logoutAllUserSessions,
  H50_getUserSessions,
  H51_deleteUserSession,
  H93_getEffectiveAccess,
} from '@/api/endpoints/users';
import { H10_getRoles } from '@/api/endpoints/roles';
import { H40_getAudit } from '@/api/endpoints/system';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { TypeToConfirm } from '@/components/ui/TypeToConfirm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatJalaliDate } from '@/lib/jalali';
import { formatNumber, toPersianDigits, formatPhoneNumber } from '@/lib/format';

export const UserDetailRoute: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();

  const [activeTab, setActiveTab] = useState<'overview' | 'access' | 'devices' | 'activity' | 'danger'>('overview');

  // Danger zone dialog states
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [tempPassOpen, setTempPassOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [logoutAllConfirmOpen, setLogoutAllConfirmOpen] = useState(false);

  // Form states for profile edit
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Fetch User Details
  const { data: user, isLoading, error, refetch } = useQuery({
    queryKey: ['system', 'users', id],
    queryFn: () => H21_getUser(id!),
    enabled: Boolean(id),
  });

  // Fetch Roles list
  const { data: allRoles } = useQuery({
    queryKey: ['system', 'roles'],
    queryFn: () => H10_getRoles(),
  });

  // Fetch Effective Access (H-93)
  const { data: effectiveAccess, isLoading: loadingAccess } = useQuery({
    queryKey: ['system', 'users', id, 'effective-access'],
    queryFn: () => H93_getEffectiveAccess(id!),
    enabled: Boolean(id) && activeTab === 'access',
  });

  // Fetch User Devices/Sessions (H-50)
  const { data: userSessions, isLoading: loadingSessions, refetch: refetchSessions } = useQuery({
    queryKey: ['system', 'users', id, 'sessions'],
    queryFn: () => H50_getUserSessions(id!),
    enabled: Boolean(id) && activeTab === 'devices',
  });

  // Fetch User Audit entries (H-40)
  const { data: userAudit, isLoading: loadingAudit } = useQuery({
    queryKey: ['system', 'audit', 'user', id],
    queryFn: () => H40_getAudit({ targetType: 'user', targetId: id, pageSize: 20 }),
    enabled: Boolean(id) && activeTab === 'activity',
  });

  // Initialize edit fields
  React.useEffect(() => {
    if (user) {
      setEditFirstName(user.firstName);
      setEditLastName(user.lastName);
      setEditPhone(user.phone);
    }
  }, [user]);

  // Mutations
  const updateProfileMutation = useMutation({
    mutationFn: (body: { firstName?: string; lastName?: string; phone?: string }) => H25_updateUser(id!, body),
    onSuccess: (updated) => {
      showSuccess('مشخصات کاربر با موفقیت ویرایش گردید');
      setEditProfileOpen(false);
      queryClient.setQueryData(['system', 'users', id], updated);
    },
    onError: (err) => showError(err, 'خطا در ویرایش کاربر'),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (newStatus: 'active' | 'disabled') => H26_setUserStatus(id!, { status: newStatus }),
    onSuccess: (updated) => {
      showSuccess(`وضعیت کاربر به ${updated.status === 'active' ? 'فعال' : 'غیرفعال'} تغییر یافت`);
      queryClient.setQueryData(['system', 'users', id], updated);
    },
    onError: (err) => showError(err, 'خطا در تغییر وضعیت کاربر'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => H27_deleteUser(id!),
    onSuccess: () => {
      showSuccess('کاربر با موفقیت حذف نرم و ناشناس‌سازی شد');
      navigate('/users', { replace: true });
    },
    onError: (err) => showError(err, 'خطا در حذف کاربر'),
  });

  const setPasswordMutation = useMutation({
    mutationFn: (pass: string) => H28_setUserPassword(id!, { action: 'set', password: pass }),
    onSuccess: () => {
      showSuccess('رمز عبور موقت با موفقیت تنظیم شد');
      setTempPassOpen(false);
      setTempPassword('');
      refetch();
    },
    onError: (err) => showError(err, 'خطا در تنظیم رمز'),
  });

  const clearPasswordMutation = useMutation({
    mutationFn: () => H28_setUserPassword(id!, { action: 'clear' }),
    onSuccess: () => {
      showSuccess('رمز عبور کاربر حذف شد (ورود تنها با پیامک امکان‌پذیر است)');
      refetch();
    },
    onError: (err) => showError(err, 'خطا در حذف رمز'),
  });

  const logoutAllMutation = useMutation({
    mutationFn: () => H29_logoutAllUserSessions(id!),
    onSuccess: () => {
      showSuccess('کاربر از تمامی دستگاه‌ها و نشست‌ها خارج گردید');
      setLogoutAllConfirmOpen(false);
      refetchSessions();
    },
    onError: (err) => showError(err, 'خطا در خروج اجباری کاربر'),
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (sessionId: string) => H51_deleteUserSession(id!, sessionId),
    onSuccess: () => {
      showSuccess('نشست دستگاه با موفقیت منقضی شد');
      refetchSessions();
    },
    onError: (err) => showError(err, 'خطا در بستن نشست'),
  });

  const setRolesMutation = useMutation({
    mutationFn: (roles: string[]) => H22_setUserRoles(id!, { roles }),
    onSuccess: () => {
      showSuccess('نقش‌های کاربر با موفقیت به‌روزرسانی شد');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['system', 'users', id, 'effective-access'] });
    },
    onError: (err) => showError(err, 'خطا در تخصیص نقش'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full rounded-3xl" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </div>
    );
  }

  if (error || !user) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  const handleRoleToggle = (roleKey: string) => {
    const current = user.roles || [];
    const next = current.includes(roleKey)
      ? current.filter((r) => r !== roleKey)
      : [...current, roleKey];
    setRolesMutation.mutate(next);
  };

  return (
    <div className="space-y-6 text-start pb-16">
      {/* Back button & Breadcrumb */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/users')}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>بازگشت به فهرست کاربران</span>
        </button>
      </div>

      {/* User Header Profile Card */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#251D59] to-[#6E56CF] text-white flex items-center justify-center font-bold text-xl shadow-md">
            {user.firstName ? user.firstName.slice(0, 1) : 'ک'}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">{user.name}</h1>
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded-lg ${
                  user.status === 'active'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : user.status === 'disabled'
                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                }`}
              >
                {user.status === 'active' ? 'حساب فعال' : user.status === 'disabled' ? 'غیرفعال' : 'حذف‌شده'}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono dir-ltr text-start">
              {formatPhoneNumber(user.phone)}
            </p>
            <div className="flex flex-wrap gap-1 pt-1">
              {user.roles && user.roles.length > 0 ? (
                user.roles.map((r) => (
                  <span
                    key={r}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium"
                  >
                    {r}
                  </span>
                ))
              ) : (
                <span className="text-[10px] text-slate-400">بدون نقش سیستم</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditProfileOpen(true)}
            icon={<Edit3 className="w-3.5 h-3.5" />}
          >
            ویرایش مشخصات
          </Button>

          {user.status === 'active' ? (
            <Button
              variant="outline"
              size="sm"
              loading={toggleStatusMutation.isPending}
              onClick={() => toggleStatusMutation.mutate('disabled')}
              icon={<UserX className="w-3.5 h-3.5 text-amber-500" />}
            >
              غیرفعال‌سازی
            </Button>
          ) : user.status === 'disabled' ? (
            <Button
              variant="outline"
              size="sm"
              loading={toggleStatusMutation.isPending}
              onClick={() => toggleStatusMutation.mutate('active')}
              icon={<UserCheck className="w-3.5 h-3.5 text-emerald-500" />}
            >
              فعال‌سازی مجدد
            </Button>
          ) : null}
        </div>
      </div>

      {/* Tabs Layout */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="overview">نمای کلی و آمار</TabsTrigger>
          <TabsTrigger value="access">نقش‌ها و دسترسی‌ها (RBAC)</TabsTrigger>
          <TabsTrigger value="devices">نشست‌ها و دستگاه‌ها ({toPersianDigits(user.activeSessions || 0)})</TabsTrigger>
          <TabsTrigger value="activity">لاگ فعالیت‌ها</TabsTrigger>
          <TabsTrigger value="danger">عملیات حساس و حذف</TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl space-y-4">
              <h3 className="text-xs font-bold text-slate-400">اطلاعات حساب</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">تاریخ عضویت:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {formatJalaliDate(user.createdAt, 'medium')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">آخرین فعالیت:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {user.lastActiveAt ? formatJalaliDate(user.lastActiveAt, 'medium') : 'هنوز ثبت نشده'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">وضعیت رمز عبور:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {user.hasPassword ? (user.mustChangePassword ? 'رمز موقت (تغییر اجباری)' : 'رمز فعال') : 'بدون رمز (فقط پیامک)'}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl space-y-4">
              <h3 className="text-xs font-bold text-slate-400">فعالیت در جلسات قرآنی</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">جلسات ایجاد شده:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {toPersianDigits(user.sessions?.created || 0)} جلسه
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">عضویت در جلسات:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {toPersianDigits(user.sessions?.memberships || 0)} جلسه
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">حضورهای ثبت‌شده:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {toPersianDigits(user.sessions?.attended || 0)} بار
                  </span>
                </div>
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl space-y-4">
              <h3 className="text-xs font-bold text-slate-400">امتیازها و نشان‌ها</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">مجموع امتیازات:</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono text-sm">
                    {formatNumber(user.points?.total || 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">نشان‌های کسب‌شده:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {toPersianDigits(user.points?.badges || 0)} نشان
                  </span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Access & Effective RBAC */}
        <TabsContent value="access" className="space-y-6">
          {/* Role Assignment Card */}
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">تخصیص نقش‌های سیستمی</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              نقش‌های انتخاب شده دسترسی‌های مربوطه را به این کاربر اعطا می‌نمایند.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {(allRoles || []).map((r) => {
                const isAssigned = (user.roles || []).includes(r.key);
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => handleRoleToggle(r.key)}
                    className={`px-3.5 py-2 text-xs font-semibold rounded-2xl transition-all cursor-pointer ${
                      isAssigned
                        ? 'bg-[#251D59] text-white shadow-xs dark:bg-indigo-600'
                        : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {r.title} ({r.key})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Effective Access Explainer (H-93) */}
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">دسترسی مؤثر و منابع مجوزها (H-93)</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  فهرست کل مجوزهای جاری کاربر به همراه منبع تخصیص (نقش، ماژول یا تخصیص مستقیم)
                </p>
              </div>
              {effectiveAccess?.stepUpExempt && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold">
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
            ) : effectiveAccess?.permissions && effectiveAccess.permissions.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
                {effectiveAccess.permissions.map((p) => (
                  <div key={p.key} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-mono font-bold text-slate-900 dark:text-white block">{p.key}</span>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1">
                        <span>منابع:</span>
                        {p.sources.map((s, idx) => (
                          <span key={idx} className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">
                            {s.type === 'role' ? `نقش: ${s.ref}` : s.type === 'module' ? `ماژول: ${s.ref}` : 'مستقیم'}
                          </span>
                        ))}
                      </div>
                    </div>

                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-lg font-medium ${
                        p.stepUp === 'required'
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800'
                      }`}
                    >
                      {p.stepUp === 'required' ? 'نیازمند پیامک (Step-Up)' : 'عادی'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-400 text-center py-6">کاربر دارای مجوز فعالی نمی‌باشد</div>
            )}
          </div>
        </TabsContent>

        {/* Tab 3: Devices / Sessions */}
        <TabsContent value="devices" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">دستگاه‌ها و نشست‌های فعال</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLogoutAllConfirmOpen(true)}
              icon={<LogOut className="w-3.5 h-3.5 text-rose-500" />}
            >
              خروج از تمام دستگاه‌ها
            </Button>
          </div>

          {loadingSessions ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-2xl" />
              ))}
            </div>
          ) : userSessions && userSessions.length > 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs">
              {userSessions.map((s) => (
                <div key={s.id} className="p-4 flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>{s.deviceLabel || 'دستگاه ناشناس'}</span>
                        {s.current && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-emerald-50 text-emerald-700 rounded">
                            نشست فعلی
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        آی‌پی: {s.ipMasked} · آخرین فعالیت: {formatJalaliDate(s.lastActiveAt, 'medium')}
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                    onClick={() => revokeSessionMutation.mutate(s.id)}
                    loading={revokeSessionMutation.isPending}
                  >
                    بستن نشست
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-400 text-center py-8">نشست فعالی یافت نشد</div>
          )}
        </TabsContent>

        {/* Tab 4: Activity Log */}
        <TabsContent value="activity">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">تاریخچه اقدامات مرتبط با این کاربر</h3>
            {loadingAudit ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-2xl" />
                ))}
              </div>
            ) : userAudit?.items && userAudit.items.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {userAudit.items.map((log) => (
                  <div key={log.id} className="py-3 flex items-start justify-between gap-4 text-xs">
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">{log.summary}</span>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        توسط {log.actor.name} · اقدام: {log.action}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {formatJalaliDate(log.at, 'medium')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-400 text-center py-8">لاگی ثبت نشده است</div>
            )}
          </div>
        </TabsContent>

        {/* Tab 5: Danger Zone */}
        <TabsContent value="danger">
          <div className="p-6 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-950/60 rounded-3xl shadow-xs space-y-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-rose-100 dark:border-rose-950/50">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              <div>
                <h3 className="text-sm font-bold text-rose-900 dark:text-rose-200">عملیات حساس و بحرانی</h3>
                <p className="text-xs text-rose-700/80 dark:text-rose-300/80">
                  این عملیات مستقیماً بر روی هویت، رمز و دسترسی‌های کاربر اثر می‌گذارد.
                </p>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 space-y-4">
              {/* Set Temp Password */}
              <div className="pt-4 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">تنظیم رمز عبور موقت</h4>
                  <p className="text-[11px] text-slate-500">
                    تخصیص یک رمز موقت که کاربر در اولین ورود موظف به تغییر آن است.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setTempPassOpen(true)}>
                  تنظیم رمز موقت
                </Button>
              </div>

              {/* Clear Password */}
              {user.hasPassword && (
                <div className="pt-4 flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">حذف رمز عبور کاربر</h4>
                    <p className="text-[11px] text-slate-500">
                      پس از حذف، ورود کاربر صرفاً از طریق کد یکبار مصرف پیامکی مقدور خواهد بود.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={clearPasswordMutation.isPending}
                    onClick={() => clearPasswordMutation.mutate()}
                  >
                    حذف رمز عبور
                  </Button>
                </div>
              )}

              {/* Force Logout */}
              <div className="pt-4 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">خروج اجباری از همه نشست‌ها</h4>
                  <p className="text-[11px] text-slate-500">
                    تمامی توکن‌ها و نشست‌های فعال کاربر بلافاصله باطل می‌شوند.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLogoutAllConfirmOpen(true)}
                >
                  خروج تمام دستگاه‌ها
                </Button>
              </div>

              {/* Soft Delete */}
              <div className="pt-4 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-rose-600 dark:text-rose-400">حذف نرم و ناشناس‌سازی کاربر</h4>
                  <p className="text-[11px] text-slate-500">
                    مشخصات هویتی و شماره پاک شده و تاریخچه فعالیت‌ها به نام «کاربر حذف‌شده» باقی می‌ماند. این عمل برگشت‌ناپذیر است.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setDeleteModalOpen(true)}
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  حذف کاربر
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Profile Modal */}
      <Dialog open={editProfileOpen} onOpenChange={setEditProfileOpen}>
        <DialogContent title="ویرایش مشخصات کاربر">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateProfileMutation.mutate({
                firstName: editFirstName.trim(),
                lastName: editLastName.trim(),
                phone: editPhone.trim(),
              });
            }}
            className="space-y-4 pt-2"
          >
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="نام"
                value={editFirstName}
                onChange={(e) => setEditFirstName(e.target.value)}
                required
              />
              <Input
                label="نام خانوادگی"
                value={editLastName}
                onChange={(e) => setEditLastName(e.target.value)}
                required
              />
            </div>
            <Input
              label="شماره موبایل"
              type="tel"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              required
            />
            <div className="flex items-center justify-end gap-2.5 pt-4">
              <Button variant="outline" size="sm" onClick={() => setEditProfileOpen(false)}>
                انصراف
              </Button>
              <Button type="submit" size="sm" loading={updateProfileMutation.isPending}>
                ذخیره تغییرات
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Temporary Password Modal */}
      <Dialog open={tempPassOpen} onOpenChange={setTempPassOpen}>
        <DialogContent title="تنظیم رمز عبور موقت">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (tempPassword.length >= 6) {
                setPasswordMutation.mutate(tempPassword);
              }
            }}
            className="space-y-4 pt-2"
          >
            <Input
              label="رمز عبور موقت جدید"
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              placeholder="حداقل ۶ کاراکتر"
              normalizeDigits={false}
              required
              autoFocus
            />
            <p className="text-[11px] text-slate-500 leading-relaxed">
              کاربر موظف است در نخستین مرتبه ورود به سامانه، این رمز موقت را به رمز دائمی جدید تغییر دهد.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-4">
              <Button variant="outline" size="sm" onClick={() => setTempPassOpen(false)}>
                انصراف
              </Button>
              <Button type="submit" size="sm" loading={setPasswordMutation.isPending}>
                تنظیم رمز
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <TypeToConfirm
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="حذف و ناشناس‌سازی کاربر"
        description="با انجام این کار، هویت کاربر به صورت برگشت‌ناپذیر پاک می‌شود. آیا مطمئن هستید؟"
        expectedValue={user.phone}
        promptLabel="جهت تأیید، شماره موبایل کاربر را تایپ کنید"
        onConfirm={() => deleteMutation.mutate()}
        loading={deleteMutation.isPending}
      />

      {/* Logout All Confirm Dialog */}
      <ConfirmDialog
        open={logoutAllConfirmOpen}
        onOpenChange={setLogoutAllConfirmOpen}
        title="خروج از تمام دستگاه‌ها"
        description="آیا از باطل‌سازی تمام نشست‌ها و خروج اجباری این کاربر از کلیه دستگاه‌ها اطمینان دارید؟"
        onConfirm={() => logoutAllMutation.mutate()}
        loading={logoutAllMutation.isPending}
        isDestructive
      />
    </div>
  );
};
