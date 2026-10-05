import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Calendar,
  MessageSquare,
  Award,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  ChevronLeft,
  Sparkles,
  TrendingUp,
  UserPlus,
} from 'lucide-react';
import { H01_getOverview } from '@/api/endpoints/system';
import { H80_getReportOverview, H84_getLeaderboard } from '@/api/endpoints/reports';
import { H60_getSessions } from '@/api/endpoints/sessions';
import { formatNumber, toPersianDigits } from '@/lib/format';
import { formatJalaliDate } from '@/lib/jalali';
import { Sparkline } from '@/components/ui/Charts/Sparkline';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';

export const OverviewRoute: React.FC = () => {
  const navigate = useNavigate();

  // Overview query with 60s auto-refresh (paused when tab hidden)
  const {
    data: overview,
    isLoading: loadingOverview,
    error: errorOverview,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: ['system', 'overview'],
    queryFn: H01_getOverview,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });

  // Reports overview query
  const { data: reports, isLoading: loadingReports } = useQuery({
    queryKey: ['reports', 'overview'],
    queryFn: () => H80_getReportOverview(),
    staleTime: 30000,
  });

  // Leaderboard top 5 query
  const { data: leaderboard, isLoading: loadingLeaderboard } = useQuery({
    queryKey: ['reports', 'leaderboard', 5],
    queryFn: () => H84_getLeaderboard({ limit: 5 }),
    staleTime: 60000,
  });

  // Recent Sessions
  const { data: sessionsData, isLoading: loadingSessions } = useQuery({
    queryKey: ['sessions', 'recent'],
    queryFn: () => H60_getSessions({ pageSize: 5, sort: 'newest' }),
    staleTime: 30000,
  });

  if (errorOverview) {
    return <ErrorState error={errorOverview} onRetry={() => refetchOverview()} />;
  }

  return (
    <div className="space-y-6 sm:space-y-8 text-start animate-in fade-in-50 duration-300">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Users */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-[0_10px_25px_-5px_rgba(15,23,42,0.03)] flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">کاربران سامانه</span>
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-end justify-between">
            {loadingOverview ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div>
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {formatNumber(overview?.users.total ?? 0)}
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  {toPersianDigits(overview?.users.admins ?? 0)} مدیر سیستمی
                </span>
              </div>
            )}
            <Sparkline data={[12, 19, 15, 25, 22, 30, 38]} color="#6E56CF" />
          </div>
        </div>

        {/* KPI 2: Sessions */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-[0_10px_25px_-5px_rgba(15,23,42,0.03)] flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">جلسات قرآنی فعال</span>
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-end justify-between">
            {loadingOverview ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div>
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {formatNumber((overview?.sessions.scheduled ?? 0) + (overview?.sessions.started ?? 0))}
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  {toPersianDigits(overview?.sessions.ended ?? 0)} پایان یافته
                </span>
              </div>
            )}
            <Sparkline data={[5, 8, 12, 10, 15, 14, 20]} color="#10B981" />
          </div>
        </div>

        {/* KPI 3: OTP / Messages */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-[0_10px_25px_-5px_rgba(15,23,42,0.03)] flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">پیامک‌های تأیید (OTP)</span>
            <div className="w-9 h-9 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-end justify-between">
            {loadingReports ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div>
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {formatNumber(reports?.messaging?.otpRequested ?? 0)}
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  {formatNumber(reports?.messaging?.otpVerified ?? 0)} تأیید شده
                </span>
              </div>
            )}
            <Sparkline data={[40, 55, 35, 60, 50, 75, 80]} color="#F59E0B" />
          </div>
        </div>

        {/* KPI 4: Evaluations & Points */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-[0_10px_25px_-5px_rgba(15,23,42,0.03)] flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">ارزیابی‌های ثبت‌شده</span>
            <div className="w-9 h-9 rounded-2xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-end justify-between">
            {loadingReports ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div>
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {formatNumber(reports?.participation.evaluations ?? 0)}
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  میانگین نمره: {toPersianDigits(reports?.participation.avgScore?.toFixed(1) ?? '۰')}
                </span>
              </div>
            )}
            <Sparkline data={[8, 14, 12, 18, 24, 22, 29]} color="#0EA5E9" />
          </div>
        </div>
      </div>

      {/* Hero Visual Timeline Section Inspired by Reference Image */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-[0_10px_25px_-5px_rgba(15,23,42,0.03)] space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">تقویم و وضعیت جلسات قرآن</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              نمای زمان‌بندی جلسات برگزار شده، در حال اجرا و برنامه‌ریزی شده در طول هفته
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/sessions')}
            icon={<ArrowUpRight className="w-3.5 h-3.5" />}
          >
            مشاهده تمام جلسات
          </Button>
        </div>

        {/* Visual schedule grid from reference image */}
        <div className="overflow-x-auto pt-2">
          <div className="min-w-[700px] border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
            {/* Days header */}
            <div className="grid grid-cols-8 bg-slate-50/80 dark:bg-slate-800/60 text-center py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800">
              <div className="col-span-1 text-start ps-4">جلسه / مدیر</div>
              <div>شنبه</div>
              <div>یک‌شنبه</div>
              <div>دوشنبه</div>
              <div>سه‌شنبه</div>
              <div>چهارشنبه</div>
              <div className="text-amber-600 dark:text-amber-400">پنج‌شنبه</div>
              <div className="text-rose-600 dark:text-rose-400">جمعه</div>
            </div>

            {/* Visual Row 1: Active Sessions with Gradient Pill */}
            <div className="grid grid-cols-8 items-center py-3.5 border-b border-slate-100 dark:border-slate-800/60 text-xs">
              <div className="col-span-1 ps-4 flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold flex items-center justify-center text-[10px]">
                  ق
                </div>
                <div className="truncate">
                  <div className="font-bold text-slate-900 dark:text-white truncate">کلاس تجوید پیشرفته</div>
                  <div className="text-[10px] text-slate-400 truncate">استاد رضایی</div>
                </div>
              </div>
              <div className="col-span-3 px-1">
                {/* Purple gradient card from reference */}
                <div className="p-2 rounded-xl bg-gradient-to-r from-[#7928CA] to-[#9B51E0] text-white shadow-sm flex items-center justify-between">
                  <span className="font-bold truncate text-[11px]">برگزاری منظم (ساعت ۱۸)</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20">تأیید شده</span>
                </div>
              </div>
              <div className="col-span-2 px-1">
                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-slate-400 text-center text-[11px]">
                  تمرین انفرادی
                </div>
              </div>
              <div className="col-span-2 px-1 bg-stripes-muted h-9 rounded-lg" />
            </div>

            {/* Visual Row 2: Emerald Gradient Session */}
            <div className="grid grid-cols-8 items-center py-3.5 border-b border-slate-100 dark:border-slate-800/60 text-xs">
              <div className="col-span-1 ps-4 flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center text-[10px]">
                  ح
                </div>
                <div className="truncate">
                  <div className="font-bold text-slate-900 dark:text-white truncate">حفظ جزء ۳۰ قرآن</div>
                  <div className="text-[10px] text-slate-400 truncate">استاد کاظمی</div>
                </div>
              </div>
              <div className="col-span-1 px-1" />
              <div className="col-span-3 px-1">
                {/* Emerald gradient card from reference */}
                <div className="p-2 rounded-xl bg-gradient-to-r from-[#10B981] to-[#059669] text-white shadow-sm flex items-center justify-between">
                  <span className="font-bold truncate text-[11px]">جلسه پرسش و تثبیت محفوظات</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20">فعال</span>
                </div>
              </div>
              <div className="col-span-2 px-1">
                {/* Blue frosted card */}
                <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300 flex items-center justify-between">
                  <span className="truncate text-[11px]">آزمون دوره‌ای</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900">در انتظار</span>
                </div>
              </div>
              <div className="col-span-1 px-1 bg-stripes-muted h-9 rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid: 3 Distinct Feature Cards from Reference */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: Future Events / Upcoming Quran Sessions */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-[0_10px_25px_-5px_rgba(15,23,42,0.03)] space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">رویدادها و جلسات پیش‌رو</h3>
              <button
                type="button"
                onClick={() => navigate('/sessions')}
                className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-medium inline-flex items-center gap-1 cursor-pointer"
              >
                <span>مشاهده همه</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Highlighted Yellow Event Banner */}
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-start space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                  همایش سالانه مربیان قرآن
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500 text-white font-medium">
                  به‌زودی
                </span>
              </div>
              <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                بررسی روش‌های نوین آموزش تجوید و صوت و لحن
              </p>
              <div className="flex items-center gap-3 pt-1 text-[11px] text-amber-900 dark:text-amber-300">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>۱۶:۰۰ - ۱۸:۰۰</span>
                </span>
                <span>شنبه، ۲۰ آبان</span>
              </div>
            </div>

            {/* List of Recent Sessions */}
            <div className="space-y-2.5">
              {loadingSessions ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
              ) : sessionsData?.items && sessionsData.items.length > 0 ? (
                sessionsData.items.slice(0, 3).map((sess) => (
                  <div
                    key={sess.id}
                    onClick={() => navigate(`/sessions/${sess.id}`)}
                    className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800 transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{sess.title}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        سازنده: {sess.createdBy?.name || 'مدیر'} · {toPersianDigits(sess.counts.members)} عضو
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-lg font-medium ${
                        sess.status === 'started'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40'
                          : sess.status === 'scheduled'
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800'
                      }`}
                    >
                      {sess.status === 'started'
                        ? 'در حال برگزاری'
                        : sess.status === 'scheduled'
                        ? 'برنامه‌ریزی‌شده'
                        : 'پیش‌نویس'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400 text-center py-4">جلسه‌ای ثبت نشده است</div>
              )}
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full mt-2"
            onClick={() => navigate('/sessions?create=true')}
          >
            + ایجاد جلسه جدید
          </Button>
        </div>

        {/* Card 2: Leaderboard Top Quran Learners */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-[0_10px_25px_-5px_rgba(15,23,42,0.03)] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">برترین‌های قرآن (امتیاز)</h3>
            <button
              type="button"
              onClick={() => navigate('/reports')}
              className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <span>گزارش کامل</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {loadingLeaderboard ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : leaderboard?.items && leaderboard.items.length > 0 ? (
              leaderboard.items.map((item, idx) => (
                <div
                  key={item.userId}
                  className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : idx === 1
                          ? 'bg-slate-200 text-slate-700 dark:bg-slate-700'
                          : idx === 2
                          ? 'bg-amber-50 text-amber-700'
                          : 'text-slate-400'
                      }`}
                    >
                      {toPersianDigits(idx + 1)}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{item.name}</div>
                      <div className="text-[10px] text-slate-400">
                        {toPersianDigits(item.badges)} نشان افتخار
                      </div>
                    </div>
                  </div>
                  <div className="text-end">
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                      {formatNumber(item.points)}
                    </span>
                    <span className="text-[10px] text-slate-400 ms-1">امتیاز</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-400 text-center py-6">رتبه‌بندی فعالی یافت نشد</div>
            )}
          </div>
        </div>

        {/* Card 3: Quick Action Hub & System Health */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-[0_10px_25px_-5px_rgba(15,23,42,0.03)] space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            {/* Visual Glassmorphic Orb Accent */}
            <div className="flex items-center justify-center pt-2">
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-tr from-[#251D59] via-[#6E56CF] to-[#38BDF8] p-0.5 shadow-xl shadow-indigo-500/10 flex items-center justify-center">
                <div className="w-full h-full rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white">
                  <Sparkles className="w-8 h-8" />
                </div>
              </div>
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">سامانه هوشمند یادگیری اسراء</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                مدیریت نقش‌ها، نظارت بر صف ارزیابی و گزارش‌های زنده
              </p>
            </div>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => navigate('/users?create=true')}
                className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-start text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors flex flex-col gap-1 cursor-pointer"
              >
                <UserPlus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>ثبت کاربر</span>
              </button>

              <button
                type="button"
                onClick={() => navigate('/access/matrix')}
                className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-start text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors flex flex-col gap-1 cursor-pointer"
              >
                <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>ماتریس دسترسی</span>
              </button>
            </div>
          </div>

          {/* Recent Audit Item */}
          {overview?.lastAudit && overview.lastAudit.length > 0 && (
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-start text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <div className="truncate">
                <span className="font-bold">{overview.lastAudit[0]?.actor.name}: </span>
                <span>{overview.lastAudit[0]?.summary}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
