import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Calendar,
  BarChart3,
  ScrollText,
  Settings,
  User,
  Search,
  Bell,
  Moon,
  Sun,
  LogOut,
  Wifi,
  WifiOff,
  Plus,
  Menu,
  ChevronDown,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useAuth } from './AuthContext';
import { CommandPalette } from './CommandPalette';
import { formatJalaliDate } from '@/lib/jalali';
import { maskPhoneNumber } from '@/lib/format';
import { Button } from '@/components/ui/Button';

export const Shell: React.FC = () => {
  const { actor, isDev, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('isra.admin.theme');
      if (stored) return stored === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('isra.admin.theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const toggleTheme = () => setIsDark((prev) => !prev);

  // Navigation Items
  const navItems = [
    { to: '/', label: 'داشبورد', icon: <LayoutDashboard className="w-5 h-5" /> },
    { to: '/users', label: 'کاربران', icon: <Users className="w-5 h-5" /> },
    { to: '/access/matrix', label: 'دسترسی‌ها', icon: <ShieldCheck className="w-5 h-5" /> },
    { to: '/sessions', label: 'جلسه‌ها', icon: <Calendar className="w-5 h-5" /> },
    { to: '/reports', label: 'گزارش‌ها', icon: <BarChart3 className="w-5 h-5" /> },
    { to: '/audit', label: 'لاگ وقایع', icon: <ScrollText className="w-5 h-5" /> },
  ];

  const currentDateDisplay = formatJalaliDate(new Date(), 'full');

  return (
    <div className="min-h-screen bg-[#F0F3F7] dark:bg-[#0B0F19] text-slate-800 dark:text-slate-100 p-2 sm:p-4 lg:p-6 flex flex-col antialiased">
      {/* Offline Alert Banner */}
      {!isOnline && (
        <div className="mb-3 px-4 py-2 bg-amber-500 text-white text-xs font-medium rounded-2xl flex items-center justify-center gap-2 shadow-sm animate-in slide-in-from-top">
          <WifiOff className="w-4 h-4" />
          <span>اتصال اینترنت قطع است. داده‌ها از حافظه محلی نمایش داده می‌شوند.</span>
        </div>
      )}

      {/* Outer Floating Rounded Container matching reference image */}
      <div className="flex-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/60 dark:border-slate-800/80 rounded-[2rem] shadow-[0_20px_45px_-12px_rgba(15,23,42,0.06)] overflow-hidden flex flex-row">
        
        {/* RTL Right Sidebar Dock (Desktop) */}
        <aside className="hidden md:flex flex-col items-center justify-between w-20 py-6 px-3 bg-white/60 dark:bg-slate-900/60 border-e border-slate-100 dark:border-slate-800/80 shrink-0">
          <div className="flex flex-col items-center gap-8 w-full">
            {/* Logo */}
            <NavLink
              to="/"
              className="w-12 h-12 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/40 p-2 flex items-center justify-center hover:scale-105 transition-transform"
              title="پنل مدیریت اسراء"
            >
              <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="اسراء" className="w-full h-full object-contain" />
            </NavLink>

            {/* Nav Icons */}
            <nav className="flex flex-col items-center gap-3 w-full">
              {navItems.map((item) => {
                const isActive = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    title={item.label}
                    className={`relative w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${
                      isActive
                        ? 'bg-[#251D59] text-white shadow-md shadow-indigo-900/20 dark:bg-indigo-600'
                        : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    {item.icon}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* Bottom Dock Items */}
          <div className="flex flex-col items-center gap-3 w-full">
            <NavLink
              to="/settings"
              title="تنظیمات سامانه"
              className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${
                location.pathname.startsWith('/settings')
                  ? 'bg-[#251D59] text-white shadow-md dark:bg-indigo-600'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
              }`}
            >
              <Settings className="w-5 h-5" />
            </NavLink>

            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? 'حالت روشن' : 'حالت تاریک'}
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 transition-all cursor-pointer"
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </aside>

        {/* Main Content Viewport */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* Top Header Bar */}
          <header className="h-18 px-4 sm:px-6 lg:px-8 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md sticky top-0 z-30">
            {/* Top Quick Links / Tabs from reference image */}
            <div className="flex items-center gap-3 sm:gap-6">
              {/* Mobile Menu Trigger */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="md:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="hidden sm:flex items-center gap-1.5 p-1 bg-slate-100/80 dark:bg-slate-800/60 rounded-2xl text-xs font-medium">
                <NavLink
                  to="/"
                  className={({ isActive }) =>
                    `px-3.5 py-1.5 rounded-xl transition-all ${
                      isActive ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`
                  }
                >
                  داشبورد
                </NavLink>
                <NavLink
                  to="/users"
                  className={({ isActive }) =>
                    `px-3.5 py-1.5 rounded-xl transition-all ${
                      isActive ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`
                  }
                >
                  کاربران
                </NavLink>
                <NavLink
                  to="/reports"
                  className={({ isActive }) =>
                    `px-3.5 py-1.5 rounded-xl transition-all ${
                      isActive ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`
                  }
                >
                  گزارش‌ها
                </NavLink>
              </div>

              {/* Command Palette Trigger */}
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-800 rounded-xl text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span className="hidden md:inline">جست‌وجوی سریع...</span>
                <kbd className="hidden lg:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded">
                  Ctrl+K
                </kbd>
              </button>
            </div>

            {/* Header Right: Date, Fast Add, Notifications, User Menu */}
            <div className="flex items-center gap-2 sm:gap-4">
              <span className="hidden xl:inline text-xs text-slate-400 font-medium">
                {currentDateDisplay}
              </span>

              {/* Fast Action */}
              <Button
                variant="subtle"
                size="sm"
                className="hidden sm:inline-flex rounded-xl"
                onClick={() => navigate('/users?create=true')}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                کاربر جدید
              </Button>

              {/* User Dropdown */}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2.5 p-1 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer focus:outline-none"
                  >
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#251D59] to-[#6E56CF] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                      {actor?.user?.name ? actor.user.name.slice(0, 1) : 'م'}
                    </div>
                    <div className="hidden lg:flex flex-col text-start leading-tight">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {actor?.user?.name || 'مدیر سیستم'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {isDev ? 'توسعه‌دهنده' : actor?.roles?.[0] || 'مدیر'}
                      </span>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
                  </button>
                </DropdownMenu.Trigger>

                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="z-50 min-w-52 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-1.5 shadow-xl animate-in fade-in-80 text-start text-xs"
                    align="end"
                    sideOffset={8}
                  >
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
                      <p className="font-bold text-slate-900 dark:text-white">{actor?.user?.name || 'مدیر سیستم'}</p>
                      <p className="text-[11px] text-slate-400 dir-ltr">{maskPhoneNumber(actor?.user?.phone)}</p>
                    </div>

                    <DropdownMenu.Item
                      onClick={() => navigate('/account')}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer focus:outline-none"
                    >
                      <User className="w-4 h-4 text-slate-400" />
                      <span>حساب کاربری من</span>
                    </DropdownMenu.Item>

                    <DropdownMenu.Item
                      onClick={() => navigate('/settings')}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer focus:outline-none"
                    >
                      <Settings className="w-4 h-4 text-slate-400" />
                      <span>تنظیمات سراسری</span>
                    </DropdownMenu.Item>

                    <DropdownMenu.Separator className="h-px bg-slate-100 dark:bg-slate-800 my-1" />

                    <DropdownMenu.Item
                      onClick={logout}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer focus:outline-none font-medium"
                    >
                      <LogOut className="w-4 h-4 text-rose-500" />
                      <span>خروج از حساب</span>
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </header>

          {/* Main Body View */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-20 md:pb-8">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 px-4 py-2 flex items-center justify-around pb-safe">
        {navItems.slice(0, 4).map((item) => {
          const isActive = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[11px] font-medium transition-colors ${
                isActive ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[11px] font-medium text-slate-400"
        >
          <Menu className="w-5 h-5" />
          <span>بیشتر</span>
        </button>
      </nav>

      {/* Mobile More Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end justify-center">
          <div className="w-full bg-white dark:bg-slate-900 rounded-t-3xl p-6 space-y-4 shadow-2xl animate-in slide-in-from-bottom max-h-[80vh] overflow-y-auto pb-safe">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-sm font-bold text-slate-900 dark:text-white">منوی مدیریت</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="text-xs text-slate-400"
              >
                بستن
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-start">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              ))}
              <NavLink
                to="/settings"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2.5 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                <Settings className="w-5 h-5" />
                <span>تنظیمات</span>
              </NavLink>
              <NavLink
                to="/account"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2.5 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                <User className="w-5 h-5" />
                <span>حساب کاربری</span>
              </NavLink>
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={toggleTheme}
                className="flex items-center gap-2 text-xs text-slate-500 p-2"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                <span>{isDark ? 'حالت روشن' : 'حالت تاریک'}</span>
              </button>
              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-2 text-xs text-rose-500 font-medium p-2"
              >
                <LogOut className="w-4 h-4" />
                <span>خروج از حساب</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        toggleTheme={toggleTheme}
        isDark={isDark}
      />
    </div>
  );
};
