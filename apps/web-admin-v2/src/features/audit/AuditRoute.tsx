import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ScrollText,
  Search,
  Download,
  ChevronDown,
  ChevronUp,
  Filter,
  Shield,
  User,
  Settings,
  Calendar,
} from 'lucide-react';
import { H40_getAudit } from '@/api/endpoints/system';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { downloadCsv } from '@/lib/csv';
import { formatJalaliDate } from '@/lib/jalali';
import { formatNumber, toPersianDigits } from '@/lib/format';
import { AuditEntry } from '@/api/types';

export const AuditRoute: React.FC = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState('');
  const [targetType, setTargetType] = useState<'user' | 'role' | 'settings' | 'session' | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['system', 'audit', { page, pageSize, q, targetType, from, to }],
    queryFn: () =>
      H40_getAudit({
        page,
        pageSize,
        q: q || undefined,
        targetType: targetType || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
    staleTime: 15000,
  });

  const handleExportCsv = () => {
    if (!data?.items) return;
    const headers = ['شناسه', 'زمان', 'اقدام‌کننده', 'نوع هدف', 'هدف', 'شرح اقدام'];
    const rows = data.items.map((log) => [
      log.id,
      formatJalaliDate(log.at, 'medium'),
      log.actor.name,
      log.target?.type || '—',
      log.target?.label || log.target?.id || '—',
      log.summary,
    ]);
    downloadCsv(`audit-logs-${Date.now()}`, headers, rows);
  };

  const getTargetIcon = (type?: string) => {
    switch (type) {
      case 'user':
        return <User className="w-3.5 h-3.5 text-indigo-500" />;
      case 'role':
        return <Shield className="w-3.5 h-3.5 text-purple-500" />;
      case 'settings':
        return <Settings className="w-3.5 h-3.5 text-amber-500" />;
      case 'session':
        return <Calendar className="w-3.5 h-3.5 text-emerald-500" />;
      default:
        return <ScrollText className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6 text-start pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-indigo-600" />
            <span>گزارش وقایع و لاگ‌ها (Audit Log)</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            ردیابی و بایگانی غیرقابل‌ویرایش کلیه اقدامات و تغییرات مدیران در سامانه
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          disabled={!data?.items || data.items.length === 0}
          icon={<Download className="w-3.5 h-3.5" />}
        >
          خروجی اکسل
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Input
            placeholder="جست‌وجوی شرح اقدام یا نام مدیر..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            startIcon={<Search className="w-4 h-4" />}
          />

          <Select
            value={targetType}
            onChange={(e) => {
              setTargetType(e.target.value as typeof targetType);
              setPage(1);
            }}
            options={[
              { value: '', label: 'همه نوع هدف‌ها' },
              { value: 'user', label: 'کاربران' },
              { value: 'role', label: 'نقش‌ها' },
              { value: 'session', label: 'جلسات' },
              { value: 'settings', label: 'تنظیمات سراسری' },
            ]}
          />

          <DatePicker
            placeholder="از تاریخ..."
            value={from}
            onChange={(val) => {
              setFrom(val);
              setPage(1);
            }}
          />

          <DatePicker
            placeholder="تا تاریخ..."
            value={to}
            onChange={(val) => {
              setTo(val);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* Audit Logs List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data?.items || data.items.length === 0 ? (
        <div className="p-12 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800">
          لاگی با مشخصات فیلتر شده یافت نشد
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.items.map((log) => {
              const isExpanded = expandedId === log.id;
              return (
                <div key={log.id} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs cursor-pointer"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">{log.actor.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({log.action})</span>
                        {log.target && (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {getTargetIcon(log.target.type)}
                            <span>{log.target.label || log.target.id}</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {log.summary}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <span className="text-[11px] text-slate-400">
                        {formatJalaliDate(log.at, 'medium')}
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </div>

                  {/* Expandable JSON Metadata */}
                  {isExpanded && log.meta && Object.keys(log.meta).length > 0 && (
                    <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/60">
                      <span className="text-[10px] font-bold text-slate-400 block mb-1">
                        جزئیات فنی رویداد (Meta):
                      </span>
                      <pre className="p-3 rounded-xl bg-slate-900 text-slate-200 text-[11px] font-mono overflow-x-auto dir-ltr text-start">
                        {JSON.stringify(log.meta, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Pagination
            currentPage={page}
            totalItems={data.total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </div>
      )}
    </div>
  );
};
