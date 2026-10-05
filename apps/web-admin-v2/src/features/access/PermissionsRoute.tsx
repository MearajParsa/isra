import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, Trash2, Edit3, ShieldAlert, Lock } from 'lucide-react';
import {
  H11_getPermissions,
  H85_createPermission,
  H86_updatePermission,
  H87_deletePermission,
  H88_getModules,
} from '@/api/endpoints/permissions';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { TypeToConfirm } from '@/components/ui/TypeToConfirm';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { PermissionInfo } from '@/api/types';
import { isValidCustomPermissionKey } from '@/lib/permissions';

export const PermissionsRoute: React.FC = () => {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [editPerm, setEditPerm] = useState<PermissionInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PermissionInfo | null>(null);

  // Form states
  const [newKey, setNewKey] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newModule, setNewModule] = useState('');
  const [newStepUp, setNewStepUp] = useState<'none' | 'required'>('none');
  const [keyError, setKeyError] = useState<string | null>(null);

  // Fetch Permissions & Modules
  const { data: permissions, isLoading, error, refetch } = useQuery({
    queryKey: ['system', 'permissions'],
    queryFn: () => H11_getPermissions(),
    staleTime: 30000,
  });

  const { data: modules } = useQuery({
    queryKey: ['system', 'modules'],
    queryFn: () => H88_getModules(),
    staleTime: 60000,
  });

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: H85_createPermission,
    onSuccess: () => {
      showSuccess('مجوز جدید ثبت گردید');
      setCreateOpen(false);
      setNewKey('');
      setNewTitle('');
      setNewDesc('');
      queryClient.invalidateQueries({ queryKey: ['system', 'permissions'] });
      queryClient.invalidateQueries({ queryKey: ['rbac', 'matrix'] });
    },
    onError: (err) => showError(err, 'خطا در ثبت مجوز'),
  });

  // Update Mutation
  const updateMutation = useMutation({
    mutationFn: ({ key, title, description, stepUp }: { key: string; title?: string; description?: string; stepUp?: 'required' | 'none' }) =>
      H86_updatePermission(key, { title, description, stepUp }),
    onSuccess: () => {
      showSuccess('مجوز با موفقیت ویرایش شد');
      setEditPerm(null);
      queryClient.invalidateQueries({ queryKey: ['system', 'permissions'] });
      queryClient.invalidateQueries({ queryKey: ['rbac', 'matrix'] });
    },
    onError: (err) => showError(err, 'خطا در ویرایش مجوز'),
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (key: string) => H87_deletePermission(key),
    onSuccess: () => {
      showSuccess('مجوز حذف شد');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['system', 'permissions'] });
      queryClient.invalidateQueries({ queryKey: ['rbac', 'matrix'] });
    },
    onError: (err) => showError(err, 'خطا در حذف مجوز'),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const check = isValidCustomPermissionKey(newKey);
    if (!check.valid) {
      setKeyError(check.error || 'کلید نامعتبر است');
      return;
    }
    if (!newModule) {
      setKeyError('لطفاً ماژول مربوطه را انتخاب کنید');
      return;
    }

    createMutation.mutate({
      key: newKey,
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      moduleKey: newModule,
      stepUp: newStepUp,
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

  if (error || !permissions) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6 text-start pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">رجیستری مجوزها</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            فهرست کلیه مجوزهای سیستمی و پویای سامانه اسراء به تفکیک ماژول
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setNewKey('');
            setNewTitle('');
            setNewDesc('');
            setNewModule(modules?.[0]?.key || '');
            setKeyError(null);
            setCreateOpen(true);
          }}
          icon={<Plus className="w-4 h-4" />}
        >
          ثبت مجوز پویا
        </Button>
      </div>

      {/* Permissions List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs divide-y divide-slate-100 dark:divide-slate-800">
        {permissions.map((perm) => (
          <div
            key={perm.key}
            className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900 dark:text-white">{perm.title}</span>
                <span className="text-[10px] text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                  {perm.key}
                </span>
                {perm.isSystem && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 rounded font-medium">
                    <Lock className="w-3 h-3" />
                    <span>سیستمی</span>
                  </span>
                )}
                {perm.stepUp === 'required' && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 rounded font-medium">
                    <ShieldAlert className="w-3 h-3" />
                    <span>Step-Up پیش‌فرض</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">
                {perm.description || 'بدون توضیح'}
              </p>
              <div className="text-[11px] text-slate-400 pt-1">
                ماژول: <strong className="text-slate-700 dark:text-slate-300 font-medium">{perm.moduleKey}</strong>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs px-2.5"
                onClick={() => setEditPerm(perm)}
                icon={<Edit3 className="w-3.5 h-3.5" />}
              >
                ویرایش
              </Button>
              {!perm.isSystem && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs px-2.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  onClick={() => setDeleteTarget(perm)}
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  حذف
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create Permission Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent title="ثبت مجوز جدید" description="پیشوند 'system.' سیستمی بوده و قابل استفاده نمی‌باشد.">
          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <Input
              label="شناسه مجوز (module.action)"
              value={newKey}
              onChange={(e) => {
                setNewKey(e.target.value);
                setKeyError(null);
              }}
              placeholder="مثال: evaluations.export_pdf"
              normalizeDigits={false}
              error={keyError || undefined}
              required
            />
            <Input
              label="عنوان نمایشی"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="مثال: خروجی PDF ارزیابی‌ها"
              required
            />
            <Select
              label="ماژول مرتبط"
              value={newModule}
              onChange={(e) => setNewModule(e.target.value)}
              options={(modules || []).map((m) => ({ value: m.key, label: `${m.title} (${m.key})` }))}
            />
            <Select
              label="وضعیت پیش‌فرض تأیید هویت (Step-Up)"
              value={newStepUp}
              onChange={(e) => setNewStepUp(e.target.value as 'none' | 'required')}
              options={[
                { value: 'none', label: 'بدون نیاز به تأیید مجدد (عادی)' },
                { value: 'required', label: 'نیازمند تأیید مجدد هویت (Step-Up با پیامک)' },
              ]}
            />
            <Input
              label="توضیحات (اختیاری)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="محدوده و کاربرد این مجوز"
            />
            <div className="flex items-center justify-end gap-2.5 pt-4">
              <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
                انصراف
              </Button>
              <Button type="submit" size="sm" loading={createMutation.isPending}>
                ثبت مجوز
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Permission Modal */}
      {editPerm && (
        <Dialog open={Boolean(editPerm)} onOpenChange={(open) => !open && setEditPerm(null)}>
          <DialogContent title={`ویرایش مجوز ${editPerm.title}`}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateMutation.mutate({
                  key: editPerm.key,
                  title: editPerm.title,
                  description: editPerm.description,
                  stepUp: editPerm.stepUp,
                });
              }}
              className="space-y-4 pt-2"
            >
              <Input
                label="عنوان مجوز"
                value={editPerm.title}
                onChange={(e) => setEditPerm({ ...editPerm, title: e.target.value })}
                required
              />
              <Input
                label="توضیحات"
                value={editPerm.description || ''}
                onChange={(e) => setEditPerm({ ...editPerm, description: e.target.value })}
              />
              <Select
                label="وضعیت Step-Up پیش‌فرض"
                value={editPerm.stepUp}
                onChange={(e) =>
                  setEditPerm({ ...editPerm, stepUp: e.target.value as 'none' | 'required' })
                }
                options={[
                  { value: 'none', label: 'عادی (بدون نیاز به تأیید مجدد)' },
                  { value: 'required', label: 'نیازمند تأیید مجدد با پیامک' },
                ]}
              />
              <div className="flex items-center justify-end gap-2.5 pt-4">
                <Button variant="outline" size="sm" onClick={() => setEditPerm(null)}>
                  انصراف
                </Button>
                <Button type="submit" size="sm" loading={updateMutation.isPending}>
                  ذخیره تغییرات
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Permission Confirmation */}
      {deleteTarget && (
        <TypeToConfirm
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title={`حذف مجوز ${deleteTarget.title}`}
          description="حذف این مجوز باعث حذف خودکار آن از تمامی نقش‌ها، تخصیص‌های مستقیم و قواعد Step-Up خواهد شد."
          expectedValue={deleteTarget.key}
          promptLabel="جهت تأیید، شناسه مجوز را تایپ کنید"
          onConfirm={() => deleteMutation.mutate(deleteTarget.key)}
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  );
};
