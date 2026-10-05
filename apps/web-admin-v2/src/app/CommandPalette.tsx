import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  LayoutDashboard,
  Users,
  ShieldCheck,
  Calendar,
  BarChart3,
  ScrollText,
  Settings,
  User,
  LogOut,
  Moon,
  Sun,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { useAuth } from './AuthContext';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toggleTheme: () => void;
  isDark: boolean;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
  toggleTheme,
  isDark,
}) => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [query, setQuery] = useState('');

  // Keyboard shortcut Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  const commands = [
    {
      id: 'dashboard',
      title: 'نمای کلی و داشبورد',
      category: 'صفحات',
      icon: <LayoutDashboard className="w-4 h-4" />,
      action: () => navigate('/'),
    },
    {
      id: 'users',
      title: 'مدیریت کاربران',
      category: 'صفحات',
      icon: <Users className="w-4 h-4" />,
      action: () => navigate('/users'),
    },
    {
      id: 'access-matrix',
      title: 'ماتریس دسترسی‌ها و نقش‌ها',
      category: 'صفحات',
      icon: <ShieldCheck className="w-4 h-4" />,
      action: () => navigate('/access/matrix'),
    },
    {
      id: 'roles',
      title: 'فهرست نقش‌های سیستم',
      category: 'صفحات',
      icon: <ShieldCheck className="w-4 h-4" />,
      action: () => navigate('/access/roles'),
    },
    {
      id: 'sessions',
      title: 'مدیریت جلسه‌ها و نوبت‌دهی',
      category: 'صفحات',
      icon: <Calendar className="w-4 h-4" />,
      action: () => navigate('/sessions'),
    },
    {
      id: 'reports',
      title: 'گزارش‌ها و نمودارها',
      category: 'صفحات',
      icon: <BarChart3 className="w-4 h-4" />,
      action: () => navigate('/reports'),
    },
    {
      id: 'audit',
      title: 'گزارش وقایع و لاگ‌ها (Audit Log)',
      category: 'صفحات',
      icon: <ScrollText className="w-4 h-4" />,
      action: () => navigate('/audit'),
    },
    {
      id: 'settings',
      title: 'تنظیمات سراسری سامانه',
      category: 'صفحات',
      icon: <Settings className="w-4 h-4" />,
      action: () => navigate('/settings'),
    },
    {
      id: 'account',
      title: 'حساب کاربری و نشست‌های من',
      category: 'حساب کاربری',
      icon: <User className="w-4 h-4" />,
      action: () => navigate('/account'),
    },
    {
      id: 'theme',
      title: isDark ? 'تغییر به حالت روشن' : 'تغییر به حالت تاریک',
      category: 'تنظیمات ظاهری',
      icon: isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />,
      action: toggleTheme,
    },
    {
      id: 'logout',
      title: 'خروج از حساب کاربری',
      category: 'عملیات',
      icon: <LogOut className="w-4 h-4" />,
      action: () => logout(),
    },
  ];

  const filtered = commands.filter((c) =>
    c.title.toLowerCase().includes(query.toLowerCase()) ||
    c.category.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (action: () => void) => {
    action();
    onOpenChange(false);
    setQuery('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-lg overflow-hidden border-0" showCloseButton={false}>
        <div className="flex items-center px-4 border-b border-slate-100 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400 ms-1 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جست‌وجوی صفحه، بخش یا اقدام..."
            className="w-full h-13 px-3 text-sm bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
            autoFocus
          />
          <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 rounded">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">نتیجه‌ای یافت نشد</div>
          ) : (
            filtered.map((cmd) => (
              <button
                key={cmd.id}
                type="button"
                onClick={() => handleSelect(cmd.action)}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-start text-xs transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {cmd.icon}
                  </div>
                  <div>
                    <div className="font-medium text-slate-800 dark:text-slate-200">{cmd.title}</div>
                    <div className="text-[10px] text-slate-400">{cmd.category}</div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
