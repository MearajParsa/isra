import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Copy, Check, RefreshCw, KeyRound } from 'lucide-react';
import { H24_createUser } from '@/api/endpoints/users';
import { H10_getRoles } from '@/api/endpoints/roles';
import { useToast } from '@/components/ui/Toast';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { isValidIranPhone, normalizeToLatinDigits } from '@/lib/format';

export interface UserCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (userId: string) => void;
}

export const UserCreateModal: React.FC<UserCreateModalProps> = ({ open, onOpenChange, onSuccess }) => {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();

  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: roles } = useQuery({
    queryKey: ['system', 'roles'],
    queryFn: () => H10_getRoles(),
  });

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let result = '';
    for (let i = 0; i < 10; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(result);
  };

  const copyPassword = () => {
    if (password) {
      navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const createMutation = useMutation({
    mutationFn: H24_createUser,
    onSuccess: (data) => {
      showSuccess(`کاربر ${data.name} با موفقیت در سامانه ایجاد شد`);
      queryClient.invalidateQueries({ queryKey: ['system', 'users'] });
      onOpenChange(false);
      onSuccess?.(data.id);
      // Reset form
      setPhone('');
      setFirstName('');
      setLastName('');
      setPassword('');
      setSelectedRoles([]);
    },
    onError: (err) => {
      showError(err, 'خطا در ثبت کاربر');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = normalizeToLatinDigits(phone);
    if (!isValidIranPhone(cleanPhone)) {
      setErrorMsg('شماره موبایل معتبر نیست (مثال: ۰۹۱۲۳۴۵۶۷۸۹)');
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setErrorMsg('نام و نام‌خانوادگی الزامی است');
      return;
    }

    createMutation.mutate({
      phone: cleanPhone,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      password: password || undefined,
      roles: selectedRoles.length > 0 ? selectedRoles : undefined,
    });
  };

  const toggleRole = (key: string) => {
    setSelectedRoles((prev) =>
      prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="ثبت و ساخت کاربر جدید" description="حساب کاربری ایجاد شده می‌تواند با شماره موبایل یا رمز موقت وارد شود.">
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <Input
            label="شماره موبایل"
            type="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setErrorMsg(null);
            }}
            placeholder="۰۹۱۲۳۴۵۶۷۸۹"
            required
            autoFocus
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="نام"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="مثال: علی"
              required
            />
            <Input
              label="نام خانوادگی"
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="مثال: حسینی"
              required
            />
          </div>

          {/* Optional Temporary Password */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                رمز عبور موقت (اختیاری)
              </label>
              <button
                type="button"
                onClick={generatePassword}
                className="text-[11px] text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 inline-flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>تولید رمز خودکار</span>
              </button>
            </div>
            <div className="relative flex items-center">
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="در صورت خالی بودن، ورود فقط با پیامک خواهد بود"
                normalizeDigits={false}
                startIcon={<KeyRound className="w-4 h-4" />}
              />
              {password && (
                <button
                  type="button"
                  onClick={copyPassword}
                  className="absolute end-2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
                  title="کپی رمز"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              )}
            </div>
            {password && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                توجه: کاربر در نخستین ورود به سامانه موظف به تغییر این رمز خواهد بود.
              </p>
            )}
          </div>

          {/* Initial Roles Assignment */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              تخصیص نقش‌های اولیه
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(roles || [])
                .filter((r) => r.key !== 'developer')
                .map((r) => {
                  const isSelected = selectedRoles.includes(r.key);
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => toggleRole(r.key)}
                      className={`px-3 py-1.5 text-xs rounded-xl transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#251D59] text-white shadow-xs dark:bg-indigo-600'
                          : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {r.title}
                    </button>
                  );
                })}
            </div>
          </div>

          {errorMsg && (
            <p className="text-xs font-medium text-rose-500 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl">
              {errorMsg}
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              انصراف
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={createMutation.isPending}
              icon={<UserPlus className="w-4 h-4" />}
            >
              ثبت نهایی کاربر
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
