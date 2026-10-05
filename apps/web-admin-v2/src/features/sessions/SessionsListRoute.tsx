import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calendar,
  Search,
  Plus,
  Clock,
  MapPin,
  Users,
  ChevronLeft,
  CalendarCheck,
  CheckCircle2,
} from 'lucide-react';
import { H60_getSessions } from '@/api/endpoints/sessions';
import { SessionCreateModal } from './SessionCreateModal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatJalaliDate } from '@/lib/jalali';
import { formatNumber, toPersianDigits } from '@/lib/format';
import { SessionState } from '@/api/types';

export const SessionsListRoute: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const page = Number(searchParams.get('page')) || 1;
  const pageSize = Number(searchParams.get('pageSize')) || 25;
  const q = searchParams.get('q') || '';
  const status = (searchParams.get('status') as SessionState) || undefined;
  const sort = (searchParams.get('sort') as 'newest' | 'oldest' | 'title') || 'newest';

  const [searchInput, setSearchInput] = useState(q);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      if (searchInput !== q) {
        updateFilter('q', searchInput || undefined, true);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  const updateFilter = (key: string, value: string | undefined, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (resetPage) next.set('page', '1');
    setSearchParams(next);
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['sessions', { page, pageSize, q, status, sort }],
    queryFn: () =>
      H60_getSessions({
        page,
        pageSize,
        q: q || undefined,
        status,
        sort,
      }),
    staleTime: 15000,
  });

  const getStatusBadge = (st: SessionState) => {
    switch (st) {
      case 'started':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>در حال برگزاری</span>
          </span>
        );
      case 'scheduled':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 font-medium">
            <span>برنامه‌ریزی‌شده</span>
          </span>
        );
      case 'ended':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <span>پایان‌یافته</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800">
            <span>پیش‌نویس (Draft)</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 text-start pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>جلسات و کلاس‌های قرآنی</span>
            {data?.total !== undefined && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold">
                {formatNumber(data.total)} جلسه
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            برنامه‌ریزی، مدیریت اعضا، صف نوبت تلاوت و ثبت ارزیابی‌های تجوید و صوت
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => setCreateModalOpen(true)}
          icon={<Plus className="w-4 h-4" />}
        >
          جلسه جدید
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            placeholder="جست‌وجوی عنوان جلسه، مکان..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            startIcon={<Search className="w-4 h-4" />}
          />

          <Select
            value={status || ''}
            onChange={(e) => updateFilter('status', e.target.value || undefined)}
            options={[
              { value: '', label: 'همه وضعیت‌ها' },
              { value: 'draft', label: 'پیش‌نویس' },
              { value: 'scheduled', label: 'برنامه‌ریزی‌شده' },
              { value: 'started', label: 'در حال برگزاری' },
              { value: 'ended', label: 'پایان‌یافته' },
            ]}
          />

          <Select
            value={sort}
            onChange={(e) => updateFilter('sort', e.target.value)}
            options={[
              { value: 'newest', label: 'جدیدترین جلسات' },
              { value: 'oldest', label: 'قدیمی‌ترین جلسات' },
              { value: 'title', label: 'ترتیب عنوان' },
            ]}
          />
        </div>
      </div>

      {/* Sessions Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-3xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data?.items || data.items.length === 0 ? (
        <EmptyState
          title="جلسه‌ای یافت نشد"
          description="جلسه جدیدی بسازید تا فرآیند عضویت و ارزیابی آغاز شود."
          actionLabel="ایجاد جلسه جدید"
          onAction={() => setCreateModalOpen(true)}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.items.map((sess) => (
              <div
                key={sess.id}
                onClick={() => navigate(`/sessions/${sess.id}`)}
                className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1">
                      {sess.title}
                    </h3>
                    {getStatusBadge(sess.status)}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                    {sess.description || 'بدون توضیح'}
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{sess.location?.label || 'مکان ثبت نشده'}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>{toPersianDigits(sess.counts?.members || 0)} عضو</span>
                    </span>
                    <span className="text-slate-400">
                      سازنده: {sess.createdBy?.name || 'مدیر'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Pagination
            currentPage={page}
            totalItems={data.total}
            pageSize={pageSize}
            onPageChange={(p) => updateFilter('page', String(p), false)}
            onPageSizeChange={(s) => updateFilter('pageSize', String(s), true)}
          />
        </div>
      )}

      {/* Create Modal */}
      <SessionCreateModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSuccess={(id) => navigate(`/sessions/${id}`)}
      />
    </div>
  );
};
