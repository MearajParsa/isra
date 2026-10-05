import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Users,
  Search,
  Filter,
  Download,
  Plus,
  ArrowUpDown,
  UserCheck,
  UserX,
  Shield,
  Layers,
  ChevronLeft,
} from 'lucide-react';
import { H20_getUsers } from '@/api/endpoints/users';
import { H10_getRoles } from '@/api/endpoints/roles';
import { UserCreateModal } from './UserCreateModal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableDensity } from '@/components/ui/Table';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { downloadCsv } from '@/lib/csv';
import { formatJalaliDate } from '@/lib/jalali';
import { formatNumber, toPersianDigits, maskPhoneNumber, formatPhoneNumber } from '@/lib/format';
import { SystemUser, UserStatus } from '@/api/types';

export const UsersListRoute: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showSuccess, showError } = useToast();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [density, setDensity] = useState<TableDensity>('relaxed');
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const cancelExportRef = useRef(false);

  // Parse filters from URL
  const page = Number(searchParams.get('page')) || 1;
  const pageSize = Number(searchParams.get('pageSize')) || 25;
  const q = searchParams.get('q') || '';
  const role = searchParams.get('role') || '';
  const status = (searchParams.get('status') as UserStatus) || undefined;
  const createdFrom = searchParams.get('createdFrom') || '';
  const createdTo = searchParams.get('createdTo') || '';
  const sort = (searchParams.get('sort') as 'newest' | 'oldest' | 'name') || 'newest';

  // Check URL if create modal requested (?create=true)
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setCreateModalOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('create');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Local debounced search input state
  const [searchInput, setSearchInput] = useState(q);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchInput !== q) {
        updateFilter('q', searchInput || undefined, true);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  const updateFilter = (key: string, value: string | undefined, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (resetPage) {
      next.set('page', '1');
    }
    setSearchParams(next);
  };

  // Fetch Roles for filter dropdown
  const { data: roles } = useQuery({
    queryKey: ['system', 'roles'],
    queryFn: () => H10_getRoles(),
    staleTime: 60000,
  });

  // Fetch Users Query
  const { data, isLoading, isPlaceholderData, error, refetch } = useQuery({
    queryKey: ['system', 'users', { page, pageSize, q, role, status, createdFrom, createdTo, sort }],
    queryFn: () =>
      H20_getUsers({
        page,
        pageSize,
        q: q || undefined,
        role: role || undefined,
        status,
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
        sort,
      }),
    placeholderData: keepPreviousData,
    staleTime: 15000,
  });

  // Batch CSV Export of filtered list
  const handleExportCsv = async () => {
    setExporting(true);
    setExportProgress(0);
    cancelExportRef.current = false;

    try {
      const allRows: (string | number)[][] = [];
      let currentPage = 1;
      const batchSize = 50;
      let totalFetched = 0;
      let totalCount = data?.total ?? 100;

      while (!cancelExportRef.current) {
        const batch = await H20_getUsers({
          page: currentPage,
          pageSize: batchSize,
          q: q || undefined,
          role: role || undefined,
          status,
          createdFrom: createdFrom || undefined,
          createdTo: createdTo || undefined,
          sort,
        });

        totalCount = batch.total;
        batch.items.forEach((u) => {
          allRows.push([
            u.id,
            u.name,
            u.phone,
            u.status === 'active' ? 'فعال' : u.status === 'disabled' ? 'غیرفعال' : 'حذف شده',
            u.roles.join('; '),
            formatJalaliDate(u.createdAt, 'short'),
          ]);
        });

        totalFetched += batch.items.length;
        setExportProgress(Math.min(100, Math.round((totalFetched / Math.max(1, totalCount)) * 100)));

        if (batch.items.length < batchSize || totalFetched >= totalCount) {
          break;
        }

        currentPage++;
        // Respect rate limit with polite pause
        await new Promise((r) => setTimeout(r, 200));
      }

      if (!cancelExportRef.current) {
        const headers = ['شناسه کاربر', 'نام و نام‌خانوادگی', 'شماره موبایل', 'وضعیت', 'نقش‌ها', 'تاریخ ثبت‌نام'];
        downloadCsv(`users-export-${Date.now()}`, headers, allRows);
        showSuccess(`تعداد ${formatNumber(allRows.length)} کاربر با موفقیت در فایل اکسل بارگیری شد`);
      }
    } catch (err) {
      showError(err, 'خطا در استخراج فایل اکسل کاربران');
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  };

  return (
    <div className="space-y-6 text-start pb-12">
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>مدیریت کاربران سامانه</span>
            {data?.total !== undefined && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold">
                {formatNumber(data.total)} کاربر
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            مشاهده، ویرایش نقش‌ها، نشست‌ها و مدیریت سطوح دسترسی کاربران
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            disabled={exporting || (data?.total ?? 0) === 0}
            onClick={handleExportCsv}
            icon={<Download className="w-3.5 h-3.5" />}
          >
            {exporting ? `در حال استخراج (${toPersianDigits(exportProgress)}٪)` : 'خروجی اکسل (CSV)'}
          </Button>

          <Button
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            کاربر جدید
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Box */}
          <Input
            placeholder="جست‌وجوی نام، شماره موبایل..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            startIcon={<Search className="w-4 h-4" />}
          />

          {/* Role Filter */}
          <Select
            value={role}
            onChange={(e) => updateFilter('role', e.target.value || undefined)}
            options={[
              { value: '', label: 'همه نقش‌ها' },
              { value: 'none', label: 'بدون نقش سیستم' },
              ...(roles || []).map((r) => ({ value: r.key, label: r.title })),
            ]}
          />

          {/* Status Filter */}
          <Select
            value={status || ''}
            onChange={(e) => updateFilter('status', e.target.value || undefined)}
            options={[
              { value: '', label: 'همه وضعیت‌ها' },
              { value: 'active', label: 'فعال' },
              { value: 'disabled', label: 'غیرفعال' },
              { value: 'deleted', label: 'حذف‌شده' },
            ]}
          />

          {/* Sort Filter */}
          <Select
            value={sort}
            onChange={(e) => updateFilter('sort', e.target.value)}
            options={[
              { value: 'newest', label: 'جدیدترین کاربران' },
              { value: 'oldest', label: 'قدیمی‌ترین کاربران' },
              { value: 'name', label: 'ترتیب بر اساس نام' },
            ]}
          />
        </div>

        {/* Date Filters & Density Toggle */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-slate-400">بازه ثبت‌نام:</span>
            <div className="w-44">
              <DatePicker
                placeholder="از تاریخ..."
                value={createdFrom}
                onChange={(val) => updateFilter('createdFrom', val || undefined)}
              />
            </div>
            <div className="w-44">
              <DatePicker
                placeholder="تا تاریخ..."
                value={createdTo}
                onChange={(val) => updateFilter('createdTo', val || undefined)}
              />
            </div>
            {(q || role || status || createdFrom || createdTo) && (
              <button
                type="button"
                onClick={() => setSearchParams({ page: '1', pageSize: String(pageSize) })}
                className="text-xs text-rose-500 hover:text-rose-600 font-medium cursor-pointer"
              >
                پاک‌کردن فیلترها
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <span className="text-xs text-slate-400">تراکم:</span>
            <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setDensity('relaxed')}
                className={`px-2.5 py-1 text-[11px] rounded-lg cursor-pointer ${
                  density === 'relaxed'
                    ? 'bg-white dark:bg-slate-900 font-bold shadow-xs text-slate-900 dark:text-white'
                    : 'text-slate-500'
                }`}
              >
                راحت
              </button>
              <button
                type="button"
                onClick={() => setDensity('compact')}
                className={`px-2.5 py-1 text-[11px] rounded-lg cursor-pointer ${
                  density === 'compact'
                    ? 'bg-white dark:bg-slate-900 font-bold shadow-xs text-slate-900 dark:text-white'
                    : 'text-slate-500'
                }`}
              >
                فشرده
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Users Table / Cards Container */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data?.items || data.items.length === 0 ? (
        <EmptyState
          title="کاربری با مشخصات وارد شده یافت نشد"
          description="لطفاً فیلترهای جست‌وجو را بازنشانی کرده یا کاربر جدیدی اضافه نمایید."
          actionLabel="ثبت کاربر جدید"
          onAction={() => setCreateModalOpen(true)}
        />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs">
          {/* Desktop Table View */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead density={density}>کاربر</TableHead>
                  <TableHead density={density}>شماره موبایل</TableHead>
                  <TableHead density={density}>وضعیت</TableHead>
                  <TableHead density={density}>نقش‌های سیستمی</TableHead>
                  <TableHead density={density}>تاریخ ثبت‌نام</TableHead>
                  <TableHead density={density} className="text-end">
                    عملیات
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((u) => (
                  <TableRow
                    key={u.id}
                    onClick={() => navigate(`/users/${u.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell density={density}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center text-xs">
                          {u.name ? u.name.slice(0, 1) : 'ک'}
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white block">{u.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{u.id.slice(0, 8)}...</span>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell density={density}>
                      <span className="font-mono text-xs dir-ltr block text-start">
                        {maskPhoneNumber(u.phone)}
                      </span>
                    </TableCell>

                    <TableCell density={density}>
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-lg ${
                          u.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : u.status === 'disabled'
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                        }`}
                      >
                        {u.status === 'active' ? 'فعال' : u.status === 'disabled' ? 'غیرفعال' : 'حذف‌شده'}
                      </span>
                    </TableCell>

                    <TableCell density={density}>
                      <div className="flex flex-wrap gap-1">
                        {u.roles && u.roles.length > 0 ? (
                          u.roles.map((r) => (
                            <span
                              key={r}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium"
                            >
                              {r}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-400">بدون نقش</span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell density={density}>
                      <span className="text-xs text-slate-500">
                        {formatJalaliDate(u.createdAt, 'short')}
                      </span>
                    </TableCell>

                    <TableCell density={density} className="text-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs px-2.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/users/${u.id}`);
                        }}
                      >
                        جزئیات
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card List View (<768px) */}
          <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {data.items.map((u) => (
              <div
                key={u.id}
                onClick={() => navigate(`/users/${u.id}`)}
                className="p-4 flex items-center justify-between gap-3 active:bg-slate-50 dark:active:bg-slate-800/40 cursor-pointer"
              >
                <div className="space-y-1 text-start">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">{u.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded ${
                        u.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {u.status === 'active' ? 'فعال' : 'غیرفعال'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono dir-ltr text-start">
                    {maskPhoneNumber(u.phone)}
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {u.roles.map((r) => (
                      <span key={r} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
                <ChevronLeft className="w-4 h-4 text-slate-400 shrink-0" />
              </div>
            ))}
          </div>

          {/* Pagination Bar */}
          <Pagination
            currentPage={page}
            totalItems={data.total}
            pageSize={pageSize}
            onPageChange={(p) => updateFilter('page', String(p), false)}
            onPageSizeChange={(s) => updateFilter('pageSize', String(s), true)}
          />
        </div>
      )}

      {/* User Create Modal */}
      <UserCreateModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSuccess={(id) => navigate(`/users/${id}`)}
      />
    </div>
  );
};
