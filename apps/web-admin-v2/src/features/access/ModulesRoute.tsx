import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus, Trash2, Edit3, Lock } from 'lucide-react';
import {
  H88_getModules,
  H89_createModule,
  H90_updateModule,
  H91_deleteModule,
} from '@/api/endpoints/permissions';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { TypeToConfirm } from '@/components/ui/TypeToConfirm';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { ModuleInfo } from '@/api/types';
import { toPersianDigits } from '@/lib/format';

export const ModulesRoute: React.FC = () => {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [editMod, setEditMod] = useState<ModuleInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModuleInfo | null>(null);

  const [newKey, setNewKey] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newOrder, setNewOrder] = useState('0');

  const { data: modules, isLoading, error, refetch } = useQuery({
    queryKey: ['system', 'modules'],
    queryFn: () => H88_getModules(),
    staleTime: 30000,
  });

  const createMutation = useMutation({
    mutationFn: H89_createModule,
    onSuccess: () => {
      showSuccess('ماژول جدید با موفقیت ساخته شد');
      setCreateOpen(false);
      setNewKey('');
      setNewTitle('');
      setNewDesc('');
      queryClient.invalidateQueries({ queryKey: ['system', 'modules'] });
      queryClient.invalidateQueries({ queryKey: ['rbac', 'matrix'] });
    },
    onError: (err) => showError(err, 'خطا در ساخت ماژول'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, title, description, sortOrder }: { key: string; title?: string; description?: string; sortOrder?: number }) =>
      H90_updateModule(key, { title, description, sortOrder }),
    onSuccess: () => {
      showSuccess('ماژول با موفقیت ویرایش گردید');
      setEditMod(null);
      queryClient.invalidateQueries({ queryKey: ['system', 'modules'] });
      queryClient.invalidateQueries({ queryKey: ['rbac', 'matrix'] });
    },
    onError: (err) => showError(err, 'خطا در ویرایش ماژول'),
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => H91_deleteModule(key),
    onSuccess: () => {
      showSuccess('ماژول با موفقیت حذف گردید');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['system', 'modules'] });
      queryClient.invalidateQueries({ queryKey: ['rbac', 'matrix'] });
    },
    onError: (err) => showError(err, 'خطا در حذف ماژول'),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newTitle.trim()) return;
    createMutation.mutate({
      key: newKey.trim(),
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      sortOrder: Number(newOrder) || 0,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-3xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !modules) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6 text-start pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">ماژول‌های سامانه</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            دسته‌بندی و ماژول‌های اصلی سامانه اسراء جهت تفکیک مجوزها و دسترسی‌ها
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setNewKey('');
            setNewTitle('');
            setNewDesc('');
            setNewOrder('0');
            setCreateOpen(true);
          }}
          icon={<Plus className="w-4 h-4" />}
        >
          ایجاد ماژول جدید
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((mod) => (
          <div
            key={mod.key}
            className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{mod.title}</h3>
                    <span className="text-[10px] text-slate-400 font-mono">{mod.key}</span>
                  </div>
                </div>
                {mod.isSystem && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 rounded font-medium">
                    <Lock className="w-3 h-3" />
                    <span>سیستمی</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                {mod.description || 'بدون توضیح'}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {toPersianDigits(mod.permissionCount)} مجوز ثبت‌شده
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs px-2"
                  onClick={() => setEditMod(mod)}
                  icon={<Edit3 className="w-3.5 h-3.5" />}
                >
                  ویرایش
                </Button>
                {!mod.isSystem && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs px-2 text-rose-600 hover:text-rose-700"
                    onClick={() => setDeleteTarget(mod)}
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                  >
                    حذف
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Module Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent title="ایجاد ماژول جدید">
          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <Input
              label="شناسه انگلیسی ماژول (Key)"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="مثال: quran_evaluation"
              normalizeDigits={false}
              required
            />
            <Input
              label="عنوان ماژول"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="مثال: ارزیابی و داوری قرآنی"
              required
            />
            <Input
              label="ترتیب نمایش"
              type="number"
              value={newOrder}
              onChange={(e) => setNewOrder(e.target.value)}
            />
            <Input
              label="توضیحات (اختیاری)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="کاربرد این ماژول در سیستم"
            />
            <div className="flex items-center justify-end gap-2.5 pt-4">
              <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
                انصراف
              </Button>
              <Button type="submit" size="sm" loading={createMutation.isPending}>
                ایجاد ماژول
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Module Modal */}
      {editMod && (
        <Dialog open={Boolean(editMod)} onOpenChange={(open) => !open && setEditMod(null)}>
          <DialogContent title={`ویرایش ماژول ${editMod.title}`}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateMutation.mutate({
                  key: editMod.key,
                  title: editMod.title,
                  description: editMod.description,
                  sortOrder: editMod.sortOrder,
                });
              }}
              className="space-y-4 pt-2"
            >
              <Input
                label="عنوان ماژول"
                value={editMod.title}
                onChange={(e) => setEditMod({ ...editMod, title: e.target.value })}
                required
              />
              <Input
                label="ترتیب نمایش"
                type="number"
                value={String(editMod.sortOrder)}
                onChange={(e) => setEditMod({ ...editMod, sortOrder: Number(e.target.value) || 0 })}
              />
              <Input
                label="توضیحات"
                value={editMod.description || ''}
                onChange={(e) => setEditMod({ ...editMod, description: e.target.value })}
              />
              <div className="flex items-center justify-end gap-2.5 pt-4">
                <Button variant="outline" size="sm" onClick={() => setEditMod(null)}>
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

      {/* Delete Confirmation */}
      {deleteTarget && (
        <TypeToConfirm
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title={`حذف ماژول ${deleteTarget.title}`}
          description={
            deleteTarget.permissionCount > 0
              ? 'این ماژول دارای مجوزهای فعال است؛ حذف آن امکان‌پذیر نمی‌باشد.'
              : 'آیا از حذف این ماژول اطمینان دارید؟'
          }
          expectedValue={deleteTarget.key}
          promptLabel="جهت تأیید، شناسه ماژول را تایپ کنید"
          onConfirm={() => deleteMutation.mutate(deleteTarget.key)}
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  );
};
