import { api } from '$lib/api';
import { ApiError, type AuthResult } from '$lib/api';
import { getDeviceInfo } from '$lib/utils/device';

export type AuthStatus = 'unknown' | 'guest' | 'member';

class AuthStore {
  status = $state<AuthStatus>('unknown');
  accessToken = $state<string | null>(null);
  /** پس از AUTH_REFRESH_INVALID: به صفحهٔ ورود اعلان «نشست منقضی شد» نشان داده می‌شود */
  expiredNotice = $state(false);

  #timer: ReturnType<typeof setTimeout> | null = null;
  #refreshing: Promise<void> | null = null;
  #init: Promise<void> | null = null;

  /** بازیابی نشست از cookie refresh (در mock: شبیه‌سازی) */
  init(): Promise<void> {
    this.#init ??= (async () => {
      try {
        const r = await api.auth.refresh();
        this.#setToken(r.accessToken, r.accessExpiresIn);
        this.status = 'member';
      } catch {
        this.#reset();
      }
    })();
    return this.#init;
  }

  applyLogin(result: AuthResult) {
    this.#setToken(result.accessToken, result.accessExpiresIn);
    this.expiredNotice = false;
    this.status = 'member';
  }

  loginPassword(phone: string, password: string) {
    return api.auth.loginPassword({ phone, password, ...getDeviceInfo() });
  }
  verifyOtp(challengeId: string, code: string) {
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
    if (typeof navigator !== 'undefined' && 'locks' in navigator) await navigator.locks.request('isra-admin-refresh', run);
    else await run();
  }

  #setToken(token: string, expiresIn: number) {
    this.accessToken = token;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#refresh().catch(() => {}), Math.max(5, expiresIn - 60) * 1000);
  }

  #reset() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.accessToken = null;
    this.status = 'guest';
  }
}

export const auth = new AuthStore();
