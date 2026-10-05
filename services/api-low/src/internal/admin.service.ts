import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { z } from 'zod';
import { internal } from '@isra/api-types';
import { PasswordService } from '../auth/password.service';
import { SessionStatusCache } from '../auth/session-status.cache';
import { SessionService } from '../auth/session.service';
import { AppError, conflict } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';

type Create = z.infer<typeof internal.LowAdminCreateUser>;
type Update = z.infer<typeof internal.LowAdminUpdateUser>;
type PasswordBody = z.infer<typeof internal.LowAdminPassword>;
type ChangePw = z.infer<typeof internal.LowAdminChangePassword>;
type Interval = 'day' | 'week' | 'month';

/**
 * افست ثابت Asia/Tehran (+۰۳:۳۰). ایران از ۱۴۰۱ ساعت تابستانی ندارد؛ برای bucketبندی گزارش (بازهٔ ≤۳۶۶ روز) کافی و بدون جدول tz در MySQL است.
 */
const TEHRAN_OFFSET_MIN = 210;
const DAY_MS = 86_400_000;
const NO_PHONE_IN_PW = 'رمز نباید شامل شمارهٔ موبایل باشد.';

const isDup = (e: unknown): boolean => (e as { code?: string; driverError?: { code?: string } })?.code === 'ER_DUP_ENTRY' || (e as { driverError?: { code?: string } })?.driverError?.code === 'ER_DUP_ENTRY';
const flag = (v: unknown): boolean => Number(v) > 0;

interface UserRow {
  id: Buffer;
  phone: string;
  status: 'active' | 'disabled' | 'deleted';
  mcp: number | string | boolean;
  created_at: Date;
  first_name: string | null;
  last_name: string | null;
  has_pw: number | string | bigint;
}

/** تاریخ `YYYY-MM-DD` ⇒ ms (نیمه‌شب UTC همان روز تقویمی) */
const dayMs = (d: string): number => Date.parse(`${d}T00:00:00.000Z`);
const dayStr = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** شروع bucket: day=همان روز؛ week=شنبه؛ month=روز اول ماه میلادی (همان ماه‌های تقویم گزارش high/mid) */
export function bucketStart(day: string, interval: Interval): string {
  if (interval === 'day') return day;
  if (interval === 'month') return `${day.slice(0, 7)}-01`;
  const ms = dayMs(day);
  const back = (new Date(ms).getUTCDay() + 1) % 7; // شنبه=۰ … جمعه=۶
  return dayStr(ms - back * DAY_MS);
}

@Injectable()
export class AdminService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly cache: SessionStatusCache,
    private readonly limiter: RateLimitService
  ) {}

  // ───────────────────────── کمکی‌ها ─────────────────────────
  private uid(id: string): Buffer {
    if (!isUuid(id)) throw new AppError('NOT_FOUND');
    return uuidToBuf(id);
  }

  private async emit(m: EntityManager, type: string, payload: Record<string, unknown>, now: Date) {
    await m.query('INSERT INTO outbox_events (id, type, payload, created_at, attempts, next_attempt_at) VALUES (?, ?, ?, ?, 0, ?)', [uuidToBuf(uuidv7(now.getTime())), type, JSON.stringify(payload), now, now]);
  }

  /** کاربر با قفل ردیف؛ نبودن ⇒ 404 */
  private async lock(m: EntityManager, id: string): Promise<{ phone: string; status: UserRow['status'] }> {
    const rows = (await m.query('SELECT phone, status FROM users WHERE id = ? FOR UPDATE', [this.uid(id)])) as { phone: string; status: UserRow['status'] }[];
    if (!rows[0]) throw new AppError('NOT_FOUND');
    return rows[0];
  }

  private notActive(): AppError {
    return conflict('USER_NOT_ACTIVE', 'کاربر حذف شده است.');
  }

  private assertPasswordOk(phone: string, password: string) {
    if (password.includes(phone)) throw new AppError('VALIDATION_FAILED', { details: { fields: { password: NO_PHONE_IN_PW } } });
  }

  // ───────────────────────── کاربر ─────────────────────────
  async getUser(id: string) {
    const uid = this.uid(id);
    const [rows, byClient, last] = await Promise.all([
      this.ds.query(
        `SELECT u.id, u.phone, u.status, u.must_change_password AS mcp, u.created_at, p.first_name, p.last_name, (c.user_id IS NOT NULL) AS has_pw
           FROM users u LEFT JOIN profiles p ON p.user_id = u.id LEFT JOIN user_credentials c ON c.user_id = u.id WHERE u.id = ?`,
        [uid]
      ) as Promise<UserRow[]>,
      this.ds.query('SELECT client_id, COUNT(*) AS n FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL GROUP BY client_id', [uid]) as Promise<{ client_id: string | null; n: string | number }[]>,
      this.ds.query('SELECT MAX(last_active_at) AS last FROM auth_sessions WHERE user_id = ?', [uid]) as Promise<{ last: Date | null }[]>
    ]);
    const u = rows[0];
    if (!u) throw new AppError('NOT_FOUND');
    const sessionsByClient: Record<string, number> = {};
    let active = 0;
    for (const r of byClient) {
      const k = r.client_id ?? 'unknown';
      sessionsByClient[k] = (sessionsByClient[k] ?? 0) + Number(r.n);
      active += Number(r.n);
    }
    return {
      id: bufToUuid(u.id),
      phone: u.phone,
      firstName: u.first_name ?? '',
      lastName: u.last_name ?? '',
      status: u.status,
      hasPassword: flag(u.has_pw),
      mustChangePassword: flag(u.mcp),
      createdAt: u.created_at.toISOString(),
      lastActiveAt: last[0]?.last ? last[0].last.toISOString() : null,
      activeSessions: active,
      sessionsByClient
    };
  }

  async createUser(b: Create) {
    if (b.password) this.assertPasswordOk(b.phone, b.password);
    const hash = b.password ? await this.passwords.hash(b.password) : null;
    const now = this.clock.now();
    const id = uuidv7(now.getTime());
    try {
      await this.ds.transaction(async (m) => {
        const taken = (await m.query('SELECT 1 AS x FROM users WHERE phone = ? FOR UPDATE', [b.phone])) as unknown[];
        if (taken.length) throw conflict('PHONE_TAKEN', 'این شماره قبلاً ثبت شده است.');
        await m.query('INSERT INTO users (id, phone, status, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [uuidToBuf(id), b.phone, 'active', hash ? 1 : 0, now, now]);
        await m.query('INSERT INTO profiles (user_id, first_name, last_name, updated_at) VALUES (?, ?, ?, ?)', [uuidToBuf(id), b.firstName, b.lastName, now]);
        if (hash) await m.query('INSERT INTO user_credentials (user_id, password_hash, updated_at) VALUES (?, ?, ?)', [uuidToBuf(id), hash, now]);
        await this.emit(m, 'user.registered', { userId: id, phone: b.phone, firstName: b.firstName, lastName: b.lastName, createdAt: now.toISOString() }, now);
      });
    } catch (e) {
      if (isDup(e)) throw conflict('PHONE_TAKEN', 'این شماره قبلاً ثبت شده است.');
      throw e;
    }
    return this.getUser(id);
  }

  async updateUser(id: string, b: Update) {
    const now = this.clock.now();
    const uid = this.uid(id);
    try {
      await this.ds.transaction(async (m) => {
        const cur = await this.lock(m, id);
        if (cur.status === 'deleted') throw this.notActive();
        if (b.firstName !== undefined || b.lastName !== undefined) {
          const sets: string[] = [];
          const args: unknown[] = [];
          const ev: Record<string, unknown> = { userId: id };
          if (b.firstName !== undefined) (sets.push('first_name = ?'), args.push(b.firstName), (ev.firstName = b.firstName));
          if (b.lastName !== undefined) (sets.push('last_name = ?'), args.push(b.lastName), (ev.lastName = b.lastName));
          await m.query(`UPDATE profiles SET ${sets.join(', ')}, updated_at = ? WHERE user_id = ?`, [...args, now, uid]);
          await this.emit(m, 'user.profile.updated', ev, now);
        }
        if (b.phone !== undefined && b.phone !== cur.phone) {
          const taken = (await m.query('SELECT 1 AS x FROM users WHERE phone = ? AND id <> ?', [b.phone, uid])) as unknown[];
          if (taken.length) throw conflict('PHONE_TAKEN', 'این شماره قبلاً ثبت شده است.');
          await m.query('UPDATE users SET phone = ?, updated_at = ? WHERE id = ?', [b.phone, now, uid]);
          await this.emit(m, 'user.phone.changed', { userId: id, phone: b.phone, changedAt: now.toISOString() }, now);
        }
      });
    } catch (e) {
      if (isDup(e)) throw conflict('PHONE_TAKEN', 'این شماره قبلاً ثبت شده است.');
      throw e;
    }
    return this.getUser(id);
  }

  async setStatus(id: string, status: 'active' | 'disabled') {
    const now = this.clock.now();
    await this.ds.transaction(async (m) => {
      const cur = await this.lock(m, id);
      if (cur.status === 'deleted') throw this.notActive();
      if (cur.status === status) return; // idempotent
      await m.query('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', [status, now, uuidToBuf(id)]);
      if (status === 'disabled') await this.sessions.revokeAllInTx(m, id, now);
      await this.emit(m, 'user.status.changed', { userId: id, status, changedAt: now.toISOString() }, now);
    });
    this.cache.invalidateUser(id);
    return this.getUser(id);
  }

  /**
   * حذف نرم + ناشناس‌سازی (برگشت‌ناپذیر، idempotent). شمارهٔ ناشناس `d` + ۱۰ هگز از شناسه؛ ده نویسهٔ ابتدای UUIDv7 فقط بخش زمان است
   * (کاربران هم‌پنجره ⇒ برخورد) پس در برخورد از قطعهٔ تصادفی انتهای شناسه استفاده می‌شود.
   */
  async deleteUser(id: string) {
    const now = this.clock.now();
    const uid = this.uid(id);
    const hex = uid.toString('hex');
    await this.ds.transaction(async (m) => {
      const cur = await this.lock(m, id);
      if (cur.status === 'deleted') return;
      let anon = '';
      for (const c of [hex.slice(-10), hex.slice(0, 10), hex.slice(10, 20)]) {
        const used = (await m.query('SELECT 1 AS x FROM users WHERE phone = ?', [`d${c}`])) as unknown[];
        if (!used.length) {
          anon = `d${c}`;
          break;
        }
      }
      if (!anon) throw new AppError('INTERNAL_ERROR');
      await m.query("UPDATE users SET status = 'deleted', phone = ?, must_change_password = 0, updated_at = ? WHERE id = ?", [anon, now, uid]);
      await m.query("UPDATE profiles SET first_name = '', last_name = '', avatar_path = NULL, updated_at = ? WHERE user_id = ?", [now, uid]);
      await m.query('DELETE FROM user_credentials WHERE user_id = ?', [uid]);
      await m.query('DELETE FROM inbox_messages WHERE user_id = ?', [uid]);
      // OTP باز پاک؛ بقیه برای آمار می‌مانند ولی شمارهٔ واقعی از آن‌ها حذف می‌شود
      await m.query('DELETE FROM otp_challenges WHERE phone = ? AND consumed_at IS NULL', [cur.phone]);
      await m.query('UPDATE otp_challenges SET phone = ? WHERE phone = ?', [anon, cur.phone]);
      await this.sessions.revokeAllInTx(m, id, now);
      await m.query(
        `INSERT INTO user_claims (user_id, system_roles, grants, perm_ver, updated_at) VALUES (?, '[]', '[]', 2, ?)
         ON DUPLICATE KEY UPDATE system_roles = '[]', grants = '[]', perm_ver = perm_ver + 1, updated_at = VALUES(updated_at)`,
        [uid, now]
      );
      await this.emit(m, 'user.status.changed', { userId: id, status: 'deleted', changedAt: now.toISOString(), anonymizedPhone: anon }, now);
    });
    this.cache.invalidateUser(id);
    return this.getUser(id);
  }

  // ───────────────────────── رمز ─────────────────────────
  async password(id: string, b: PasswordBody) {
    const uid = this.uid(id);
    if (b.action === 'set') {
      const ph = (await this.ds.query('SELECT phone FROM users WHERE id = ?', [uid])) as { phone: string }[];
      if (!ph[0]) throw new AppError('NOT_FOUND');
      this.assertPasswordOk(ph[0].phone, b.password);
    }
    const hash = b.action === 'set' ? await this.passwords.hash(b.password) : null;
    const now = this.clock.now();
    await this.ds.transaction(async (m) => {
      const cur = await this.lock(m, id);
      if (cur.status === 'deleted') throw this.notActive();
      if (hash) {
        await m.query('INSERT INTO user_credentials (user_id, password_hash, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), updated_at = VALUES(updated_at)', [uid, hash, now]);
        await m.query('UPDATE users SET must_change_password = 1, updated_at = ? WHERE id = ?', [now, uid]);
        await this.sessions.revokeAllInTx(m, id, now);
      } else {
        await m.query('DELETE FROM user_credentials WHERE user_id = ?', [uid]);
        await m.query('UPDATE users SET must_change_password = 0, updated_at = ? WHERE id = ?', [now, uid]);
      }
    });
    this.cache.invalidateUser(id);
    return this.getUser(id);
  }

  /** تغییر رمز توسط خود کاربر از مسیر high؛ `current` با argon2 تطبیق می‌خورد و شمارندهٔ per-کاربر دارد */
  async changePassword(id: string, b: ChangePw) {
    const uid = this.uid(id);
    const rows = (await this.ds.query('SELECT u.phone, u.status, c.password_hash AS pw FROM users u LEFT JOIN user_credentials c ON c.user_id = u.id WHERE u.id = ?', [uid])) as {
      phone: string;
      status: UserRow['status'];
      pw: string | null;
    }[];
    const u = rows[0];
    if (!u) throw new AppError('NOT_FOUND');
    if (u.status === 'deleted') throw this.notActive();
    this.assertPasswordOk(u.phone, b.newPassword);
    if (b.verified === 'current') {
      if (b.currentPassword === undefined) throw new AppError('VALIDATION_FAILED', { details: { fields: { currentPassword: 'رمز فعلی لازم است.' } } });
      const lim = await this.limiter.hit('durable', `cp:u:${id}`, 10, 900);
      if (!lim.allowed) throw new AppError('RATE_LIMITED', { details: { retryAfterSec: lim.resetSec } });
      const ok = u.pw ? await this.passwords.verify(u.pw, b.currentPassword) : (await this.passwords.burn(b.currentPassword), false);
      if (!ok) throw new AppError('AUTH_INVALID_CREDENTIALS');
    }
    const hash = await this.passwords.hash(b.newPassword);
    const now = this.clock.now();
    await this.ds.transaction(async (m) => {
      const cur = await this.lock(m, id);
      if (cur.status === 'deleted') throw this.notActive();
      await m.query('INSERT INTO user_credentials (user_id, password_hash, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), updated_at = VALUES(updated_at)', [uid, hash, now]);
      await m.query('UPDATE users SET must_change_password = 0, updated_at = ? WHERE id = ?', [now, uid]);
      await this.sessions.revokeAllInTx(m, id, now, b.keepSessionId);
    });
    this.cache.invalidateUser(id);
    return {};
  }

  // ───────────────────────── نشست‌ها ─────────────────────────
  async listSessions(id: string, q: { page: number; pageSize: number; activeOnly: 'true' | 'false' }) {
    const uid = this.uid(id);
    const exists = (await this.ds.query('SELECT 1 AS x FROM users WHERE id = ?', [uid])) as unknown[];
    if (!exists.length) throw new AppError('NOT_FOUND');
    const where = q.activeOnly === 'true' ? 'user_id = ? AND revoked_at IS NULL' : 'user_id = ?';
    const [rows, cnt] = await Promise.all([
      this.ds.query(`SELECT id, device_label, platform, client_id, ip, created_at, last_active_at, revoked_at FROM auth_sessions WHERE ${where} ORDER BY last_active_at DESC, id DESC LIMIT ? OFFSET ?`, [uid, q.pageSize, (q.page - 1) * q.pageSize]) as Promise<
        { id: Buffer; device_label: string; platform: 'web' | 'android'; client_id: string | null; ip: string; created_at: Date; last_active_at: Date; revoked_at: Date | null }[]
      >,
      this.ds.query(`SELECT COUNT(*) AS n FROM auth_sessions WHERE ${where}`, [uid]) as Promise<{ n: string | number }[]>
    ]);
    return {
      items: rows.map((r) => ({
        id: bufToUuid(r.id),
        deviceLabel: r.device_label,
        platform: r.platform,
        client: r.client_id,
        ip: r.ip,
        createdAt: r.created_at.toISOString(),
        lastActiveAt: r.last_active_at.toISOString(),
        revokedAt: r.revoked_at ? r.revoked_at.toISOString() : null
      })),
      page: q.page,
      pageSize: q.pageSize,
      total: Number(cnt[0]?.n ?? 0)
    };
  }

  /** نشست باید متعلق به همین کاربر باشد (وگرنه 404)؛ revoke مجدد idempotent */
  async revokeSession(id: string, sessionId: string) {
    const uid = this.uid(id);
    if (!isUuid(sessionId)) throw new AppError('NOT_FOUND');
    const own = (await this.ds.query('SELECT 1 AS x FROM auth_sessions WHERE id = ? AND user_id = ?', [uuidToBuf(sessionId), uid])) as unknown[];
    if (!own.length) throw new AppError('NOT_FOUND');
    await this.sessions.revoke(sessionId);
    return {};
  }

  async logoutAll(id: string) {
    const now = this.clock.now();
    await this.ds.transaction(async (m) => {
      await this.lock(m, id);
      await this.sessions.revokeAllInTx(m, id, now);
    });
    this.cache.invalidateUser(id);
    return {};
  }

  // ───────────────────────── گزارش‌ها ─────────────────────────
  /** بازه `[from, to]` به‌وقت تهران ⇒ لحظهٔ UTC شروع/پایان‌(انحصاری)؛ همچنین فهرست bucketها به ترتیب */
  private range(q: { from: string; to: string; interval: Interval }) {
    const f = dayMs(q.from);
    const t = dayMs(q.to);
    if (Number.isNaN(f) || Number.isNaN(t) || t < f || (t - f) / DAY_MS > 365) throw new AppError('VALIDATION_FAILED', { details: { fields: { to: 'بازهٔ تاریخ نامعتبر است (حداکثر ۳۶۶ روز).' } } });
    const buckets: string[] = [];
    for (let d = f; d <= t; d += DAY_MS) {
      const b = bucketStart(dayStr(d), q.interval);
      if (buckets[buckets.length - 1] !== b) buckets.push(b);
    }
    const off = TEHRAN_OFFSET_MIN * 60_000;
    return { fromUtc: new Date(f - off), toUtc: new Date(t + DAY_MS - off), buckets };
  }

  private fold(buckets: string[], rows: { d: string }[], keys: string[], interval: Interval): Record<string, number[]> {
    const out: Record<string, number[]> = Object.fromEntries(buckets.map((b) => [b, keys.map(() => 0)]));
    for (const r of rows) {
      const slot = out[bucketStart(r.d, interval)];
      if (slot) keys.forEach((k, i) => (slot[i] = (slot[i] ?? 0) + Number((r as unknown as Record<string, unknown>)[k] ?? 0)));
    }
    return out;
  }

  async reportOtp(q: { from: string; to: string; interval: Interval }) {
    const r = this.range(q);
    const rows = (await this.ds.query(
      `SELECT DATE_FORMAT(DATE_ADD(created_at, INTERVAL ${TEHRAN_OFFSET_MIN} MINUTE), '%Y-%m-%d') AS d, COUNT(*) AS requested, SUM(consumed_at IS NOT NULL) AS verified
         FROM otp_challenges WHERE created_at >= ? AND created_at < ? GROUP BY d`,
      [r.fromUtc, r.toUtc]
    )) as { d: string; requested: string | number; verified: string | number | null }[];
    const f = this.fold(r.buckets, rows, ['requested', 'verified'], q.interval);
    return { interval: q.interval, items: r.buckets.map((b) => ({ bucket: b, requested: f[b]![0]!, verified: f[b]![1]! })) };
  }

  async reportClients() {
    const rows = (await this.ds.query('SELECT client_id, COUNT(*) AS n FROM auth_sessions WHERE revoked_at IS NULL GROUP BY client_id ORDER BY n DESC')) as { client_id: string | null; n: string | number }[];
    const acc = new Map<string, number>();
    for (const r of rows) acc.set(r.client_id ?? 'unknown', (acc.get(r.client_id ?? 'unknown') ?? 0) + Number(r.n));
    return { items: [...acc].map(([client, activeSessions]) => ({ client, activeSessions })).sort((a, b) => b.activeSessions - a.activeSessions || a.client.localeCompare(b.client)) };
  }

  async reportUsers(q: { from: string; to: string; interval: Interval }) {
    const r = this.range(q);
    const [st, pw, reg] = await Promise.all([
      this.ds.query('SELECT status, COUNT(*) AS n FROM users GROUP BY status') as Promise<{ status: string; n: string | number }[]>,
      this.ds.query('SELECT COUNT(*) AS n FROM user_credentials') as Promise<{ n: string | number }[]>,
      this.ds.query(
        `SELECT DATE_FORMAT(DATE_ADD(created_at, INTERVAL ${TEHRAN_OFFSET_MIN} MINUTE), '%Y-%m-%d') AS d, COUNT(*) AS c FROM users WHERE created_at >= ? AND created_at < ? GROUP BY d`,
        [r.fromUtc, r.toUtc]
      ) as Promise<{ d: string; c: string | number }[]>
    ]);
    const byStatus = { active: 0, disabled: 0, deleted: 0 };
    for (const s of st) if (s.status in byStatus) byStatus[s.status as keyof typeof byStatus] += Number(s.n);
    const f = this.fold(r.buckets, reg, ['c'], q.interval);
    const registered = reg.reduce((a, x) => a + Number(x.c), 0);
    return {
      total: byStatus.active + byStatus.disabled + byStatus.deleted,
      registered,
      byStatus,
      withPassword: Number(pw[0]?.n ?? 0),
      series: { interval: q.interval, items: r.buckets.map((b) => ({ bucket: b, count: f[b]![0]! })) }
    };
  }
}
