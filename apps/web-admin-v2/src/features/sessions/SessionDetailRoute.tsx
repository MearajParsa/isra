import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  ArrowRight,
  MapPin,
  Clock,
  Play,
  CheckCircle,
  Users,
  Award,
  Check,
  X,
  Trash2,
  ExternalLink,
  ChevronRight,
  ListOrdered,
} from 'lucide-react';
import {
  H61_getSession,
  H63_updateSession,
  H64_transitionSession,
  H65_deleteSession,
  H66_getSessionMembers,
  H67_decideMember,
  H69_deleteMember,
  H70_getSessionAttendance,
  H71_getSessionQueue,
  H72_getSessionEvaluations,
} from '@/api/endpoints/sessions';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatJalaliDate } from '@/lib/jalali';
import { formatNumber, toPersianDigits } from '@/lib/format';
import { SessionState } from '@/api/types';

export const SessionDetailRoute: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();

  const [activeTab, setActiveTab] = useState<'info' | 'members' | 'attendance' | 'queue' | 'evaluations'>('info');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Fetch Session
  const { data: session, isLoading, error, refetch } = useQuery({
    queryKey: ['sessions', id],
    queryFn: () => H61_getSession(id!),
    enabled: Boolean(id),
  });

  // Fetch Members
  const { data: members, isLoading: loadingMembers, refetch: refetchMembers } = useQuery({
    queryKey: ['sessions', id, 'members'],
    queryFn: () => H66_getSessionMembers(id!),
    enabled: Boolean(id) && activeTab === 'members',
  });

  // Fetch Attendance
  const { data: attendance, isLoading: loadingAttendance } = useQuery({
    queryKey: ['sessions', id, 'attendance'],
    queryFn: () => H70_getSessionAttendance(id!),
    enabled: Boolean(id) && activeTab === 'attendance',
  });

  // Fetch Queue
  const { data: queue, isLoading: loadingQueue } = useQuery({
    queryKey: ['sessions', id, 'queue'],
    queryFn: () => H71_getSessionQueue(id!),
    enabled: Boolean(id) && activeTab === 'queue',
  });

  // Fetch Evaluations
  const { data: evaluations, isLoading: loadingEvals } = useQuery({
    queryKey: ['sessions', id, 'evaluations'],
    queryFn: () => H72_getSessionEvaluations(id!),
    enabled: Boolean(id) && activeTab === 'evaluations',
  });

  // Step transition mutation (draft -> scheduled -> started -> ended)
  const transitionMutation = useMutation({
    mutationFn: (to: 'scheduled' | 'started' | 'ended') => H64_transitionSession(id!, { to }),
    onSuccess: (updated) => {
      showSuccess(`وضعیت جلسه به ${updated.status} تغییر یافت`);
      queryClient.setQueryData(['sessions', id], updated);
    },
    onError: (err) => showError(err, 'خطا در تغییر مرحله جلسه'),
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: () => H65_deleteSession(id!),
    onSuccess: () => {
      showSuccess('جلسه با موفقیت حذف گردید');
      navigate('/sessions', { replace: true });
    },
    onError: (err) => showError(err, 'خطا در حذف جلسه'),
  });

  // Decide Member Mutation
  const decideMemberMutation = useMutation({
    mutationFn: ({ memberId, action }: { memberId: string; action: 'approve' | 'reject' }) =>
      H67_decideMember(id!, memberId, { action }),
    onSuccess: () => {
      showSuccess('وضعیت عضویت با موفقیت ثبت شد');
      refetchMembers();
    },
    onError: (err) => showError(err, 'خطا در تأیید/رد عضویت'),
  });

  // Remove Member
  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => H69_deleteMember(id!, memberId),
    onSuccess: () => {
      showSuccess('عضو با موفقیت از جلسه حذف گردید');
      refetchMembers();
    },
    onError: (err) => showError(err, 'خطا در حذف عضو'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-36 w-full rounded-3xl" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </div>
    );
  }

  if (error || !session) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  const getNextTransitionTarget = (status: SessionState): 'scheduled' | 'started' | 'ended' | null => {
    if (status === 'draft') return 'scheduled';
    if (status === 'scheduled') return 'started';
    if (status === 'started') return 'ended';
    return null;
  };

  const nextTarget = getNextTransitionTarget(session.status);
  const nextTargetLabels: Record<string, string> = {
    scheduled: 'برنامه‌ریزی و انتشار جلسه',
    started: 'شروع رسمی جلسه (زنده)',
    ended: 'اتمام جلسه',
  };

  return (
    <div className="space-y-6 text-start pb-16">
      {/* Back button */}
      <div>
        <button
          type="button"
          onClick={() => navigate('/sessions')}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>بازگشت به فهرست جلسات</span>
        </button>
      </div>

      {/* Session Header Card */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">{session.title}</h1>
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded-lg ${
                  session.status === 'started'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-bold'
                    : session.status === 'scheduled'
                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                    : session.status === 'ended'
                    ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {session.status === 'started'
                  ? 'در حال برگزاری'
                  : session.status === 'scheduled'
                  ? 'برنامه‌ریزی‌شده'
                  : session.status === 'ended'
                  ? 'پایان‌یافته'
                  : 'پیش‌نویس'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
              {session.description || 'بدون توضیح'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {nextTarget && (
              <Button
                size="sm"
                loading={transitionMutation.isPending}
                onClick={() => transitionMutation.mutate(nextTarget)}
                icon={<Play className="w-3.5 h-3.5" />}
              >
                {nextTargetLabels[nextTarget]}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              onClick={() => setDeleteConfirmOpen(true)}
              icon={<Trash2 className="w-3.5 h-3.5" />}
            >
              حذف جلسه
            </Button>
          </div>
        </div>

        {/* Status Stepper Progression */}
        <div className="pt-2">
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            {[
              { key: 'draft', label: 'پیش‌نویس' },
              { key: 'scheduled', label: 'برنامه‌ریزی‌شده' },
              { key: 'started', label: 'در حال برگزاری' },
              { key: 'ended', label: 'پایان‌یافته' },
            ].map((step, idx) => {
              const states: SessionState[] = ['draft', 'scheduled', 'started', 'ended'];
              const currentIdx = states.indexOf(session.status);
              const isPast = currentIdx >= idx;
              const isCurrent = currentIdx === idx;

              return (
                <div key={step.key} className="space-y-1">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      isCurrent
                        ? 'bg-indigo-600 dark:bg-indigo-500'
                        : isPast
                        ? 'bg-[#251D59] dark:bg-indigo-700'
                        : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  />
                  <span
                    className={`text-[11px] ${
                      isCurrent
                        ? 'font-bold text-indigo-600 dark:text-indigo-400'
                        : isPast
                        ? 'font-medium text-slate-800 dark:text-slate-200'
                        : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="info">مشخصات و مکان</TabsTrigger>
          <TabsTrigger value="members">
            اعضا و درخواست‌ها ({toPersianDigits(session.counts?.members || 0)})
          </TabsTrigger>
          <TabsTrigger value="attendance">
            حاضرین ({toPersianDigits(session.counts?.attendance || 0)})
          </TabsTrigger>
          <TabsTrigger value="queue">صف نوبت تلاوت</TabsTrigger>
          <TabsTrigger value="evaluations">
            ارزیابی‌ها ({toPersianDigits(session.counts?.evaluations || 0)})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Info */}
        <TabsContent value="info" className="space-y-4">
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">جزئیات زمان و مکان برگزاری</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 space-y-2">
                <span className="text-slate-400 block font-medium">مکان جلسه:</span>
                <span className="font-bold text-slate-900 dark:text-white block text-sm">
                  {session.location?.label || 'مکان ثبت نشده'}
                </span>
                {session.location?.routeUrl && (
                  <a
                    href={session.location.routeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 hover:underline pt-1"
                  >
                    <span>مشاهده نقشه و مسیریابی</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 space-y-2">
                <span className="text-slate-400 block font-medium">زمان‌بندی:</span>
                <span className="font-bold text-slate-900 dark:text-white block text-sm">
                  {session.schedule.type === 'once'
                    ? `تک جلسه: ${formatJalaliDate(session.schedule.startsAt, 'full')}`
                    : `تکرارشونده در روزهای هفته (ساعت ${session.schedule.timeOfDay})`}
                </span>
                <span className="text-[11px] text-slate-500 block">
                  سازنده: {session.createdBy?.name || 'مدیر'} · ایجاد: {formatJalaliDate(session.createdAt, 'short')}
                </span>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Members */}
        <TabsContent value="members" className="space-y-4">
          {loadingMembers ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-2xl" />
              ))}
            </div>
          ) : members && members.length > 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs divide-y divide-slate-100 dark:divide-slate-800">
              {members.map((m) => (
                <div key={m.id} className="p-4 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">{m.name}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md ${
                          m.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-700'
                            : m.status === 'pending'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {m.status === 'approved' ? 'عضو تأیید شده' : m.status === 'pending' ? 'در انتظار تأیید' : 'رد شده'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {m.status === 'pending' && (
                      <>
                        <Button
                          size="sm"
                          variant="subtle"
                          className="h-8 text-xs px-2.5"
                          onClick={() => decideMemberMutation.mutate({ memberId: m.id, action: 'approve' })}
                        >
                          تأیید عضویت
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs px-2 text-rose-600"
                          onClick={() => decideMemberMutation.mutate({ memberId: m.id, action: 'reject' })}
                        >
                          رد
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                      onClick={() => removeMemberMutation.mutate(m.id)}
                    >
                      حذف از جلسه
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-400 text-center py-8">عضوی ثبت نشده است</div>
          )}
        </TabsContent>

        {/* Tab 3: Attendance */}
        <TabsContent value="attendance">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">فهرست حاضرین در جلسه</h3>
            {loadingAttendance ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-2xl" />
                ))}
              </div>
            ) : attendance?.items && attendance.items.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {attendance.items.map((entry) => (
                  <div key={entry.userId} className="py-3 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900 dark:text-white">{entry.name}</span>
                    <span className="text-slate-400">ورود: {formatJalaliDate(entry.enteredAt, 'medium')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-400 text-center py-8">حاضری ثبت نشده است</div>
            )}
          </div>
        </TabsContent>

        {/* Tab 4: Queue */}
        <TabsContent value="queue">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-6">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">صف نوبت تلاوت و ارائه</h3>

            {/* Current Reader Card */}
            {queue?.current ? (
              <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-indigo-700 dark:text-indigo-300 font-bold block">
                    نوبت تلاوت جاری:
                  </span>
                  <span className="text-base font-bold text-slate-900 dark:text-white">
                    {queue.current.name || 'قاری ناشناس'}
                  </span>
                </div>
                <span className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-xl animate-pulse">
                  در حال تلاوت
                </span>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-400">
                در حال حاضر نوبت تلاوت جاری فعالی وجود ندارد.
              </div>
            )}

            {/* Waiting List */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-500">افراد در انتظار نوبت:</h4>
              {queue?.waiting && queue.waiting.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
                  {queue.waiting.map((w, idx) => (
                    <div key={w.id} className="p-3 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px]">
                          {toPersianDigits(idx + 1)}
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{w.name}</span>
                      </div>
                      <span className="text-slate-400 text-[11px]">
                        ورود به صف: {formatJalaliDate(w.joinedAt, 'medium')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-3">صف انتظار خالی است</p>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Tab 5: Evaluations */}
        <TabsContent value="evaluations">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">ارزیابی‌های ثبت‌شده برای جلسه</h3>
            {loadingEvals ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-2xl" />
                ))}
              </div>
            ) : evaluations?.items && evaluations.items.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {evaluations.items.map((ev) => (
                  <div key={ev.id} className="py-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">{ev.userName}</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono text-sm">
                        نمره: {toPersianDigits(ev.score)} / ۱۰۰
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 text-[11px]">
                      <span>داور: {ev.evaluatorName}</span>
                      {/* ۱.۷.۰: snapshot معیارهای پویا در لحظهٔ ثبت */}
                      {ev.criteria.map((c) => (
                        <span key={c.criterionId}>
                          {c.title}: {toPersianDigits(c.score)}/{toPersianDigits(c.maxScore)}
                        </span>
                      ))}
                      <span>امتیاز اعطا شده: +{toPersianDigits(ev.points)}</span>
                    </div>
                    {ev.note && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl">
                        یادداشت: {ev.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-400 text-center py-8">ارزیابی ثبت نشده است</div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="حذف جلسه قرآنی"
        description="آیا از حذف این جلسه اطمینان دارید؟ اطلاعات جلسه پس از حذف نرم فقط در بایگانی پنل قابل مشاهده است."
        onConfirm={() => deleteMutation.mutate()}
        loading={deleteMutation.isPending}
        isDestructive
      />
    </div>
  );
};
