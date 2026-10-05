import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileQuestion, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export const NotFoundRoute: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
      <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center">
        <FileQuestion className="w-8 h-8" />
      </div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">صفحه مورد نظر یافت نشد (۴۰۴)</h1>
      <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
        آدرسی که به آن مراجعه کرده‌اید وجود ندارد یا به مسیر دیگری منتقل شده است.
      </p>
      <Button size="sm" onClick={() => navigate('/')} icon={<Home className="w-3.5 h-3.5" />}>
        بازگشت به داشبورد اصلی
      </Button>
    </div>
  );
};
