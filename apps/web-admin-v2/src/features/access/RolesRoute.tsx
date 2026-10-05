import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Plus, Trash2, Edit3, Users, Lock } from 'lucide-react';
import { H10_getRoles, H13_createRole, H15_updateRole, H16_deleteRole } from '@/api/endpoints/roles';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { TypeToConfirm } from '@/components/ui/TypeToConfirm';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { SystemRole } from '@/api/types';
import { isValidRoleKey } from '@/lib/permissions';
import { toPersianDigits } from '@/lib/format';

export const RolesRoute: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editRole, setEditRole] = useState<SystemRole | null>(null);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<SystemRole | null>(null);

  // Form states
  const [newKey, setNewKey] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);

  // Fetch Roles
  const { data: roles, isLoading, error, refetch } = useQuery({
    queryKey: ['system', 'roles'],
    queryFn: () => H10_getRoles(),
    staleTime: 30000,
  });

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: H13_createRole,
    onSuccess: () => {
      showSuccess('نقش جدید با موفقیت ایجاد گردید');
      setCreateModalOpen(false);
      setNewKey('');
      setNewTitle('');
      setNewDesc('');
      queryClient.invalidateQueries({ queryKey: ['system', 'roles'] });
      queryClient.invalidateQueries({ queryKey: ['rbac', 'matrix'] });
    },
    onError: (err) => showError(err, 'خطا در ساخت نقش'),
  });

  // Update Mutation
  const updateMutation = useMutation({
    mutationFn: ({ key, title, description }: { key: string; title: string; description?: string }) =>
      H15_updateRole(key, { title, description }),
    onSuccess: () => {
      showSuccess('اطلاعات نقش به‌روزرسانی شد');
      setEditRole(null);
      queryClient.invalidateQueries({ queryKey: ['system', 'roles'] });
    },
    onError: (err) => showError(err, 'خطا در ویرایش نقش'),
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (key: string) => H16_deleteRole(key),
    onSuccess: () => {
      showSuccess('نقش با موفقیت حذف گردید');
      setDeleteRoleTarget(null);
      queryClient.invalidateQueries({ queryKey: ['system', 'roles'] });
      queryClient.invalidateQueries({ queryKey: ['rbac', 'matrix'] });
    },
    onError: (err) => showError(err, 'خطا در حذف نقش'),
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidRoleKey(newKey)) {
      setKeyError('شناسه نقش باید با حرف کوچک شروع شده و بین ۳ تا ۳۲ کاراکتر باشد (مثال: supervisor)');
      return;
    }
    if (!newTitle.trim()) {
      return;
    }
    createMutation.mutate({
      key: newKey,
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-3xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !roles) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6 text-start pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">فهرست نقش‌های سیستم</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            نقش‌های سیستمی و پویای سامانه اسراء به همراه تعداد کاربران دارنده
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setNewKey('');
            setNewTitle('');
            setNewDesc('');
            setKeyError(null);
            setCreateModalOpen(true);
          }}
          icon={<Plus className="w-4 h-4" />}
        >
          ایجاد نقش پویا
        </Button>
      </div>

      {/* Roles Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles.map((role) => {
          const isSystem = role.undeletable || role.key === 'developer' || role.key === 'super_admin';

          return (
            <div
              key={role.key}
              className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{role.title}</h3>
                      <span className="text-[10px] text-slate-400 font-mono">{role.key}</span>
                    </div>
                  </div>
                  {isSystem && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 font-medium">
                      <Lock className="w-3 h-3" />
                      <span>سیستمی</span>
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                  {role.description || 'بدون توضیح'}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => navigate(`/users?role=${role.key}`)}
                    className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>{toPersianDigits(role.holders)} دارنده نقش</span>
                  </button>
                  <span className="text-[11px] text-slate-400">
                    {toPersianDigits(role.effectivePermissions?.length ?? role.permissions.length)} مجوز
                  </span>
                </div>

                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs px-2.5"
                    onClick={() => setEditRole(role)}
                    icon={<Edit3 className="w-3.5 h-3.5" />}
                  >
                    ویرایش
                  </Button>
                  {!isSystem && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs px-2.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      onClick={() => setDeleteRoleTarget(role)}
                      icon={<Trash2 className="w-3.5 h-3.5" />}
                    >
                      حذف
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Role Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent title="ایجاد نقش پویای جدید" description="شناسه نقش پس از ایجاد غیرقابل‌تغییر است.">
          <form onSubmit={handleCreateSubmit} className="space-y-4 pt-2">
            <Input
              label="شناسه انگلیسی نقش (Key)"
              value={newKey}
              onChange={(e) => {
                setNewKey(e.target.value);
                setKeyError(null);
              }}
              placeholder="مثال: reviewer_supervisor"
              normalizeDigits={false}
              error={keyError || undefined}
              required
            />
            <Input
              label="عنوان نمایشی نقش"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="مثال: سرپرست داوری مسابقات"
              required
            />
            <Input
              label="توضیحات (اختیاری)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="وظایف و محدوده کاری این نقش"
            />
            <div className="flex items-center justify-end gap-2.5 pt-4">
              <Button variant="outline" size="sm" onClick={() => setCreateModalOpen(false)}>
                انصراف
              </Button>
              <Button type="submit" size="sm" loading={createMutation.isPending}>
                ایجاد نقش
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Role Modal */}
      {editRole && (
        <Dialog open={Boolean(editRole)} onOpenChange={(open) => !open && setEditRole(null)}>
          <DialogContent title={`ویرایش نقش ${editRole.title}`}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateMutation.mutate({
                  key: editRole.key,
                  title: editRole.title,
                  description: editRole.description,
                });
              }}
              className="space-y-4 pt-2"
            >
              <Input
                label="عنوان نقش"
                value={editRole.title}
                onChange={(e) => setEditRole({ ...editRole, title: e.target.value })}
                required
              />
              <Input
                label="توضیحات"
                value={editRole.description || ''}
                onChange={(e) => setEditRole({ ...editRole, description: e.target.value })}
              />
              <div className="flex items-center justify-end gap-2.5 pt-4">
                <Button variant="outline" size="sm" onClick={() => setEditRole(null)}>
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

      {/* Delete Role Confirmation */}
      {deleteRoleTarget && (
        <TypeToConfirm
          open={Boolean(deleteRoleTarget)}
          onOpenChange={(open) => !open && setDeleteRoleTarget(null)}
          title={`حذف نقش ${deleteRoleTarget.title}`}
          description={
            deleteRoleTarget.holders > 0
              ? `این نقش در حال حاضر دارای ${toPersianDigits(deleteRoleTarget.holders)} کاربر است. ابتدا باید این نقش را از کاربران سلب نمایید.`
              : 'آیا از حذف قطعی این نقش اطمینان دارید؟ تمام دسترسی‌های این نقش حذف خواهد شد.'
          }
          expectedValue={deleteRoleTarget.key}
          promptLabel="جهت تأیید، شناسه نقش را تایپ کنید"
          onConfirm={() => deleteMutation.mutate(deleteRoleTarget.key)}
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  );
};
