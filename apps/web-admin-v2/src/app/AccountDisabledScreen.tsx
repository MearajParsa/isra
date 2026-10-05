import React from 'react';
import { UserX, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from './AuthContext';

export const AccountDisabledScreen: React.FC = () => {
  const { logout } = useAuth();

  return (
    <div className="fixed inset-0 z-50 bg-[#F0F3F7] dark:bg-[#0B0F19] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-2xl text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
          <UserX className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">حساب کاربری غیرفعال است</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            دسترسی حساب کاربری شما به سامانه توسط مدیر ارشد غیرفعال شده است. جهت فعال‌سازی مجدد، لطفاً با پشتیبانی سیستم تماس حاصل نمایید.
          </p>
        </div>

        <Button variant="outline" className="w-full" onClick={logout} icon={<LogOut className="w-4 h-4" />}>
          خروج از حساب
        </Button>
      </div>
    </div>
  );
};
