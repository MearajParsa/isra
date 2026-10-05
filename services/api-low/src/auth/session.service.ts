import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { ClientId } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { randomToken, sha256 } from '../common/crypto';
import { bufToUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { isWebClient } from '../common/request-context';
import { ENV, type Env } from '../config/env';
import { SessionStatusCache } from './session-status.cache';
import { TokenService } from './token.service';

const MAX_ACTIVE_SESSIONS = 20;
const TOUCH_EVERY_MS = 60_000;

export interface NewSessionInput {
  userId: string;
  deviceId: string;
  deviceLabel: string;
  client: ClientId | null;
  ip: string;
  /** احراز با OTP ⇒ معافیت step-up تا ۵ دقیقه */
  viaOtp: boolean;
}

export interface RotateResult {
  userId: string;
  sessionId: string;
  deviceId: string;
  /** null = در پنجرهٔ grace (کلاینت وب) — refresh تازه قبلاً توسط درخواست هم‌زمان در cookie نشسته */
  refreshToken: string | null;
}

interface SessionRow {
  id: Buffer;
  device_id: string;
  device_label: string;
  platform: 'web' | 'android';
  created_at: Date;
  last_active_at: Date;
}

@Injectable()
export class SessionService {
  private readonly touched = new Map<string, number>();

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly tokens: TokenService,
    private readonly cache: SessionStatusCache,
    @Inject(ENV) private readonly env: Env
  ) {}

  /** نشست + refresh اولیه. هر دستگاه یک نشست فعال دارد؛ سقف ۲۰ نشست فعال per کاربر */
  async create(i: NewSessionInput): Promise<{ sessionId: string; refreshToken: string }> {
    const now = this.clock.now();
    const sessionId = uuidv7(now.getTime());
    const refreshToken = randomToken(32);
    const claims = await this.claims(i.userId);
    const revoked: string[] = [];

    await this.ds.transaction(async (m) => {
      const same = (await m.query('SELECT id FROM auth_sessions WHERE user_id = ? AND device_id = ? AND revoked_at IS NULL', [uuidToBuf(i.userId), i.deviceId])) as { id: Buffer }[];
      for (const r of same) revoked.push(bufToUuid(r.id));
      if (same.length) await m.query('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND device_id = ? AND revoked_at IS NULL', [now, uuidToBuf(i.userId), i.deviceId]);

      await m.query(
        `INSERT INTO auth_sessions (id, user_id, device_id, device_label, platform, client_id, ip, created_at, last_active_at, otp_at, perm_ver)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidToBuf(sessionId), uuidToBuf(i.userId), i.deviceId, i.deviceLabel.slice(0, 80), isWebClient(i.client) ? 'web' : 'android', i.client, i.ip.slice(0, 45), now, now, i.viaOtp ? now : null, claims.permVer]
      );
      await this.insertRefresh(m, sessionId, refreshToken, now);

      const extra = (await m.query('SELECT id FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_active_at DESC LIMIT 1000 OFFSET ?', [uuidToBuf(i.userId), MAX_ACTIVE_SESSIONS])) as { id: Buffer }[];
      for (const r of extra) {
        revoked.push(bufToUuid(r.id));
        await m.query('UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [now, r.id]);
      }
      await this.publishRevoked(m, revoked, now);
    });
    this.cache.invalidate(...revoked);
    return { sessionId, refreshToken };
  }

  /**
   * revoke فقط در low ثبت می‌شود؛ mid/high با این رویداد (outbox) نشست را تا انقضای access رد می‌کنند.
   * `expiresAt` = حداکثر عمر access توکن‌های موجود (+ حاشیه).
   */
  private async publishRevoked(m: EntityManager, ids: string[], now: Date) {
    if (!ids.length) return;
    const payload = { sessionIds: ids, expiresAt: new Date(now.getTime() + (this.env.ACCESS_TTL_SEC + 120) * 1000).toISOString() };
    await m.query('INSERT INTO outbox_events (id, type, payload, created_at, attempts, next_attempt_at) VALUES (?, ?, ?, ?, 0, ?)', [uuidToBuf(uuidv7(now.getTime())), 'session.revoked', JSON.stringify(payload), now, now]);
  }

  /**
   * revoke همهٔ نشست‌های فعال یک کاربر (به‌جز `except`) داخل تراکنش فراخوان + refreshهای آن‌ها منقضی + رویداد `session.revoked`.
   * فراخوان پس از commit باید cache را invalidate کند (`SessionStatusCache.invalidateUser`).
   */
  async revokeAllInTx(m: EntityManager, userId: string, now: Date, except?: string): Promise<string[]> {
    const uid = uuidToBuf(userId);
    const keep = except ? uuidToBuf(except) : null;
    const rows = (await m.query(`SELECT id FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL${keep ? ' AND id <> ?' : ''} FOR UPDATE`, keep ? [uid, keep] : [uid])) as { id: Buffer }[];
    const ids = rows.map((r) => bufToUuid(r.id));
    if (!ids.length) return ids;
    await m.query(`UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL${keep ? ' AND id <> ?' : ''}`, keep ? [now, uid, keep] : [now, uid]);
    await m.query(`UPDATE refresh_tokens SET expires_at = LEAST(expires_at, ?) WHERE session_id IN (SELECT id FROM auth_sessions WHERE user_id = ? AND revoked_at = ?)`, [now, uid, now]);
    for (let i = 0; i < ids.length; i += 20) await this.publishRevoked(m, ids.slice(i, i + 20), now);
    return ids;
  }

  private async insertRefresh(m: EntityManager, sessionId: string, raw: string, now: Date) {
    await m.query('INSERT INTO refresh_tokens (id, session_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', [
      uuidToBuf(uuidv7(now.getTime())),
      uuidToBuf(sessionId),
      sha256(raw),
      now,
      new Date(now.getTime() + this.env.REFRESH_TTL_SEC * 1000)
    ]);
  }

  /**
   * rotation: هر refresh یک‌بار مصرف است. استفادهٔ مجدد از توکن چرخیده‌شده ⇒ کل نشست revoke (reuse detection)،
   * مگر وب در پنجرهٔ grace (مسابقهٔ چند-tab) که فقط access جدید می‌گیرد.
   */
  async rotate(raw: string, client: ClientId | null): Promise<RotateResult> {
    const now = this.clock.now();
    type Outcome = { kind: 'ok'; r: RotateResult } | { kind: 'reuse'; sessionId: string } | { kind: 'invalid' };

    const out = await this.ds.transaction(async (m): Promise<Outcome> => {
      const rows = (await m.query('SELECT id, session_id, expires_at, rotated_at FROM refresh_tokens WHERE token_hash = ? FOR UPDATE', [sha256(raw)])) as {
        id: Buffer;
        session_id: Buffer;
        expires_at: Date;
        rotated_at: Date | null;
      }[];
      const t = rows[0];
      if (!t) return { kind: 'invalid' };
      const sessionId = bufToUuid(t.session_id);
      const s = (await m.query('SELECT user_id, device_id, revoked_at, created_at FROM auth_sessions WHERE id = ?', [t.session_id])) as { user_id: Buffer; device_id: string; revoked_at: Date | null; created_at: Date }[];
      const sess = s[0];
      if (!sess || sess.revoked_at || t.expires_at.getTime() <= now.getTime()) return { kind: 'invalid' };
      // سقف مطلق عمر نشست: refresh لغزان است؛ بدون سقف یک نشست هرگز منقضی نمی‌شد
      if (now.getTime() - sess.created_at.getTime() > this.env.SESSION_MAX_AGE_SEC * 1000) return { kind: 'invalid' };
      const base = { userId: bufToUuid(sess.user_id), sessionId, deviceId: sess.device_id };

      if (t.rotated_at) {
        const withinGrace = isWebClient(client) && now.getTime() - t.rotated_at.getTime() <= this.env.REFRESH_GRACE_SEC * 1000;
        return withinGrace ? { kind: 'ok', r: { ...base, refreshToken: null } } : { kind: 'reuse', sessionId };
      }

      const next = randomToken(32);
      await m.query('UPDATE refresh_tokens SET rotated_at = ? WHERE id = ?', [now, t.id]);
      await this.insertRefresh(m, sessionId, next, now);
      return { kind: 'ok', r: { ...base, refreshToken: next } };
    });

    if (out.kind === 'reuse') {
      await this.revoke(out.sessionId);
      throw new AppError('AUTH_REFRESH_INVALID');
    }
    if (out.kind === 'invalid') throw new AppError('AUTH_REFRESH_INVALID');
    return out.r;
  }

  async issueAccess(userId: string, sessionId: string, deviceId: string) {
    const c = await this.claims(userId);
    const u = (await this.ds.query('SELECT must_change_password AS mcp FROM users WHERE id = ?', [uuidToBuf(userId)])) as { mcp: number | string | boolean }[];
    return this.tokens.signAccess({ userId, sessionId, deviceId, roles: c.roles, grants: c.grants, permVer: c.permVer, mustChangePassword: Number(u[0]?.mcp ?? 0) > 0 });
  }

  private async claims(userId: string): Promise<{ roles: string[]; grants: string[]; permVer: number }> {
    const rows = (await this.ds.query('SELECT system_roles, grants, perm_ver FROM user_claims WHERE user_id = ?', [uuidToBuf(userId)])) as {
      system_roles: string[] | string;
      grants: string[] | string;
      perm_ver: number;
    }[];
    const r = rows[0];
    const arr = (v: string[] | string | undefined): string[] => (Array.isArray(v) ? v : typeof v === 'string' ? (JSON.parse(v) as string[]) : []);
    return { roles: arr(r?.system_roles), grants: arr(r?.grants), permVer: r?.perm_ver ?? 1 };
  }

  async revoke(sessionId: string): Promise<boolean> {
    const now = this.clock.now();
    const changed = await this.ds.transaction(async (m) => {
      const r = (await m.query('UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [now, uuidToBuf(sessionId)])) as { affectedRows?: number };
      const ok = (r.affectedRows ?? 0) > 0;
      if (ok) await this.publishRevoked(m, [sessionId], now);
      return ok;
    });
    this.cache.invalidate(sessionId);
    return changed;
  }

  /** revoke نشست متعلق به کاربر؛ نشست دیگران ⇒ false (بدون نشت وجود) */
  async revokeOwned(userId: string, sessionId: string): Promise<boolean> {
    const own = (await this.ds.query('SELECT 1 AS x FROM auth_sessions WHERE id = ? AND user_id = ? AND revoked_at IS NULL', [uuidToBuf(sessionId), uuidToBuf(userId)])) as unknown[];
    if (!own.length) return false;
    return this.revoke(sessionId);
  }

  async revokeOthers(userId: string, keepSessionId: string): Promise<void> {
    const now = this.clock.now();
    const ids = await this.ds.transaction(async (m) => {
      const rows = (await m.query('SELECT id FROM auth_sessions WHERE user_id = ? AND id <> ? AND revoked_at IS NULL FOR UPDATE', [uuidToBuf(userId), uuidToBuf(keepSessionId)])) as { id: Buffer }[];
      await m.query('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND id <> ? AND revoked_at IS NULL', [now, uuidToBuf(userId), uuidToBuf(keepSessionId)]);
      const out = rows.map((r) => bufToUuid(r.id));
      for (let i = 0; i < out.length; i += 20) await this.publishRevoked(m, out.slice(i, i + 20), now);
      return out;
    });
    this.cache.invalidate(...ids);
  }

  async list(userId: string, page: number, pageSize: number, currentSid: string) {
    const uid = uuidToBuf(userId);
    const [rows, cnt] = await Promise.all([
      this.ds.query('SELECT id, device_id, device_label, platform, created_at, last_active_at FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_active_at DESC, id DESC LIMIT ? OFFSET ?', [uid, pageSize, (page - 1) * pageSize]) as Promise<SessionRow[]>,
      this.ds.query('SELECT COUNT(*) AS n FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL', [uid]) as Promise<{ n: string | number }[]>
    ]);
    return {
      items: rows.map((r) => {
        const id = bufToUuid(r.id);
        return { id, deviceLabel: r.device_label, platform: r.platform, createdAt: r.created_at.toISOString(), lastActiveAt: r.last_active_at.toISOString(), current: id === currentSid };
      }),
      page,
      pageSize,
      total: Number(cnt[0]?.n ?? 0)
    };
  }

  /** lastActiveAt حداکثر هر ۶۰ ثانیه per نشست (کاهش write) — fire-and-forget */
  touch(sessionId: string): void {
    const now = this.clock.now().getTime();
    const last = this.touched.get(sessionId) ?? 0;
    if (now - last < TOUCH_EVERY_MS) return;
    if (this.touched.size > 50_000) this.touched.clear();
    this.touched.set(sessionId, now);
    void this.ds.query('UPDATE auth_sessions SET last_active_at = ? WHERE id = ? AND revoked_at IS NULL', [new Date(now), uuidToBuf(sessionId)]).catch(() => undefined);
  }

  invalidateCache(...ids: string[]) {
    this.cache.invalidate(...ids);
  }
}
