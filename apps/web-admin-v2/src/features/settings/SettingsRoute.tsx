import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Save, AlertTriangle, CheckCircle2, RotateCcw, Shield } from 'lucide-react';
import { H30_getSettings, H31_updateSettings } from '@/api/endpoints/system';
import { DonutChart } from '@/components/ui/Charts/DonutChart';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/Toast';
import { toPersianDigits } from '@/lib/format';
import { SystemSettings } from '@/api/types';

export const SettingsRoute: React.FC = () => {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();

  const [voice, setVoice] = useState(30);
  const [tone, setTone] = useState(30);
  const [tajweed, setTajweed] = useState(40);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);

  const [maintenanceConfirmOpen, setMaintenanceConfirmOpen] = useState(false);
  const [pendingMaintenanceToggle, setPendingMaintenanceToggle] = useState(false);

  const { data: settings, isLoading, error, refetch } = useQuery({
    queryKey: ['system', 'settings'],
    queryFn: H30_getSettings,
    staleTime: 30000,
  });

  useEffect(() => {
    if (settings) {
      setVoice(settings.evalWeights?.voice ?? 30);
      setTone(settings.evalWeights?.tone ?? 30);
      setTajweed(settings.evalWeights?.tajweed ?? 40);
      setMaintenanceMode(settings.flags?.maintenance_mode ?? false);
      setRegistrationOpen(settings.flags?.registration_open ?? true);
    }
  }, [settings]);

  const totalWeights = voice + tone + tajweed;
  const isWeightValid = totalWeights === 100;

  const updateMutation = useMutation({
    mutationFn: (body: {
      version: number;
      evalWeights: { voice: number; tone: number; tajweed: number };
      badgeThresholds: unknown[];
      flags: { maintenance_mode: boolean; registration_open: boolean };
    }) => H31_updateSettings(body),
    onSuccess: (updated) => {
      showSuccess('تنظیمات سراسری سامانه با موفقیت ذخیره شد');
      queryClient.setQueryData(['system', 'settings'], updated);
    },
    onError: (err: unknown) => {
      const e = err as { code?: string; details?: { reason?: string } };
      if (e.details?.reason === 'VERSION_MISMATCH') {
        showError(null, 'تنظیمات توسط مدیر دیگری تغییر یافته است؛ لطفاً ابتدا صفحه را رفرش کنید.');
        refetch();
      } else {
        showError(err, 'خطا در ذخیره تنظیمات');
      }
    },
  });

  const handleSave = () => {
    if (!settings || !isWeightValid) return;
    updateMutation.mutate({
      version: settings.version,
      evalWeights: { voice, tone, tajweed },
      badgeThresholds: settings.badgeThresholds || [],
      flags: {
        maintenance_mode: maintenanceMode,
        registration_open: registrationOpen,
      },
    });
  };

  const handleMaintenanceToggle = (checked: boolean) => {
    if (checked) {
      setPendingMaintenanceToggle(true);
      setMaintenanceConfirmOpen(true);
    } else {
      setMaintenanceMode(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-80 w-full rounded-3xl" />
      </div>
    );
  }

  if (error || !settings) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6 text-start pb-16">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-600" />
            <span>تنظیمات سراسری سامانه</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
              نسخه {toPersianDigits(settings.version)}
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            وزن‌دهی معیارهای داوری و ارزیابی قرآن، وضعیت ثبت‌نام و پرچم‌های عملیاتی
          </p>
        </div>

        <Button
          size="sm"
          disabled={!isWeightValid || updateMutation.isPending}
          loading={updateMutation.isPending}
          onClick={handleSave}
          icon={<Save className="w-3.5 h-3.5" />}
        >
          ذخیره تغییرات
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Evaluation Weights */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-6">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">ضرایب و وزن‌های ارزیابی تلاوت</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              مجموع اوزان سه معیار صوت، لحن و تجوید باید دقیقاً برابر با ۱۰۰ باشد.
            </p>
          </div>

          {/* Interactive Donut Preview */}
          <div className="p-4 bg-slate-50/70 dark:bg-slate-800/40 rounded-2xl flex items-center justify-center">
            <DonutChart
              slices={[
                { label: 'تجوید', value: tajweed, color: '#6E56CF' },
                { label: 'صوت', value: voice, color: '#10B981' },
                { label: 'لحن', value: tone, color: '#F59E0B' },
              ]}
              centerLabel="مجموع"
              centerValue={`${toPersianDigits(totalWeights)}٪`}
            />
          </div>

          {/* Weight Inputs */}
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="تجوید (٪)"
              type="number"
              value={String(tajweed)}
              onChange={(e) => setTajweed(Number(e.target.value) || 0)}
              min={0}
              max={100}
            />
            <Input
              label="صوت (٪)"
              type="number"
              value={String(voice)}
              onChange={(e) => setVoice(Number(e.target.value) || 0)}
              min={0}
              max={100}
            />
            <Input
              label="لحن (٪)"
              type="number"
              value={String(tone)}
              onChange={(e) => setTone(Number(e.target.value) || 0)}
              min={0}
              max={100}
            />
          </div>

          {!isWeightValid && (
            <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>مجموع اوزان باید دقیقاً ۱۰۰ باشد (مجموع فعلی: {toPersianDigits(totalWeights)})</span>
            </div>
          )}
        </div>

        {/* Card 2: Operational Flags */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-6">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">پرچم‌های عملیاتی (Feature Flags)</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              مدیریت فعال‌بودن ثبت‌نام عمومی و حالت تعمیرات سامانه
            </p>
          </div>

          <div className="space-y-6 pt-2">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <Switch
                id="registration_open"
                label="پذیرش و ثبت‌نام کاربران جدید"
                description="در صورت غیرفعال‌سازی، امکان ثبت‌نام افراد جدید در سامانه مسدود خواهد شد."
                checked={registrationOpen}
                onCheckedChange={setRegistrationOpen}
              />
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40">
              <Switch
                id="maintenance_mode"
                label="حالت تعمیرات و نگهداری (Maintenance Mode)"
                description="با فعال‌سازی این حالت، دسترسی کاربران عادی به سامانه مسدود شده و صفحه در دست تعمیر نمایش داده می‌شود."
                checked={maintenanceMode}
                onCheckedChange={handleMaintenanceToggle}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Maintenance Mode Confirmation Dialog */}
      <ConfirmDialog
        open={maintenanceConfirmOpen}
        onOpenChange={setMaintenanceConfirmOpen}
        title="فعال‌سازی حالت تعمیرات"
        description="آیا مطمئن هستید که می‌خواهید سامانه را به حالت تعمیرات ببرید؟ با این کار دسترسی تمام کاربران عادی به برنامه قطع خواهد شد."
        onConfirm={() => {
          setMaintenanceMode(true);
          setMaintenanceConfirmOpen(false);
        }}
        isDestructive
      />
    </div>
  );
};
