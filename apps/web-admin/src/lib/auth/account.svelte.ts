import { api, ApiError, type MyAccount } from '$lib/api';
import { auth } from './auth.svelte';

/** «حساب من» (H-02): نام، شماره و وضعیت رمز؛ منبع تشخیص رمز موقت */
class AccountStore {
  data = $state<MyAccount | null>(null);
  /** idle تا شروع؛ loading؛ ready؛ error (غیرمسدودکننده: صفحه‌ها خودشان خطا را نشان می‌دهند) */
  status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');

  async load() {
    this.status = 'loading';
    try {
      const a = await auth.withAuth((t) => api.system.account(t));
      this.data = a;
      auth.mustChangePassword = a.mustChangePassword;
      this.status = 'ready';
    } catch (e) {
      this.status = e instanceof ApiError && e.code === 'AUTH_PASSWORD_CHANGE_REQUIRED' ? 'ready' : 'error';
    }
  }

  set(a: MyAccount) {
    this.data = a;
    auth.mustChangePassword = a.mustChangePassword;
  }

  reset() {
    this.data = null;
    this.status = 'idle';
  }
}

export const account = new AccountStore();
