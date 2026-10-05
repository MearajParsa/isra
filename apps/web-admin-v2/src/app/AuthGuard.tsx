import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { PasswordChangeForced } from './PasswordChangeForced';
import { AccountDisabledScreen } from './AccountDisabledScreen';
import { ShieldX, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, actor, isDev, mustChangePassword, isAccountDisabled, logout } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F0F3F7] dark:bg-[#0B0F19] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-500 font-medium">در حال بارگذاری سامانه...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ returnTo: location.pathname + location.search }} replace />;
  }

  if (isAccountDisabled) {
    return <AccountDisabledScreen />;
  }

  if (mustChangePassword) {
    return <PasswordChangeForced />;
  }

  // User is logged in but holds no system roles
  if (!isDev && (!actor || !actor.roles || actor.roles.length === 0)) {
    return (
      <div className="min-h-screen bg-[#F0F3F7] dark:bg-[#0B0F19] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <ShieldX className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">دسترسی به پنل مدیریت ندارید</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              حساب کاربری شما با موفقیت تأیید شد اما در حال حاضر نقشی برای دسترسی به این پنل به شما تخصیص داده نشده است.
            </p>
          </div>

          <Button variant="outline" className="w-full" onClick={logout} icon={<LogOut className="w-4 h-4" />}>
            خروج از حساب
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
