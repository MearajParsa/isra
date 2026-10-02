import { api, ApiError, type PermissionKey, type SystemMe } from '$lib/api';
import { auth } from './auth.svelte';

/** هویت سیستمی ادمین (نقش‌ها و مجوزها) — منبع حقیقت: GET /system/me */
class SystemStore {
  me = $state<SystemMe | null>(null);
  status = $state<'idle' | 'loading' | 'ready' | 'forbidden' | 'error'>('idle');
  error = $state<string | null>(null);

  can(p: PermissionKey): boolean {
    return this.me?.permissions.includes(p) ?? false;
  }
  get isDeveloper(): boolean {
    return this.me?.roles.includes('developer') ?? false;
  }

  async load() {
    this.status = 'loading';
    this.error = null;
    try {
      this.me = await auth.withAuth((t) => api.system.me(t));
      this.status = 'ready';
    } catch (e) {
      this.me = null;
      if (e instanceof ApiError && e.code === 'AUTH_FORBIDDEN') this.status = 'forbidden';
      else {
        this.status = 'error';
        this.error = e instanceof ApiError ? e.message : 'خطای ناشناخته‌ای رخ داد.';
      }
    }
  }

  reset() {
    this.me = null;
    this.status = 'idle';
    this.error = null;
  }
}

export const system = new SystemStore();
