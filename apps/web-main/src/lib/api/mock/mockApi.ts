/**
 * پیاده‌سازی mock قرارداد LowApi. فقط داخل web-main؛ نه سرور واقعی.
 * رفتار آزمایشی:
 *  - کد OTP صحیح همیشه 12345 است.
 *  - شماره 09121234567 کاربر موجود با رمز isra1234 است؛ سایر شماره‌ها کاربر جدید.
 *  - شماره‌های پایان‌یافته با 0000 → RATE_LIMITED؛ با 1111 → AUTH_OTP_SEND_FAILED.
 *  - سناریوها با ?mock=… (کنترل در control.ts).
 */
import {
  ApiError,
  type AuthResult,
  type AuthUser,
  type DeviceInfo,
  type DeviceSession,
  type InboxItem,
  type LowApi,
  type Me,
  type OtpChallenge,
  type Page,
  type PointsSummary,
  type PublicSession
} from '../types';
import { getScenario, isReady } from './control';
import { seedInbox, seedSessions } from './seed';

const OTP_CODE = '12345';
const OTP_TTL = 120;
const RESEND_AFTER = 60;
const ACCESS_TTL = 900;
const STEP_UP_TTL = 300;
const STORAGE_KEY = 'isra.mock.v1';

interface MockUser {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  password: string | null;
  createdAt: string;
}
interface MockDevSession {
  id: string;
  userId: string;
  deviceLabel: string;
  platform: 'web' | 'android';
  createdAt: string;
  lastActiveAt: string;
  otpAt: number | null;
}
interface Persisted {
  users: MockUser[];
  sessions: MockDevSession[];
  inboxRead: string[];
  /** شبیه‌سازی cookie HttpOnly refresh */
  cookieSessionId: string | null;
}
interface Challenge {
  phone: string;
  expiresAt: number;
  attempts: number;
  userId?: string;
}

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function seedPersisted(): Persisted {
  const now = Date.now();
  const user: MockUser = {
    id: '11111111-1111-4111-8111-111111111111',
    phone: '09121234567',
    firstName: 'سارا',
    lastName: 'محمدی',
    password: 'isra1234',
    createdAt: new Date(now - 40 * 86_400_000).toISOString()
  };
  const iso = (ms: number) => new Date(now - ms).toISOString();
  return {
    users: [user],
    sessions: [
      {
        id: 'seed-android',
        userId: user.id,
        deviceLabel: 'اسراء اندروید · Pixel 7',
        platform: 'android',
        createdAt: iso(9 * 86_400_000),
        lastActiveAt: iso(3 * 3_600_000),
        otpAt: null
      },
      {
        id: 'seed-web',
        userId: user.id,
        deviceLabel: 'Firefox · Windows',
        platform: 'web',
        createdAt: iso(20 * 86_400_000),
        lastActiveAt: iso(2 * 86_400_000),
        otpAt: null
      }
    ],
    inboxRead: [],
    cookieSessionId: null
  };
}

function createMockApi(): LowApi {
  let state: Persisted | null = null;
  const challenges = new Map<string, Challenge>();
  const tokens = new Map<string, { sessionId: string; userId: string; exp: number }>();
  const stepUps = new Map<string, { sessionId: string; exp: number }>();
  const lastOtpRequest = new Map<string, number>();
  const otpCount = new Map<string, number>();
  const pwFails = new Map<string, number>();
  let inbox: InboxItem[] | null = null;

  function load(): Persisted {
    if (state) return state;
    let loaded: Persisted | null = null;
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) loaded = JSON.parse(raw) as Persisted;
      } catch {
        loaded = null;
      }
    }
    state = loaded ?? seedPersisted();
    return state;
  }
  function save() {
    if (typeof localStorage === 'undefined' || !state) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }

  async function latency(): Promise<void> {
    if (typeof window === 'undefined') return;
    const slow = getScenario() === 'slow';
    if (!slow && !isReady()) return;
    const ms = slow ? 2600 : 180 + Math.random() * 320;
    await new Promise((r) => setTimeout(r, ms));
  }

  /** همهٔ فراخوانی‌ها: تأخیر + سناریوهای شبکه/نگهداری */
  async function enter(): Promise<void> {
    await latency();
    const sc = getScenario();
    if (sc === 'offline') throw new ApiError('NETWORK_ERROR', 'اتصال برقرار نشد. اینترنت خود را بررسی کنید.', 0);
    if (sc === 'maintenance')
      throw new ApiError('SERVICE_UNAVAILABLE', 'سرویس در حال نگهداری است. کمی بعد دوباره امتحان کنید.', 503);
  }
  /** فراخوانی‌های دادهٔ غیر-auth: سناریوی خطای سرور */
  function dataGuard() {
    if (getScenario() === 'error')
      throw new ApiError('INTERNAL_ERROR', 'مشکلی در سرور پیش آمد. دوباره تلاش کنید.', 500);
  }

  function authz(accessToken: string) {
    const t = tokens.get(accessToken);
    if (!t) {
      // پس از reload، توکن‌های حافظه از بین می‌روند؛ مثل توکن منقضی رفتار می‌کند
      throw new ApiError('AUTH_TOKEN_EXPIRED', 'نشست منقضی شده است.', 401);
    }
    if (t.exp < Date.now()) {
      tokens.delete(accessToken);
      throw new ApiError('AUTH_TOKEN_EXPIRED', 'نشست منقضی شده است.', 401);
    }
    const db = load();
    const session = db.sessions.find((s) => s.id === t.sessionId);
    const user = db.users.find((u) => u.id === t.userId);
    if (!session || !user) throw new ApiError('AUTH_TOKEN_INVALID', 'نشست نامعتبر است.', 401);
    session.lastActiveAt = new Date().toISOString();
    return { db, session, user };
  }

  function userDto(u: MockUser, isNew: boolean): AuthUser {
    return {
      id: u.id,
      phone: u.phone,
      isNewUser: isNew,
      profileComplete: Boolean(u.firstName && u.lastName),
      hasPassword: Boolean(u.password)
    };
  }

  function issue(user: MockUser, device: DeviceInfo, isNew: boolean, viaOtp: boolean): AuthResult {
    const db = load();
    const now = new Date().toISOString();
    const sessionId = uid();
    db.sessions.push({
      id: sessionId,
      userId: user.id,
      deviceLabel: device.deviceLabel,
      platform: 'web',
      createdAt: now,
      lastActiveAt: now,
      otpAt: viaOtp ? Date.now() : null
    });
    db.cookieSessionId = sessionId;
    const accessToken = `mock.${uid()}`;
    tokens.set(accessToken, { sessionId, userId: user.id, exp: Date.now() + ACCESS_TTL * 1000 });
    save();
    return {
      accessToken,
      tokenType: 'Bearer',
      accessExpiresIn: ACCESS_TTL,
      sessionId,
      user: userDto(user, isNew)
    };
  }

  function challenge(phone: string, userId?: string): OtpChallenge {
    const challengeId = uid();
    challenges.set(challengeId, { phone, expiresAt: Date.now() + OTP_TTL * 1000, attempts: 0, userId });
    return { challengeId, expiresInSec: OTP_TTL, resendAfterSec: RESEND_AFTER };
  }

  function paginate<T>(all: T[], page = 1, pageSize = 20): Page<T> {
    const start = (page - 1) * pageSize;
    return { items: all.slice(start, start + pageSize), page, pageSize, total: all.length };
  }

  const api: LowApi = {
    auth: {
      async requestOtp(phone) {
        await enter();
        if (!/^09\d{9}$/.test(phone))
          throw new ApiError('VALIDATION_FAILED', 'شمارهٔ موبایل معتبر نیست.', 400, { fields: { phone: 'فرمت شماره معتبر نیست.' } });
        if (phone.endsWith('0000'))
          throw new ApiError('RATE_LIMITED', 'تعداد درخواست‌ها زیاد است. کمی بعد دوباره امتحان کنید.', 429, { retryAfterSec: 45 });
        if (phone.endsWith('1111'))
          throw new ApiError('AUTH_OTP_SEND_FAILED', 'ارسال پیامک ممکن نشد. دوباره تلاش کنید.', 503);
        const last = lastOtpRequest.get(phone) ?? 0;
        const wait = RESEND_AFTER - Math.floor((Date.now() - last) / 1000);
        if (wait > 0)
          throw new ApiError('RATE_LIMITED', 'برای ارسال مجدد کد کمی صبر کنید.', 429, { retryAfterSec: wait });
        const count = (otpCount.get(phone) ?? 0) + 1;
        if (count > 5)
          throw new ApiError('RATE_LIMITED', 'تعداد درخواست‌های امروز شما بیش از حد مجاز است.', 429, { retryAfterSec: 600 });
        otpCount.set(phone, count);
        lastOtpRequest.set(phone, Date.now());
        return challenge(phone);
      },

      async verifyOtp({ challengeId, code, ...device }) {
        await enter();
        const ch = challenges.get(challengeId);
        if (!ch || ch.expiresAt < Date.now()) {
          challenges.delete(challengeId);
          throw new ApiError('AUTH_OTP_EXPIRED', 'کد منقضی شده است. کد جدید دریافت کنید.', 400);
        }
        if (ch.attempts >= 3)
          throw new ApiError('AUTH_OTP_EXHAUSTED', 'تعداد تلاش‌ها تمام شد. کد جدید دریافت کنید.', 429);
        if (code !== OTP_CODE) {
          ch.attempts += 1;
          if (ch.attempts >= 3) {
            throw new ApiError('AUTH_OTP_EXHAUSTED', 'تعداد تلاش‌ها تمام شد. کد جدید دریافت کنید.', 429);
          }
          throw new ApiError('AUTH_OTP_INVALID', 'کد واردشده درست نیست.', 400, { attemptsLeft: 3 - ch.attempts });
        }
        challenges.delete(challengeId);
        const db = load();
        let user = db.users.find((u) => u.phone === ch.phone);
        let isNew = false;
        if (!user) {
          isNew = true;
          user = {
            id: uid(),
            phone: ch.phone,
            firstName: '',
            lastName: '',
            password: null,
            createdAt: new Date().toISOString()
          };
          db.users.push(user);
        }
        return issue(user, device, isNew, true);
      },

      async loginPassword({ phone, password, ...device }) {
        await enter();
        const fails = pwFails.get(phone) ?? 0;
        if (fails >= 5)
          throw new ApiError('RATE_LIMITED', 'تلاش‌های ناموفق زیاد بود. کمی بعد دوباره امتحان کنید.', 429, { retryAfterSec: 60 });
        const user = load().users.find((u) => u.phone === phone);
        if (!user || !user.password || user.password !== password) {
          pwFails.set(phone, fails + 1);
          throw new ApiError('AUTH_INVALID_CREDENTIALS', 'شماره یا رمز عبور درست نیست.', 401);
        }
        pwFails.delete(phone);
        return issue(user, device, false, false);
      },

      async refresh() {
        await enter();
        const db = load();
        const sid = db.cookieSessionId;
        const session = sid ? db.sessions.find((s) => s.id === sid) : undefined;
        const user = session ? db.users.find((u) => u.id === session.userId) : undefined;
        if (!session || !user) {
          db.cookieSessionId = null;
          save();
          throw new ApiError('AUTH_REFRESH_INVALID', 'نشست شما پایان یافته است. دوباره وارد شوید.', 401);
        }
        const accessToken = `mock.${uid()}`;
        tokens.set(accessToken, { sessionId: session.id, userId: user.id, exp: Date.now() + ACCESS_TTL * 1000 });
        return { accessToken, tokenType: 'Bearer', accessExpiresIn: ACCESS_TTL };
      },

      async logout() {
        await latency();
        const db = load();
        if (db.cookieSessionId) {
          db.sessions = db.sessions.filter((s) => s.id !== db.cookieSessionId);
          db.cookieSessionId = null;
          save();
        }
      },

      async stepUpRequest(accessToken) {
        await enter();
        const { user } = authz(accessToken);
        return challenge(user.phone, user.id);
      },

      async stepUpVerify(accessToken, { challengeId, code }) {
        await enter();
        const { session } = authz(accessToken);
        const ch = challenges.get(challengeId);
        if (!ch || ch.expiresAt < Date.now()) {
          challenges.delete(challengeId);
          throw new ApiError('AUTH_OTP_EXPIRED', 'کد منقضی شده است. کد جدید دریافت کنید.', 400);
        }
        if (ch.attempts >= 3)
          throw new ApiError('AUTH_OTP_EXHAUSTED', 'تعداد تلاش‌ها تمام شد. کد جدید دریافت کنید.', 429);
        if (code !== OTP_CODE) {
          ch.attempts += 1;
          if (ch.attempts >= 3)
            throw new ApiError('AUTH_OTP_EXHAUSTED', 'تعداد تلاش‌ها تمام شد. کد جدید دریافت کنید.', 429);
          throw new ApiError('AUTH_OTP_INVALID', 'کد واردشده درست نیست.', 400, { attemptsLeft: 3 - ch.attempts });
        }
        challenges.delete(challengeId);
        const stepUpToken = `su.${uid()}`;
        stepUps.set(stepUpToken, { sessionId: session.id, exp: Date.now() + STEP_UP_TTL * 1000 });
        return { stepUpToken, expiresInSec: STEP_UP_TTL };
      }
    },

    me: {
      async get(accessToken) {
        await enter();
        dataGuard();
        const { user } = authz(accessToken);
        const me: Me = {
          id: user.id,
          phone: user.phone,
          hasPassword: Boolean(user.password),
          profile: { firstName: user.firstName, lastName: user.lastName, avatarUrl: null }
        };
        return me;
      },

      async updateProfile(accessToken, patch) {
        await enter();
        const { user } = authz(accessToken);
        const errors: Record<string, string> = {};
        const first = patch.firstName?.trim();
        const last = patch.lastName?.trim();
        if (patch.firstName !== undefined && (!first || first.length < 2)) errors.firstName = 'نام باید دست‌کم ۲ نویسه باشد.';
        if (patch.lastName !== undefined && (!last || last.length < 2)) errors.lastName = 'نام خانوادگی باید دست‌کم ۲ نویسه باشد.';
        if (Object.keys(errors).length)
          throw new ApiError('VALIDATION_FAILED', 'اطلاعات واردشده معتبر نیست.', 400, { fields: errors });
        if (first) user.firstName = first;
        if (last) user.lastName = last;
        save();
        return { firstName: user.firstName, lastName: user.lastName, avatarUrl: null };
      },

      async setPassword(accessToken, { newPassword, stepUpToken }) {
        await enter();
        const { user, session } = authz(accessToken);
        const freshOtp = session.otpAt !== null && Date.now() - session.otpAt < STEP_UP_TTL * 1000;
        const su = stepUpToken ? stepUps.get(stepUpToken) : undefined;
        const suValid = su && su.sessionId === session.id && su.exp > Date.now();
        if (!suValid && !freshOtp)
          throw new ApiError('AUTH_STEP_UP_REQUIRED', 'برای این کار باید هویت خود را دوباره تأیید کنید.', 403);
        if (newPassword.length < 8)
          throw new ApiError('VALIDATION_FAILED', 'رمز عبور معتبر نیست.', 400, { fields: { newPassword: 'رمز عبور دست‌کم ۸ نویسه باشد.' } });
        user.password = newPassword;
        const db = load();
        db.sessions = db.sessions.filter((s) => s.userId !== user.id || s.id === session.id);
        save();
      },

      async listSessions(accessToken) {
        await enter();
        dataGuard();
        const { db, session, user } = authz(accessToken);
        const list: DeviceSession[] = db.sessions
          .filter((s) => s.userId === user.id)
          .map((s) => ({
            id: s.id,
            deviceLabel: s.deviceLabel,
            platform: s.platform,
            createdAt: s.createdAt,
            lastActiveAt: s.lastActiveAt,
            current: s.id === session.id
          }))
          .sort((a, b) => Number(b.current) - Number(a.current) || b.lastActiveAt.localeCompare(a.lastActiveAt));
        if (getScenario() === 'empty') return list.filter((s) => s.current);
        return list;
      },

      async revokeSession(accessToken, id) {
        await enter();
        const { db, session, user } = authz(accessToken);
        const target = db.sessions.find((s) => s.id === id && s.userId === user.id);
        if (!target) throw new ApiError('NOT_FOUND', 'این نشست پیدا نشد.', 404);
        db.sessions = db.sessions.filter((s) => s.id !== id);
        if (id === session.id) db.cookieSessionId = null;
        save();
      },

      async revokeOthers(accessToken) {
        await enter();
        const { db, session, user } = authz(accessToken);
        db.sessions = db.sessions.filter((s) => s.userId !== user.id || s.id === session.id);
        save();
      },

      async inbox(accessToken, q = {}) {
        await enter();
        dataGuard();
        const { db } = authz(accessToken);
        inbox ??= seedInbox();
        const read = new Set(db.inboxRead);
        let items = inbox.map((i) => (read.has(i.id) && !i.readAt ? { ...i, readAt: new Date().toISOString() } : i));
        if (getScenario() === 'empty') items = [];
        if (q.unreadOnly) items = items.filter((i) => !i.readAt);
        return paginate(items, q.page, q.pageSize ?? 8);
      },

      async unreadCount(accessToken) {
        await enter();
        const { db } = authz(accessToken);
        inbox ??= seedInbox();
        if (getScenario() === 'empty') return 0;
        const read = new Set(db.inboxRead);
        return inbox.filter((i) => !i.readAt && !read.has(i.id)).length;
      },

      async markRead(accessToken, id) {
        await enter();
        const { db } = authz(accessToken);
        if (!db.inboxRead.includes(id)) db.inboxRead.push(id);
        save();
      },

      async markAllRead(accessToken) {
        await enter();
        const { db } = authz(accessToken);
        inbox ??= seedInbox();
        db.inboxRead = inbox.map((i) => i.id);
        save();
      },

      async points(accessToken) {
        await enter();
        dataGuard();
        authz(accessToken);
        const total = getScenario() === 'empty' ? 0 : 120;
        const summary: PointsSummary = {
          total,
          badges: [50, 150, 300, 500].map((t) => ({
            key: `badge_${t}` as PointsSummary['badges'][number]['key'],
            threshold: t,
            awardedAt: total >= t ? new Date(Date.now() - 4 * 86_400_000).toISOString() : null
          }))
        };
        return summary;
      }
    },

    publicContent: {
      async listSessions(q = {}) {
        await enter();
        dataGuard();
        let all: PublicSession[] = getScenario() === 'empty' ? [] : seedSessions();
        if (q.status) all = all.filter((s) => s.status === q.status);
        const order = { started: 0, scheduled: 1, ended: 2 } as const;
        all.sort(
          (a, b) =>
            order[a.status] - order[b.status] ||
            (a.nextStartsAt ?? '9').localeCompare(b.nextStartsAt ?? '9')
        );
        return paginate(all, q.page, q.pageSize ?? 6);
      },

      async getSession(id) {
        await enter();
        dataGuard();
        const s = seedSessions().find((x) => x.id === id);
        if (!s) throw new ApiError('NOT_FOUND', 'این جلسه پیدا نشد.', 404);
        return s;
      }
    }
  };

  return api;
}

export const mockApi = createMockApi();
