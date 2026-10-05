import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  TrendingUp,
  Download,
  Users,
  Calendar,
  MessageSquare,
  Award,
} from 'lucide-react';
import {
  H80_getReportOverview,
  H81_getRegistrationsSeries,
  H82_getSessionsSeries,
  H83_getOtpSeries,
  H84_getLeaderboard,
} from '@/api/endpoints/reports';
import { LineAreaChart } from '@/components/ui/Charts/LineAreaChart';
import { BarChart } from '@/components/ui/Charts/BarChart';
import { DonutChart } from '@/components/ui/Charts/DonutChart';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { downloadCsv } from '@/lib/csv';
import { formatNumber, toPersianDigits } from '@/lib/format';

export const ReportsRoute: React.FC = () => {
  const [interval, setInterval] = useState<'day' | 'week' | 'month'>('day');
  const [activeReportTab, setActiveReportTab] = useState<'registrations' | 'sessions' | 'otp' | 'leaderboard'>('registrations');

  // Overall Report Overview
  const { data: overview, isLoading: loadingOverview, error: errorOverview, refetch } = useQuery({
    queryKey: ['reports', 'overview'],
    queryFn: () => H80_getReportOverview(),
    staleTime: 30000,
  });

  // Registrations Series
  const { data: regSeries, isLoading: loadingRegs } = useQuery({
    queryKey: ['reports', 'registrations', interval],
    queryFn: () => H81_getRegistrationsSeries({ interval }),
    staleTime: 30000,
  });

  // Sessions Series
  const { data: sessionSeries, isLoading: loadingSess } = useQuery({
    queryKey: ['reports', 'sessions', interval],
    queryFn: () => H82_getSessionsSeries({ interval }),
    staleTime: 30000,
  });

  // OTP Series
  const { data: otpSeries, isLoading: loadingOtp } = useQuery({
    queryKey: ['reports', 'otp', interval],
    queryFn: () => H83_getOtpSeries({ interval }),
    staleTime: 30000,
  });

  // Leaderboard
  const { data: leaderboard, isLoading: loadingLead } = useQuery({
    queryKey: ['reports', 'leaderboard', 20],
    queryFn: () => H84_getLeaderboard({ limit: 20 }),
    staleTime: 60000,
  });

  if (errorOverview) {
    return <ErrorState error={errorOverview} onRetry={() => refetch()} />;
  }

  // Export handlers
  const exportCurrentSeries = () => {
    if (activeReportTab === 'registrations' && regSeries?.items) {
      const headers = ['بازه زمانی', 'تعداد ثبت‌نام'];
      const rows = regSeries.items.map((i) => [i.bucket, i.count]);
      downloadCsv(`registrations-${interval}-${Date.now()}`, headers, rows);
    } else if (activeReportTab === 'sessions' && sessionSeries?.items) {
      const headers = ['بازه زمانی', 'ایجاد شده', 'برگزار شده', 'حاضرین'];
      const rows = sessionSeries.items.map((i) => [i.bucket, i.created, i.held, i.attendance]);
      downloadCsv(`sessions-${interval}-${Date.now()}`, headers, rows);
    } else if (activeReportTab === 'otp' && otpSeries?.items) {
      const headers = ['بازه زمانی', 'پیامک درخواستی', 'تأیید شده'];
      const rows = otpSeries.items.map((i) => [i.bucket, i.requested, i.verified]);
      downloadCsv(`otp-${interval}-${Date.now()}`, headers, rows);
    } else if (activeReportTab === 'leaderboard' && leaderboard?.items) {
      const headers = ['شناسه کاربر', 'نام', 'امتیاز', 'نشان‌ها'];
      const rows = leaderboard.items.map((i) => [i.userId, i.name, i.points, i.badges]);
      downloadCsv(`leaderboard-${Date.now()}`, headers, rows);
    }
  };

  return (
    <div className="space-y-6 text-start pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            <span>گزارش‌ها و تحلیل آماری سامانه</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            روند ثبت‌نام کاربران، جلسات برگزارشده، پیامک‌های تأیید و رتبه‌بندی قرآن‌آموزان
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={interval}
            onChange={(e) => setInterval(e.target.value as 'day' | 'week' | 'month')}
            options={[
              { value: 'day', label: 'تفکیک روزانه' },
              { value: 'week', label: 'تفکیک هفتگی (شنبه تا جمعه)' },
              { value: 'month', label: 'تفکیک ماهانه' },
            ]}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={exportCurrentSeries}
            icon={<Download className="w-3.5 h-3.5" />}
          >
            خروجی اکسل
          </Button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-2">
          <span className="text-xs text-slate-400">کاربران ثبت‌نامی</span>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {formatNumber(overview?.users.total || 0)}
          </div>
          <span className="text-[11px] text-emerald-600 block">
            {toPersianDigits(overview?.users.byStatus.active || 0)} حساب فعال
          </span>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-2">
          <span className="text-xs text-slate-400">کل جلسات</span>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {formatNumber(overview?.sessions.total || 0)}
          </div>
          <span className="text-[11px] text-slate-400 block">
            {toPersianDigits(overview?.sessions.byStatus.ended || 0)} جلسه تکمیل شده
          </span>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-2">
          <span className="text-xs text-slate-400">مجموع حضورها</span>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {formatNumber(overview?.participation.attendance || 0)}
          </div>
          <span className="text-[11px] text-indigo-600 block">
            {formatNumber(overview?.participation.evaluations || 0)} ارزیابی
          </span>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-2">
          <span className="text-xs text-slate-400">امتیازات اعطایی</span>
          <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 font-mono">
            {formatNumber(overview?.participation.pointsAwarded || 0)}
          </div>
          <span className="text-[11px] text-slate-400 block">
            میانگین نمرات: {toPersianDigits(overview?.participation.avgScore?.toFixed(1) || '۰')}
          </span>
        </div>
      </div>

      {/* Series Tabs */}
      <Tabs value={activeReportTab} onValueChange={(v) => setActiveReportTab(v as typeof activeReportTab)}>
        <TabsList>
          <TabsTrigger value="registrations">روند ثبت‌نام کاربران</TabsTrigger>
          <TabsTrigger value="sessions">روند برگزاری جلسات</TabsTrigger>
          <TabsTrigger value="otp">آمار پیامک‌های OTP</TabsTrigger>
          <TabsTrigger value="leaderboard">جدول برترین‌های قرآن</TabsTrigger>
        </TabsList>

        {/* Tab 1: Registrations Chart */}
        <TabsContent value="registrations">
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-6">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">نمودار زمانی ثبت‌نام‌ها</h3>
            {loadingRegs ? (
              <Skeleton className="h-64 w-full rounded-2xl" />
            ) : regSeries?.items && regSeries.items.length > 0 ? (
              <LineAreaChart
                title="روند ثبت‌نام"
                primaryLabel="تعداد کاربر جدید"
                data={regSeries.items.map((i) => ({ label: i.bucket, value: i.count }))}
                primaryColor="#6E56CF"
              />
            ) : (
              <p className="text-xs text-slate-400 text-center py-12">داده‌ای یافت نشد</p>
            )}
          </div>
        </TabsContent>

        {/* Tab 2: Sessions Chart */}
        <TabsContent value="sessions">
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-6">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">نمودار جلسات برگزارشده و حضور</h3>
            {loadingSess ? (
              <Skeleton className="h-64 w-full rounded-2xl" />
            ) : sessionSeries?.items && sessionSeries.items.length > 0 ? (
              <LineAreaChart
                title="جلسات و حضور"
                primaryLabel="جلسات برگزارشده"
                secondaryLabel="تعداد حضور"
                data={sessionSeries.items.map((i) => ({
                  label: i.bucket,
                  value: i.held,
                  secondaryValue: i.attendance,
                }))}
                primaryColor="#10B981"
                secondaryColor="#0EA5E9"
              />
            ) : (
              <p className="text-xs text-slate-400 text-center py-12">داده‌ای یافت نشد</p>
            )}
          </div>
        </TabsContent>

        {/* Tab 3: OTP Chart */}
        <TabsContent value="otp">
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-6">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">پیامک‌های درخواستی و تأییدشده</h3>
            {loadingOtp ? (
              <Skeleton className="h-64 w-full rounded-2xl" />
            ) : otpSeries?.items && otpSeries.items.length > 0 ? (
              <LineAreaChart
                title="پیامک‌های OTP"
                primaryLabel="پیامک ارسالی"
                secondaryLabel="کد تأییدشده"
                data={otpSeries.items.map((i) => ({
                  label: i.bucket,
                  value: i.requested,
                  secondaryValue: i.verified,
                }))}
                primaryColor="#F59E0B"
                secondaryColor="#10B981"
              />
            ) : (
              <p className="text-xs text-slate-400 text-center py-12">داده‌ای یافت نشد</p>
            )}
          </div>
        </TabsContent>

        {/* Tab 4: Leaderboard */}
        <TabsContent value="leaderboard">
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">رتبه‌بندی قرآن‌آموزان برتر</h3>
            {loadingLead ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-2xl" />
                ))}
              </div>
            ) : leaderboard?.items && leaderboard.items.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
                {leaderboard.items.map((item, idx) => (
                  <div key={item.userId} className="p-3.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                          idx === 0
                            ? 'bg-amber-100 text-amber-800'
                            : idx === 1
                            ? 'bg-slate-200 text-slate-700'
                            : idx === 2
                            ? 'bg-amber-50 text-amber-700'
                            : 'text-slate-400'
                        }`}
                      >
                        {toPersianDigits(idx + 1)}
                      </span>
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white">{item.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                          {item.userId.slice(0, 8)}...
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-slate-500">{toPersianDigits(item.badges)} نشان</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono text-sm">
                        {formatNumber(item.points)} امتیاز
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-12">رتبه‌بندی فعالی موجود نیست</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
