import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, Info, Save, RotateCcw, CheckCircle2 } from 'lucide-react';
import { H92_getRbacMatrix, H18_setRoleStepUp } from '@/api/endpoints/roles';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';

export const StepUpPolicyRoute: React.FC = () => {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();

  const [selectedRoleKey, setSelectedRoleKey] = useState<string>('super_admin');
  const [rulesDraft, setRulesDraft] = useState<Record<string, 'inherit' | 'required' | 'none'>>({});
  const [isDirty, setIsDirty] = useState(false);

  const { data: matrix, isLoading, error, refetch } = useQuery({
    queryKey: ['rbac', 'matrix'],
    queryFn: H92_getRbacMatrix,
    staleTime: 60000,
  });

  const selectedRole = matrix?.roles.find((r) => r.key === selectedRoleKey);

  // Initialize rules draft when role changes
  React.useEffect(() => {
    if (selectedRole) {
      const draft: Record<string, 'inherit' | 'required' | 'none'> = {};
      matrix?.permissions.forEach((p) => {
        draft[p.key] = selectedRole.stepUpRules?.[p.key] || 'inherit';
      });
      setRulesDraft(draft);
      setIsDirty(false);
    }
  }, [selectedRole, matrix]);

  const setRule = (permKey: string, mode: 'inherit' | 'required' | 'none') => {
    setRulesDraft((prev) => ({ ...prev, [permKey]: mode }));
    setIsDirty(true);
  };

  const handleBulkModule = (moduleKey: string, mode: 'inherit' | 'required' | 'none') => {
    if (!matrix) return;
    const perms = matrix.permissions.filter((p) => p.moduleKey === moduleKey);
    setRulesDraft((prev) => {
      const next = { ...prev };
      perms.forEach((p) => {
        next[p.key] = mode;
      });
      return next;
    });
    setIsDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const rules = Object.entries(rulesDraft).map(([permission, mode]) => ({
        permission,
        mode,
      }));
      return H18_setRoleStepUp(selectedRoleKey, { rules });
    },
    onSuccess: () => {
      showSuccess(`قواعد تأیید مجدد هویت برای نقش ${selectedRole?.title} با موفقیت ذخیره شد`);
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['rbac', 'matrix'] });
    },
    onError: (err) => showError(err, 'خطا در ذخیره سیاست Step-Up'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </div>
    );
  }

  if (error || !matrix) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6 text-start pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            <span>سیاست و قواعد تأیید مجدد هویت (Step-Up)</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            تعیین عملیات‌های حساسی که اجرای آن‌ها نیازمند دریافت پیامک تأیید مجدد است.
          </p>
        </div>

        {isDirty && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectedRole) {
                  const draft: Record<string, 'inherit' | 'required' | 'none'> = {};
                  matrix.permissions.forEach((p) => {
                    draft[p.key] = selectedRole.stepUpRules?.[p.key] || 'inherit';
                  });
                  setRulesDraft(draft);
                  setIsDirty(false);
                }
              }}
            >
              بازنشانی
            </Button>
            <Button
              size="sm"
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              icon={<Save className="w-3.5 h-3.5" />}
            >
              ذخیره قواعد
            </Button>
          </div>
        )}
      </div>

      {/* Developer Exemption Informational Banner */}
      <div className="p-4 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/40 rounded-2xl flex items-start gap-3">
        <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs text-indigo-950 dark:text-indigo-200 space-y-1 leading-relaxed">
          <p className="font-bold">استثنای سیستمی توسعه‌دهندگان (Developer Exemption):</p>
          <p>
            کاربران دارنده نقش «توسعه‌دهنده» طبق پروتکل امنیتی سیستم از کلیه مراحل Step-Up معاف هستند (به‌جز تغییر رمز عبور شخصی خودشان).
          </p>
        </div>
      </div>

      {/* Role Picker Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {matrix.roles
          .filter((r) => r.key !== 'developer')
          .map((role) => (
            <button
              key={role.key}
              type="button"
              onClick={() => setSelectedRoleKey(role.key)}
              className={`px-4 py-2 text-xs font-semibold rounded-2xl transition-all cursor-pointer ${
                selectedRoleKey === role.key
                  ? 'bg-[#251D59] text-white shadow-sm dark:bg-indigo-600'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-800 hover:bg-slate-50'
              }`}
            >
              {role.title} ({role.key})
            </button>
          ))}
      </div>

      {/* Permissions List grouped by module */}
      <div className="space-y-4">
        {matrix.modules.map((mod) => {
          const perms = matrix.permissions.filter((p) => p.moduleKey === mod.key);
          if (perms.length === 0) return null;

          return (
            <div
              key={mod.key}
              className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">{mod.title}</h3>
                  <span className="text-[10px] text-slate-400 font-mono">{mod.key}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 text-[11px]">تنظیم سریع ماژول:</span>
                  <button
                    type="button"
                    onClick={() => handleBulkModule(mod.key, 'inherit')}
                    className="px-2 py-0.5 text-[10px] rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  >
                    وراثت
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkModule(mod.key, 'required')}
                    className="px-2 py-0.5 text-[10px] rounded-lg bg-amber-100 hover:bg-amber-200 dark:bg-amber-950 text-amber-800 dark:text-amber-300"
                  >
                    الزامی همه
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkModule(mod.key, 'none')}
                    className="px-2 py-0.5 text-[10px] rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  >
                    غیرفعال همه
                  </button>
                </div>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {perms.map((p) => {
                  const rule = rulesDraft[p.key] || 'inherit';
                  const effective = rule === 'inherit' ? p.stepUp : rule;

                  return (
                    <div
                      key={p.key}
                      className="py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{p.title}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{p.key}</div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-[11px] text-slate-500">
                          وضعیت موثر:{' '}
                          <strong
                            className={`font-bold ${
                              effective === 'required'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {effective === 'required' ? 'الزامی (پیامک)' : 'عادی'}
                          </strong>
                        </div>

                        {/* Tri-state Buttons */}
                        <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl">
                          <button
                            type="button"
                            onClick={() => setRule(p.key, 'inherit')}
                            className={`px-2.5 py-1 text-[11px] rounded-lg transition-colors cursor-pointer ${
                              rule === 'inherit'
                                ? 'bg-white dark:bg-slate-900 font-bold text-slate-900 dark:text-white shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            وراثت ({p.stepUp === 'required' ? 'الزام' : 'عادی'})
                          </button>
                          <button
                            type="button"
                            onClick={() => setRule(p.key, 'required')}
                            className={`px-2.5 py-1 text-[11px] rounded-lg transition-colors cursor-pointer ${
                              rule === 'required'
                                ? 'bg-amber-500 text-white font-bold shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            الزامی
                          </button>
                          <button
                            type="button"
                            onClick={() => setRule(p.key, 'none')}
                            className={`px-2.5 py-1 text-[11px] rounded-lg transition-colors cursor-pointer ${
                              rule === 'none'
                                ? 'bg-white dark:bg-slate-900 font-bold text-slate-900 dark:text-white shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            بدون تایید
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
