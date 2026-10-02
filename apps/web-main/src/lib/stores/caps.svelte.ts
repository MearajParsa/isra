import { midApi } from '$lib/api';
import { auth } from '$lib/auth/auth.svelte';

/** قابلیت‌های mid برای نمایش ورودی «مدیریت» (مجوز واقعی را سرور اعمال می‌کند) */
class CapsStore {
  canCreate = $state(false);
  hasStaff = $state(false);
  loaded = $state(false);

  get canManage(): boolean {
    return this.canCreate || this.hasStaff;
  }

  async load() {
    try {
      const me = await auth.withAuth((t) => midApi.me.get(t));
      this.canCreate = me.canCreateSession;
      this.hasStaff = me.hasStaffRole;
    } catch {
      this.canCreate = false;
      this.hasStaff = false;
    } finally {
      this.loaded = true;
    }
  }

  reset() {
    this.canCreate = false;
    this.hasStaff = false;
    this.loaded = false;
  }
}

export const caps = new CapsStore();
