/**
 * mock قرارداد high (docs-v2/20) + auth به low. فقط داخل web-admin.
 * کاربران نمونه (همه رمز isra1234): 09121234567 = super_admin · 09123333333 = developer · 09125555555 = بدون نقش.
 * کد OTP همیشه 12345؛ شماره‌های ...0000 = RATE_LIMITED، ...1111 = ارسال ناموفق.
 */
import {
  ApiError,
  type AuthResult,
  type DeviceInfo,
  type Page
} from '../types';
import type {
  AdminApi,
  AuditEntry,
  AuditQuery,
  Grant,
  Overview,
  PermissionInfo,
  PermissionKey,
  SettingsInput,
  SystemMe,
  SystemRole,
  SystemRoleKey,
  SystemSettings,
  SystemUser,
  UsersQuery
} from '../high-types';
import { fullName, load, save, type AUser } from './db';
import { ALLOWED_GRANTS, ALL_PERMISSIONS, LOCKED, permissionsOf, touchesDeveloper, validateRolePermissions, validateSettings, wouldLeaveNoHolder } from './highRules';
import { actorFromToken, dataGuard, enter, latency, stepUps, tokens, uid } from './shared';

const OTP_CODE = '12345';
const OTP_TTL = 120;
const RESEND_AFTER = 60;
const ACCESS_TTL = 900;
const STEP_UP_TTL = 300;

const PERMISSIONS: PermissionInfo[] = [
  { key: 'system.users.view', title: 'مشاهدهٔ کاربران', group: 'system' },
  { key: 'system.role.assign', title: 'تخصیص نقش و مجوز به کاربر', group: 'system' },
  { key: 'system.permission.edit', title: 'ویرایش ماتریس مجوز', group: 'system' },
  { key: 'system.settings.view', title: 'مشاهدهٔ تنظیمات سراسری', group: 'system' },
  { key: 'system.settings.edit', title: 'ویرایش تنظیمات سراسری', group: 'system' },
  { key: 'system.audit.view', title: 'مشاهدهٔ گزارش‌ها (audit)', group: 'system' },
  { key: 'session.create', title: 'ساخت جلسه', group: 'session' }
];
const ROLE_META: Record<SystemRoleKey, { title: string; description: string }> = {
  developer: { title: 'توسعه‌دهنده', description: 'دسترسی کامل فنی و سیستمی؛ ماتریس این نقش ثابت است و حذف نمی‌شود.' },
  super_admin: { title: 'مدیر کل', description: 'مدیریت سیستم، نقش‌ها و تنظیمات؛ مجوزهای کلیدی قفل‌اند و نقش حذف نمی‌شود.' }
};

interface Challenge {
  phone: string;
  expiresAt: number;
  attempts: number;
}

function createAdminApi(): AdminApi {
  const challenges = new Map<string, Challenge>();
  const lastOtp = new Map<string, number>();
  const otpCount = new Map<string, number>();
  const pwFails = new Map<string, number>();

  const userDto = (u: AUser): SystemUser => ({
    id: u.id,
    name: fullName(u),
    phone: u.phone,
    roles: u.roles,
    grants: u.grants,
    createdAt: u.createdAt
  });

  function audit(actor: AUser, action: string, summary: string, target?: AuditEntry['target'], meta: Record<string, unknown> = {}) {
    const s = load();
    s.audit.unshift({ id: `a-${++s.seq}`, at: new Date().toISOString(), actor: { id: actor.id, name: fullName(actor) }, action, summary, target, meta: { requestId: `req-${s.seq}`, ...meta } });
  }

  function who(t: string): AUser {
    const { userId } = actorFromToken(t);
    const u = load().users.find((x) => x.id === userId);
    if (!u) throw new ApiError('AUTH_TOKEN_INVALID', 'نشست نامعتبر است.', 401);
    return u;
  }
  const perms = (u: AUser) => permissionsOf(u.roles, load().rolePerms);
  function need(u: AUser, p: PermissionKey, msg = 'برای این کار مجوز ندارید.') {
    if (!perms(u).includes(p)) throw new ApiError('AUTH_FORBIDDEN', msg, 403);
  }
  function checkStepUp(t: string, su: string | undefined) {
    const { sessionId } = actorFromToken(t);
    const s = su ? stepUps.get(su) : undefined;
    if (!s || s.sessionId !== sessionId || s.exp < Date.now())
      throw new ApiError('AUTH_STEP_UP_REQUIRED', 'برای این کار باید هویت خود را دوباره تأیید کنید.', 403);
  }
  const fieldsError = (fields: Record<string, string>) => new ApiError('VALIDATION_FAILED', 'اطلاعات واردشده معتبر نیست.', 400, { fields });
  const conflict = (reason: string, msg: string, extra: Record<string, unknown> = {}) => new ApiError('CONFLICT', msg, 409, { reason, ...extra });

  function issue(user: AUser, device: DeviceInfo, isNew: boolean): AuthResult {
    const db = load();
    const sessionId = uid();
    db.sessions.push({ id: sessionId, userId: user.id, deviceLabel: device.deviceLabel, createdAt: new Date().toISOString() });
    db.cookieSessionId = sessionId;
    const accessToken = `mock.${uid()}`;
    tokens.set(accessToken, { sessionId, userId: user.id, exp: Date.now() + ACCESS_TTL * 1000 });
    save();
    return {
      accessToken,
      tokenType: 'Bearer',
      accessExpiresIn: ACCESS_TTL,
      sessionId,
      user: { id: user.id, phone: user.phone, isNewUser: isNew, profileComplete: Boolean(user.firstName && user.lastName), hasPassword: Boolean(user.password) }
    };
  }
  const challenge = (phone: string) => {
    const challengeId = uid();
    challenges.set(challengeId, { phone, expiresAt: Date.now() + OTP_TTL * 1000, attempts: 0 });
    return { challengeId, expiresInSec: OTP_TTL, resendAfterSec: RESEND_AFTER };
  };
  function checkCode(ch: Challenge | undefined, id: string, code: string) {
    if (!ch || ch.expiresAt < Date.now()) {
      challenges.delete(id);
      throw new ApiError('AUTH_OTP_EXPIRED', 'کد منقضی شده است. کد جدید دریافت کنید.', 400);
    }
    if (ch.attempts >= 3) throw new ApiError('AUTH_OTP_EXHAUSTED', 'تعداد تلاش‌ها تمام شد. کد جدید دریافت کنید.', 429);
    if (code !== OTP_CODE) {
      ch.attempts += 1;
      if (ch.attempts >= 3) throw new ApiError('AUTH_OTP_EXHAUSTED', 'تعداد تلاش‌ها تمام شد. کد جدید دریافت کنید.', 429);
      throw new ApiError('AUTH_OTP_INVALID', 'کد واردشده درست نیست.', 400, { attemptsLeft: 3 - ch.attempts });
    }
    challenges.delete(id);
  }

  function roleDto(key: SystemRoleKey): SystemRole {
    const s = load();
    return {
      key,
      ...ROLE_META[key],
      undeletable: true,
      permissions: s.rolePerms[key],
      lockedPermissions: LOCKED[key],
      holders: s.users.filter((u) => u.roles.includes(key)).length
    };
  }

  function paginate<T>(all: T[], page = 1, pageSize = 20): Page<T> {
    return { items: all.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: all.length };
  }

  return {
    auth: {
      async requestOtp(phone) {
        await enter();
        if (!/^09\d{9}$/.test(phone)) throw fieldsError({ phone: 'فرمت شماره معتبر نیست.' });
        if (phone.endsWith('0000')) throw new ApiError('RATE_LIMITED', 'تعداد درخواست‌ها زیاد است. کمی بعد دوباره امتحان کنید.', 429, { retryAfterSec: 45 });
        if (phone.endsWith('1111')) throw new ApiError('AUTH_OTP_SEND_FAILED', 'ارسال پیامک ممکن نشد. دوباره تلاش کنید.', 503);
        const wait = RESEND_AFTER - Math.floor((Date.now() - (lastOtp.get(phone) ?? 0)) / 1000);
        if (wait > 0) throw new ApiError('RATE_LIMITED', 'برای ارسال مجدد کد کمی صبر کنید.', 429, { retryAfterSec: wait });
        const n = (otpCount.get(phone) ?? 0) + 1;
        if (n > 5) throw new ApiError('RATE_LIMITED', 'تعداد درخواست‌های امروز بیش از حد مجاز است.', 429, { retryAfterSec: 600 });
        otpCount.set(phone, n);
        lastOtp.set(phone, Date.now());
        return challenge(phone);
      },
      async verifyOtp({ challengeId, code, ...device }) {
        await enter();
        const ch = challenges.get(challengeId);
        checkCode(ch, challengeId, code);
        const db = load();
        let user = db.users.find((u) => u.phone === ch!.phone);
        let isNew = false;
        if (!user) {
          isNew = true;
          user = { id: uid(), phone: ch!.phone, firstName: '', lastName: '', password: null, createdAt: new Date().toISOString(), roles: [], grants: [] };
          db.users.push(user);
        }
        return issue(user, device, isNew);
      },
      async loginPassword({ phone, password, ...device }) {
        await enter();
        const fails = pwFails.get(phone) ?? 0;
        if (fails >= 5) throw new ApiError('RATE_LIMITED', 'تلاش‌های ناموفق زیاد بود. کمی بعد دوباره امتحان کنید.', 429, { retryAfterSec: 60 });
        const user = load().users.find((u) => u.phone === phone);
        if (!user || !user.password || user.password !== password) {
          pwFails.set(phone, fails + 1);
          throw new ApiError('AUTH_INVALID_CREDENTIALS', 'شماره یا رمز عبور درست نیست.', 401);
        }
        pwFails.delete(phone);
        return issue(user, device, false);
      },
      async refresh() {
        await enter();
        const db = load();
        const session = db.cookieSessionId ? db.sessions.find((s) => s.id === db.cookieSessionId) : undefined;
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
      async stepUpRequest(t) {
        await enter();
        return challenge(who(t).phone);
      },
      async stepUpVerify(t, { challengeId, code }) {
        await enter();
        const { sessionId } = actorFromToken(t);
        checkCode(challenges.get(challengeId), challengeId, code);
        const stepUpToken = `su.${uid()}`;
        stepUps.set(stepUpToken, { sessionId, exp: Date.now() + STEP_UP_TTL * 1000 });
        return { stepUpToken, expiresInSec: STEP_UP_TTL };
      }
    },

    system: {
      async me(t) {
        await enter();
        dataGuard();
        const u = who(t);
        if (u.roles.length === 0) throw new ApiError('AUTH_FORBIDDEN', 'حساب شما به پنل مدیریت دسترسی ندارد.', 403);
        const me: SystemMe = { user: { id: u.id, name: fullName(u), phone: u.phone }, roles: u.roles, permissions: perms(u) };
        return me;
      },

      async overview(t) {
        await enter();
        dataGuard();
        const u = who(t);
        const s = load();
        const o: Overview = {
          users: { total: s.users.length, admins: s.users.filter((x) => x.roles.length > 0).length },
          sessions: s.sessionCounts,
          lastAudit: perms(u).includes('system.audit.view') ? s.audit.slice(0, 5) : []
        };
        return o;
      },

      async roles(t) {
        await enter();
        dataGuard();
        who(t);
        return (['developer', 'super_admin'] as SystemRoleKey[]).map(roleDto);
      },

      async permissions(t) {
        await enter();
        who(t);
        return PERMISSIONS;
      },

      async setRolePermissions(t, key, permissions, su) {
        await enter();
        const u = who(t);
        need(u, 'system.permission.edit', 'فقط مدیران مجاز به ویرایش ماتریس مجوز هستند.');
        checkStepUp(t, su);
        const v = validateRolePermissions(key, permissions);
        if (!v.ok) {
          if (v.reason === 'DEVELOPER_FIXED') throw new ApiError('AUTH_FORBIDDEN', 'ماتریس نقش توسعه‌دهنده ثابت است و ویرایش نمی‌شود.', 403);
          if (v.reason === 'LOCKED_PERMISSION') throw conflict('LOCKED_PERMISSION', 'برخی مجوزهای کلیدی این نقش قفل‌اند و برداشته نمی‌شوند.', { missing: v.missing });
          throw fieldsError({ permissions: 'مجوز نامعتبر است.' });
        }
        const s = load();
        s.rolePerms[key] = ALL_PERMISSIONS.filter((p) => permissions.includes(p));
        audit(u, 'system.permission.changed', `ماتریس مجوز نقش «${ROLE_META[key].title}» تغییر کرد`, { type: 'role', id: key, label: ROLE_META[key].title }, { permissions: s.rolePerms[key] });
        save();
        return roleDto(key);
      },

      async users(t, q = {}) {
        await enter();
        dataGuard();
        need(who(t), 'system.users.view');
        const term = (q.q ?? '').trim().toLowerCase();
        let list = load().users.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (term) list = list.filter((x) => fullName(x).toLowerCase().includes(term) || x.phone.includes(term));
        if (q.role === 'none') list = list.filter((x) => x.roles.length === 0);
        else if (q.role) list = list.filter((x) => x.roles.includes(q.role as SystemRoleKey));
        return paginate(list.map(userDto), q.page, q.pageSize ?? 10);
      },

      async user(t, id) {
        await enter();
        dataGuard();
        need(who(t), 'system.users.view');
        const u = load().users.find((x) => x.id === id);
        if (!u) throw new ApiError('NOT_FOUND', 'این کاربر پیدا نشد.', 404);
        return userDto(u);
      },

      async setUserRoles(t, id, roles, su) {
        await enter();
        const actor = who(t);
        need(actor, 'system.role.assign', 'فقط مدیران مجاز به تخصیص نقش هستند.');
        checkStepUp(t, su);
        const s = load();
        const target = s.users.find((x) => x.id === id);
        if (!target) throw new ApiError('NOT_FOUND', 'این کاربر پیدا نشد.', 404);
        const next = [...new Set(roles)];
        if (next.some((r) => r !== 'developer' && r !== 'super_admin')) throw fieldsError({ roles: 'نقش نامعتبر است.' });
        if (touchesDeveloper(target.roles, next) && !actor.roles.includes('developer'))
          throw new ApiError('AUTH_FORBIDDEN', 'فقط توسعه‌دهنده می‌تواند نقش توسعه‌دهنده را تغییر دهد.', 403);
        for (const r of target.roles.filter((x) => !next.includes(x))) {
          const holdersAfter = s.users.filter((x) => x.id !== id && x.roles.includes(r)).length;
          if (wouldLeaveNoHolder(holdersAfter))
            throw conflict('LAST_HOLDER', `«${ROLE_META[r].title}» آخرین دارندهٔ این نقش است و نقش نباید بدون دارنده بماند.`, { role: r });
        }
        const added = next.filter((r) => !target.roles.includes(r));
        const removed = target.roles.filter((r) => !next.includes(r));
        target.roles = next;
        const tgt = { type: 'user' as const, id: target.id, label: fullName(target) };
        for (const r of added) audit(actor, 'system.role.assigned', `نقش «${ROLE_META[r].title}» به ${tgt.label} اختصاص یافت`, tgt, { role: r });
        for (const r of removed) audit(actor, 'system.role.removed', `نقش «${ROLE_META[r].title}» از ${tgt.label} برداشته شد`, tgt, { role: r });
        save();
        return userDto(target);
      },

      async setUserGrants(t, id, grants, su) {
        await enter();
        const actor = who(t);
        need(actor, 'system.role.assign', 'فقط مدیران مجاز به تخصیص مجوز هستند.');
        checkStepUp(t, su);
        const target = load().users.find((x) => x.id === id);
        if (!target) throw new ApiError('NOT_FOUND', 'این کاربر پیدا نشد.', 404);
        if (grants.some((g) => !ALLOWED_GRANTS.includes(g))) throw fieldsError({ grants: 'مجوز نامعتبر است.' });
        const next = [...new Set(grants)] as Grant[];
        const tgt = { type: 'user' as const, id: target.id, label: fullName(target) };
        for (const g of next.filter((x) => !target.grants.includes(x))) audit(actor, 'system.grant.added', `مجوز «ساخت جلسه» به ${tgt.label} داده شد`, tgt, { grant: g });
        for (const g of target.grants.filter((x) => !next.includes(x))) audit(actor, 'system.grant.removed', `مجوز «ساخت جلسه» از ${tgt.label} گرفته شد`, tgt, { grant: g });
        target.grants = next;
        save();
        return userDto(target);
      },

      async settings(t) {
        await enter();
        dataGuard();
        need(who(t), 'system.settings.view');
        return structuredClone(load().settings);
      },

      async updateSettings(t, input: SettingsInput, su) {
        await enter();
        const actor = who(t);
        need(actor, 'system.settings.edit', 'فقط مدیران مجاز به ویرایش تنظیمات هستند.');
        checkStepUp(t, su);
        const s = load();
        if (input.version !== s.settings.version)
          throw conflict('VERSION_MISMATCH', 'تنظیمات در این فاصله توسط شخص دیگری تغییر کرده است. صفحه را تازه کنید.', { currentVersion: s.settings.version });
        const errs = validateSettings(input);
        if (Object.keys(errs).length) throw fieldsError(errs);
        const prev = s.settings;
        const changed: string[] = [];
        if (JSON.stringify(prev.evalWeights) !== JSON.stringify(input.evalWeights)) changed.push('وزن ارزیابی');
        if (JSON.stringify(prev.badgeThresholds) !== JSON.stringify(input.badgeThresholds)) changed.push('آستانهٔ نشان‌ها');
        if (JSON.stringify(prev.flags) !== JSON.stringify(input.flags)) changed.push('پرچم‌ها');
        const next: SystemSettings = {
          version: prev.version + 1,
          evalWeights: { ...input.evalWeights },
          badgeThresholds: [...input.badgeThresholds] as SystemSettings['badgeThresholds'],
          flags: { ...prev.flags, ...input.flags },
          updatedAt: new Date().toISOString(),
          updatedBy: fullName(actor)
        };
        s.settings = next;
        if (changed.length) audit(actor, 'system.settings.changed', `تنظیمات سراسری به‌روز شد: ${changed.join('، ')}`, { type: 'settings', id: 'settings', label: 'تنظیمات سراسری' }, { version: next.version, changed });
        save();
        return structuredClone(next);
      },

      async audit(t, q: AuditQuery = {}) {
        await enter();
        dataGuard();
        need(who(t), 'system.audit.view');
        const term = (q.q ?? '').trim().toLowerCase();
        let list = load().audit.slice();
        if (q.action) list = list.filter((a) => a.action === q.action);
        if (term) list = list.filter((a) => a.summary.toLowerCase().includes(term) || a.actor.name.toLowerCase().includes(term));
        return paginate(list, q.page, q.pageSize ?? 10);
      }
    }
  };
}

export const adminMockApi = createAdminApi();
