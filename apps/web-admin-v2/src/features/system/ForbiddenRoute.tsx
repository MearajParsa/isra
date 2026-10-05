import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldX, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export const ForbiddenRoute: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
      <div className="w-16 h-16 rounded-3xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
        <ShieldX className="w-8 h-8" />
      </div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">عدم دسترسی به این بخش (۴۰۳)</h1>
      <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
        شما مجوز لازم برای مشاهده یا ویرایش این بخش از سامانه را ندارید. در صورت نیاز با مدیر سیستم در ارتباط باشید.
      </p>
      <Button size="sm" onClick={() => navigate('/')} icon={<Home className="w-3.5 h-3.5" />}>
        بازگشت به صفحه اصلی
      </Button>
    </div>
  );
};
