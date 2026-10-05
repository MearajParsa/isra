import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  Lock,
  Check,
  ChevronDown,
  ChevronUp,
  Save,
  RotateCcw,
  Sparkles,
  Info,
} from 'lucide-react';
import { H92_getRbacMatrix, H12_setRolePermissions, H17_setRoleModules } from '@/api/endpoints/roles';
import { useAuth } from '@/app/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { PermissionInfo, SystemRole } from '@/api/types';

export const AccessMatrixRoute: React.FC = () => {
  const queryClient = useQueryClient();
  const { actor, isDev } = useAuth();
  const { showSuccess, showError } = useToast();

  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});

  // Matrix draft state: roleKey -> { permissions: Set<string>, modules: Set<string> }
  const [rolePermissionsDraft, setRolePermissionsDraft] = useState<Record<string, Set<string>>>({});
  const [roleModulesDraft, setRoleModulesDraft] = useState<Record<string, Set<string>>>({});
  const [isDirty, setIsDirty] = useState(false);

  // Fetch Matrix
  const { data: matrix, isLoading, error, refetch } = useQuery({
    queryKey: ['rbac', 'matrix'],
    queryFn: H92_getRbacMatrix,
    staleTime: 60000,
  });

  // Expand all modules by default on load
  useEffect(() => {
    if (matrix?.modules) {
      const exp: Record<string, boolean> = {};
      matrix.modules.forEach((m) => {
        exp[m.key] = true;
      });
      setExpandedModules(exp);

      // Initialize draft
      const perms: Record<string, Set<string>> = {};
      const mods: Record<string, Set<string>> = {};
      matrix.roles.forEach((r) => {
        perms[r.key] = new Set(r.permissions);
        mods[r.key] = new Set(r.modules);
      });
      setRolePermissionsDraft(perms);
      setRoleModulesDraft(mods);
      setIsDirty(false);
    }
  }, [matrix]);

  // Group permissions by module
  const permissionsByModule = useMemo(() => {
    if (!matrix?.permissions) return {};
    const map: Record<string, PermissionInfo[]> = {};
    matrix.permissions.forEach((p) => {
      if (!map[p.moduleKey]) {
        map[p.moduleKey] = [];
      }
      map[p.moduleKey]!.push(p);
    });
    return map;
  }, [matrix]);

  const toggleModuleCollapse = (moduleKey: string) => {
    setExpandedModules((prev) => ({ ...prev, [moduleKey]: !prev[moduleKey] }));
  };

  // Toggle explicit permission for a role
  const handleTogglePermission = (role: SystemRole, permKey: string) => {
    if (role.key === 'developer') return; // developer is read-only
    if (role.lockedPermissions?.includes(permKey)) return; // locked

    // Anti-escalation check: actor must hold the permission themselves to assign it
    if (!isDev && !actor?.permissions.includes(permKey)) {
      showError(null, 'نمی‌توانید مجوزی را اعطا کنید که خودتان دارنده آن نیستید.');
      return;
    }

    setRolePermissionsDraft((prev) => {
      const currentSet = new Set(prev[role.key] || []);
      if (currentSet.has(permKey)) {
        currentSet.delete(permKey);
      } else {
        currentSet.add(permKey);
      }
      return { ...prev, [role.key]: currentSet };
    });
    setIsDirty(true);
  };

  // Toggle whole module for a role
  const handleToggleModule = (role: SystemRole, moduleKey: string) => {
    if (role.key === 'developer') return;

    setRoleModulesDraft((prev) => {
      const currentSet = new Set(prev[role.key] || []);
      if (currentSet.has(moduleKey)) {
        currentSet.delete(moduleKey);
      } else {
        currentSet.add(moduleKey);
      }
      return { ...prev, [role.key]: currentSet };
    });
    setIsDirty(true);
  };

  // Reset Draft
  const handleReset = () => {
    if (!matrix) return;
    const perms: Record<string, Set<string>> = {};
    const mods: Record<string, Set<string>> = {};
    matrix.roles.forEach((r) => {
      perms[r.key] = new Set(r.permissions);
      mods[r.key] = new Set(r.modules);
    });
    setRolePermissionsDraft(perms);
    setRoleModulesDraft(mods);
    setIsDirty(false);
  };

  // Save Mutations
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!matrix) return;

      const promises: Promise<unknown>[] = [];

      for (const role of matrix.roles) {
        if (role.key === 'developer') continue;

        // Check if permissions changed
        const currentPerms = rolePermissionsDraft[role.key];
        const originalPerms = new Set(role.permissions);
        const permChanged =
          currentPerms &&
          (currentPerms.size !== originalPerms.size ||
            [...currentPerms].some((p) => !originalPerms.has(p)));

        if (permChanged && currentPerms) {
          promises.push(
            H12_setRolePermissions(role.key, { permissions: Array.from(currentPerms) })
          );
        }

        // Check if modules changed
        const currentMods = roleModulesDraft[role.key];
        const originalMods = new Set(role.modules);
        const modChanged =
          currentMods &&
          (currentMods.size !== originalMods.size ||
            [...currentMods].some((m) => !originalMods.has(m)));

        if (modChanged && currentMods) {
          promises.push(
            H17_setRoleModules(role.key, { modules: Array.from(currentMods) })
          );
        }
      }

      await Promise.all(promises);
    },
    onSuccess: () => {
      showSuccess('تغییرات ماتریس دسترسی با موفقیت ذخیره شد');
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['rbac', 'matrix'] });
    },
    onError: (err) => {
      showError(err, 'خطا در ذخیره تغییرات دسترسی‌ها');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
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
            <span>ماتریس دسترسی‌ها و نقش‌ها</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-mono">
              v{matrix.version}
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            تعیین و مدیریت دسترسی‌های صریح و وراثتی نقش‌ها بر اساس ماژول‌های سامانه
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-[#251D59] text-white flex items-center justify-center">
              <Check className="w-3 h-3 stroke-[3]" />
            </div>
            <span className="text-slate-600 dark:text-slate-400">مجوز صریح</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center">
              <Sparkles className="w-3 h-3" />
            </div>
            <span className="text-slate-600 dark:text-slate-400">وراثت از ماژول</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center">
              <Lock className="w-3 h-3" />
            </div>
            <span className="text-slate-600 dark:text-slate-400">قفل شده</span>
          </div>
        </div>
      </div>

      {/* Unsaved Changes Bar */}
      {isDirty && (
        <div className="sticky top-20 z-20 p-4 bg-[#251D59] text-white rounded-2xl shadow-xl flex items-center justify-between gap-4 animate-in slide-in-from-top-3">
          <div className="flex items-center gap-3">
            <Info className="w-5 h-5 text-indigo-300 shrink-0" />
            <div>
              <p className="text-xs font-bold">تغییرات ذخیره‌نشده در ماتریس وجود دارد</p>
              <p className="text-[11px] text-indigo-200">
                جهت اعمال تغییرات در نقش‌ها دکمه ذخیره را فشار دهید.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
              onClick={handleReset}
              disabled={saveMutation.isPending}
            >
              بازنشانی
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="bg-white text-slate-900 hover:bg-slate-100"
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              icon={<Save className="w-3.5 h-3.5" />}
            >
              ذخیره تغییرات
            </Button>
          </div>
        </div>
      )}

      {/* Responsive Matrix Table Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full border-collapse text-xs text-start">
            {/* Table Header: Sticky Role Columns */}
            <thead className="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="sticky start-0 z-20 bg-slate-50 dark:bg-slate-900 px-4 py-3.5 text-start font-bold text-slate-900 dark:text-white min-w-64 border-e border-slate-200 dark:border-slate-800">
                  ماژول / مجوزها
                </th>
                {matrix.roles.map((role) => (
                  <th
                    key={role.key}
                    className="px-4 py-3.5 text-center min-w-32 border-e border-slate-100 dark:border-slate-800/60 last:border-e-0"
                  >
                    <div className="font-bold text-slate-900 dark:text-white">{role.title}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{role.key}</div>
                    {role.key === 'developer' && (
                      <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 rounded font-medium">
                        سیستمی (کامل)
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>

            {/* Table Body: Modules & Permissions */}
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {matrix.modules.map((mod) => {
                const isExpanded = expandedModules[mod.key] ?? true;
                const perms = permissionsByModule[mod.key] || [];

                return (
                  <React.Fragment key={mod.key}>
                    {/* Module Header Row */}
                    <tr className="bg-slate-100/60 dark:bg-slate-800/40 font-bold">
                      <td className="sticky start-0 z-10 bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur-md px-4 py-3 border-e border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => toggleModuleCollapse(mod.key)}
                            className="flex items-center gap-2 hover:text-indigo-600 transition-colors cursor-pointer"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            <span className="text-slate-900 dark:text-white">{mod.title}</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({perms.length} مجوز)
                            </span>
                          </button>
                        </div>
                      </td>

                      {/* Module Full-Grant Toggles */}
                      {matrix.roles.map((role) => {
                        const hasFullModule =
                          role.key === 'developer' ||
                          (roleModulesDraft[role.key]?.has(mod.key) ?? role.modules.includes(mod.key));

                        return (
                          <td
                            key={role.key}
                            className="px-4 py-3 text-center border-e border-slate-100 dark:border-slate-800/60 last:border-e-0"
                          >
                            <button
                              type="button"
                              disabled={role.key === 'developer'}
                              onClick={() => handleToggleModule(role, mod.key)}
                              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all ${
                                hasFullModule
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 shadow-xs'
                                  : 'bg-slate-200/50 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                              } ${role.key === 'developer' ? 'opacity-80 cursor-default' : 'cursor-pointer'}`}
                              title={hasFullModule ? 'کل ماژول اعطا شده است' : 'اعطای کل ماژول به نقش'}
                            >
                              {hasFullModule ? 'کل ماژول' : 'جزئی'}
                            </button>
                          </td>
                        );
                      })}
                    </tr>

                    {/* Permission Rows inside Module */}
                    {isExpanded &&
                      perms.map((perm) => (
                        <tr key={perm.key} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                          {/* Permission info column (Sticky start) */}
                          <td className="sticky start-0 z-10 bg-white dark:bg-slate-900 px-4 py-3 border-e border-slate-100 dark:border-slate-800">
                            <div>
                              <div className="font-semibold text-slate-800 dark:text-slate-200">{perm.title}</div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">{perm.key}</div>
                              {perm.description && (
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                                  {perm.description}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Role × Permission Cells */}
                          {matrix.roles.map((role) => {
                            const isInherited =
                              role.key === 'developer' ||
                              (roleModulesDraft[role.key]?.has(mod.key) ?? role.modules.includes(mod.key));

                            const isExplicit =
                              rolePermissionsDraft[role.key]?.has(perm.key) ?? role.permissions.includes(perm.key);

                            const isLocked = role.lockedPermissions?.includes(perm.key);
                            const hasAccess = isInherited || isExplicit;

                            return (
                              <td
                                key={role.key}
                                className="px-4 py-3 text-center border-e border-slate-100 dark:border-slate-800/60 last:border-e-0 align-middle"
                              >
                                <div className="flex items-center justify-center">
                                  {role.key === 'developer' ? (
                                    <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                                    </div>
                                  ) : isLocked ? (
                                    <div
                                      className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center"
                                      title="این مجوز برای این نقش قفل شده و قابل حذف نیست"
                                    >
                                      <Lock className="w-3.5 h-3.5" />
                                    </div>
                                  ) : isInherited ? (
                                    <div
                                      className="w-6 h-6 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center"
                                      title="به واسطه دسترسی کامل به ماژول به این نقش اعطا شده است"
                                    >
                                      <Sparkles className="w-3.5 h-3.5" />
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleTogglePermission(role, perm.key)}
                                      className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                                        isExplicit
                                          ? 'bg-[#251D59] text-white shadow-xs dark:bg-indigo-600'
                                          : 'border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-transparent'
                                      }`}
                                      aria-label={`تغییر دسترسی ${perm.title} برای ${role.title}`}
                                    >
                                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
