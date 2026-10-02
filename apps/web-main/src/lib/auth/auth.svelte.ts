import { api } from '$lib/api';
import { ApiError, type AuthResult, type Me } from '$lib/api/types';
import { getDeviceInfo } from '$lib/utils/device';

export type AuthStatus = 'unknown' | 'guest' | 'member';

/** نشانهٔ «احتمالاً نشست دارد» (refresh در cookie HttpOnly است و قابل تشخیص نیست): مهمان تازه‌وارد درخواست refresh بیهوده نمی‌زند */
const HINT_KEY = 'isra.session';
const hint = {
  has: () => {
    try {
      return localStorage.getItem(HINT_KEY) === '1';
    } catch {
      return true; // storage در دسترس نیست ⇒ محتاطانه امتحان کن
    }
  },
  set: () => {
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      /* ignore */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(HINT_KEY);
    } catch {
      /* ignore */
    }
  }
};

const FRESH_OTP_MS = 5 * 60_000;

class AuthStore {
  status = $state<AuthStatus>('unknown');
  accessToken = $state<string | null>(null);
  me = $state<Me | null>(null);
  unread = $state(0);
  /** پس از AUTH_REFRESH_INVALID: به صفحهٔ ورود اعلان «نشست منقضی شد» نشان داده می‌شود */
  expiredNotice = $state(false);
  /** آخرین ورود با OTP (برای معافیت از step-up تا ۵ دقیقه — پیشنهاد Q8) */
  lastOtpAt = $state<number | null>(null);

  #refreshTimer: ReturnType<typeof setTimeout> | null = null;
  #refreshing: Promise<void> | null = null;
  #initPromise: Promise<void> | null = null;

  get displayName(): string {
    const p = this.me?.profile;
    return p ? `${p.firstName} ${p.lastName}`.trim() : '';
  }

  get hasFreshOtp(): boolean {
    return this.lastOtpAt !== null && Date.now() - this.lastOtpAt < FRESH_OTP_MS;
  }

  /** بازیابی نشست از cookie refresh */
  init(): Promise<void> {
    this.#initPromise ??= this.#init();
    return this.#initPromise;
  }

  async #init() {
    if (!hint.has()) {
      this.status = 'guest';
      return;
    }
    try {
      const r = await api.auth.refresh();
      this.#setToken(r.accessToken, r.accessExpiresIn);
      this.me = await api.me.get(r.accessToken);
      this.status = 'member';
      void this.refreshUnread();
    } catch (e) {
      this.#reset();
      if (e instanceof ApiError && e.code === 'NETWORK_ERROR') {
        this.status = 'guest';
      }
    }
  }

  async applyLogin(result: AuthResult, viaOtp: boolean) {
    this.#setToken(result.accessToken, result.accessExpiresIn);
    this.expiredNotice = false;
    if (viaOtp) this.lastOtpAt = Date.now();
    hint.set();
    this.me = await api.me.get(result.accessToken);
    this.status = 'member';
    void this.refreshUnread();
  }

  loginPassword(phone: string, password: string): Promise<AuthResult> {
    return api.auth.loginPassword({ phone, password, ...getDeviceInfo() });
  }
  verifyOtp(challengeId: string, code: string): Promise<AuthResult> {
    return api.auth.verifyOtp({ challengeId, code, ...getDeviceInfo() });
  }

  async logout() {
    try {
      await api.auth.logout();
    } finally {
      this.#reset();
    }
  }

  /** فراخوانی احراز‌شده با تمدید خودکار یک‌باره (single-flight) */
  async withAuth<T>(fn: (token: string) => Promise<T>): Promise<T> {
    if (!this.accessToken) throw new ApiError('AUTH_REQUIRED', 'برای ادامه وارد شوید.', 401);
    try {
      return await fn(this.accessToken);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'AUTH_TOKEN_EXPIRED') {
        await this.#refresh();
        if (!this.accessToken) throw new ApiError('AUTH_REQUIRED', 'برای ادامه وارد شوید.', 401);
        return fn(this.accessToken);
      }
      throw e;
    }
  }

  async refreshUnread() {
    if (this.status !== 'member') return;
    try {
      this.unread = await this.withAuth((t) => api.me.unreadCount(t));
    } catch {
      /* شمارنده حیاتی نیست */
    }
  }

  setUnread(n: number) {
    this.unread = Math.max(0, n);
  }

  updateProfile(profile: Me['profile']) {
    if (this.me) this.me = { ...this.me, profile };
  }
  markHasPassword() {
    if (this.me) this.me = { ...this.me, hasPassword: true };
  }

  #refresh(): Promise<void> {
    this.#refreshing ??= this.#doRefresh().finally(() => {
      this.#refreshing = null;
    });
    return this.#refreshing;
  }

  async #doRefresh() {
    const run = async () => {
      try {
        const r = await api.auth.refresh();
        this.#setToken(r.accessToken, r.accessExpiresIn);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'AUTH_REFRESH_INVALID') {
          this.expiredNotice = true;
          this.#reset();
        }
        throw e;
      }
    };
    // چند tab: فقط یکی تمدید می‌کند
    if (typeof navigator !== 'undefined' && 'locks' in navigator) {
      await navigator.locks.request('isra-refresh', run);
    } else {
      await run();
    }
  }

  #setToken(token: string, expiresIn: number) {
    this.accessToken = token;
    if (this.#refreshTimer) clearTimeout(this.#refreshTimer);
    const ms = Math.max(5, expiresIn - 60) * 1000;
    this.#refreshTimer = setTimeout(() => {
      this.#refresh().catch(() => {});
    }, ms);
  }

  #reset() {
    if (this.#refreshTimer) clearTimeout(this.#refreshTimer);
    this.#refreshTimer = null;
    this.accessToken = null;
    this.me = null;
    this.unread = 0;
    this.lastOtpAt = null;
    hint.clear();
    this.status = 'guest';
  }
}

export const auth = new AuthStore();
