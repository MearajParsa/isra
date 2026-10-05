import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { PasswordService } from '../auth/password.service';
import { SessionStatusCache } from '../auth/session-status.cache';
import { SessionService } from '../auth/session.service';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';

interface ProfileRow {
  first_name: string;
  last_name: string;
  avatar_path: string | null;
}

@Injectable()
export class MeService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly cache: SessionStatusCache,
    private readonly limiter: RateLimitService
  ) {}

  private profileOut(r?: ProfileRow) {
    return { firstName: r?.first_name ?? '', lastName: r?.last_name ?? '', avatarUrl: null as string | null };
  }

  async profile(userId: string) {
    const rows = (await this.ds.query('SELECT first_name, last_name, avatar_path FROM profiles WHERE user_id = ?', [uuidToBuf(userId)])) as ProfileRow[];
    return this.profileOut(rows[0]);
  }

  async me(userId: string) {
    const rows = (await this.ds.query(
      `SELECT u.phone, u.must_change_password AS mcp, p.first_name, p.last_name, p.avatar_path, (c.user_id IS NOT NULL) AS has_pw
         FROM users u LEFT JOIN profiles p ON p.user_id = u.id LEFT JOIN user_credentials c ON c.user_id = u.id WHERE u.id = ?`,
      [uuidToBuf(userId)]
    )) as (ProfileRow & { phone: string; mcp: number | string | boolean; has_pw: number | string | bigint })[];
    const r = rows[0];
    if (!r) throw new AppError('AUTH_TOKEN_INVALID');
    return { id: userId, phone: r.phone, hasPassword: Number(r.has_pw) > 0, mustChangePassword: Number(r.mcp) > 0, profile: this.profileOut(r) };
  }

  async patchProfile(userId: string, p: { firstName?: string; lastName?: string }) {
    const now = this.clock.now();
    const sets: string[] = [];
    const args: unknown[] = [];
    if (p.firstName !== undefined) (sets.push('first_name = ?'), args.push(p.firstName));
    if (p.lastName !== undefined) (sets.push('last_name = ?'), args.push(p.lastName));
    await this.ds.transaction(async (m) => {
      await m.query(`UPDATE profiles SET ${sets.join(', ')}, updated_at = ? WHERE user_id = ?`, [...args, now, uuidToBuf(userId)]);
      await m.query('INSERT INTO outbox_events (id, type, payload, created_at, attempts, next_attempt_at) VALUES (?, ?, ?, ?, 0, ?)', [
        uuidToBuf(uuidv7(now.getTime())),
        'user.profile.updated',
        JSON.stringify({ userId, ...p }),
        now,
        now
      ]);
    });
    return this.profile(userId);
  }

  /**
   * تغییر رمز. حالت عادی: step-up در EndpointGuard تأیید شده است.
   * حالت رمز موقت: `currentPassword` (رمز موقت) با argon2 تطبیق می‌خورد (guard فقط در این حالت step-up را نمی‌خواهد)؛
   * وضعیت پرچم اینجا از DB بازبینی می‌شود (cache ممکن است کهنه باشد). موفقیت ⇒ پرچم=۰ و سایر نشست‌ها revoke؛ نشست جاری می‌ماند.
   */
  async setPassword(userId: string, sessionId: string, p: { newPassword: string; currentPassword?: string }) {
    const uid = uuidToBuf(userId);
    const rows = (await this.ds.query('SELECT u.phone, u.must_change_password AS mcp, c.password_hash AS pw FROM users u LEFT JOIN user_credentials c ON c.user_id = u.id WHERE u.id = ?', [uid])) as {
      phone: string;
      mcp: number | string | boolean;
      pw: string | null;
    }[];
    const u = rows[0];
    if (u && p.newPassword.includes(u.phone)) throw new AppError('VALIDATION_FAILED', { details: { fields: { newPassword: 'رمز نباید شامل شمارهٔ موبایل باشد.' } } });
    if (p.currentPassword !== undefined) {
      if (!u || Number(u.mcp) === 0) throw new AppError('AUTH_STEP_UP_REQUIRED');
      const lim = await this.limiter.hit('durable', `cp:u:${userId}`, 10, 900);
      if (!lim.allowed) throw new AppError('RATE_LIMITED', { details: { retryAfterSec: lim.resetSec } });
      const ok = u.pw ? await this.passwords.verify(u.pw, p.currentPassword) : (await this.passwords.burn(p.currentPassword), false);
      if (!ok) throw new AppError('AUTH_INVALID_CREDENTIALS');
      if (p.newPassword === p.currentPassword) throw new AppError('VALIDATION_FAILED', { details: { fields: { newPassword: 'رمز جدید باید با رمز موقت متفاوت باشد.' } } });
    }
    const hash = await this.passwords.hash(p.newPassword);
    const now = this.clock.now();
    await this.ds.transaction(async (m) => {
      await m.query('INSERT INTO user_credentials (user_id, password_hash, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), updated_at = VALUES(updated_at)', [uid, hash, now]);
      await m.query('UPDATE users SET must_change_password = 0, updated_at = ? WHERE id = ?', [now, uid]);
      await this.sessions.revokeAllInTx(m, userId, now, sessionId);
    });
    this.cache.invalidateUser(userId);
    return {};
  }

  listSessions(userId: string, page: number, pageSize: number, current: string) {
    return this.sessions.list(userId, page, pageSize, current);
  }

  async revokeSession(userId: string, id: string) {
    if (!isUuid(id) || !(await this.sessions.revokeOwned(userId, id))) throw new AppError('NOT_FOUND');
    return {};
  }

  async revokeOthers(userId: string, current: string) {
    await this.sessions.revokeOthers(userId, current);
    return {};
  }

  async inbox(userId: string, page: number, pageSize: number, unreadOnly: boolean) {
    const uid = uuidToBuf(userId);
    const where = unreadOnly ? 'user_id = ? AND read_at IS NULL' : 'user_id = ?';
    const [rows, cnt] = await Promise.all([
      this.ds.query(`SELECT id, kind, title, body, ref, created_at, read_at FROM inbox_messages WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [uid, pageSize, (page - 1) * pageSize]) as Promise<
        { id: Buffer; kind: string; title: string; body: string; ref: string | null; created_at: Date; read_at: Date | null }[]
      >,
      this.ds.query(`SELECT COUNT(*) AS n FROM inbox_messages WHERE ${where}`, [uid]) as Promise<{ n: string | number }[]>
    ]);
    return {
      items: rows.map((r) => ({ id: bufToUuid(r.id), kind: r.kind, title: r.title, body: r.body, createdAt: r.created_at.toISOString(), readAt: r.read_at ? r.read_at.toISOString() : null, ref: r.ref })),
      page,
      pageSize,
      total: Number(cnt[0]?.n ?? 0)
    };
  }

  async unreadCount(userId: string) {
    const r = (await this.ds.query('SELECT COUNT(*) AS n FROM inbox_messages WHERE user_id = ? AND read_at IS NULL', [uuidToBuf(userId)])) as { n: string | number }[];
    return { count: Number(r[0]?.n ?? 0) };
  }

  /** idempotent برای پیام‌های خوانده‌شده؛ پیام دیگران ⇒ NOT_FOUND */
  async markRead(userId: string, id: string) {
    if (!isUuid(id)) throw new AppError('NOT_FOUND');
    const exists = (await this.ds.query('SELECT 1 AS x FROM inbox_messages WHERE id = ? AND user_id = ?', [uuidToBuf(id), uuidToBuf(userId)])) as unknown[];
    if (!exists.length) throw new AppError('NOT_FOUND');
    await this.ds.query('UPDATE inbox_messages SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL', [this.clock.now(), uuidToBuf(id), uuidToBuf(userId)]);
    return {};
  }

  async markAllRead(userId: string) {
    await this.ds.query('UPDATE inbox_messages SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [this.clock.now(), uuidToBuf(userId)]);
    return {};
  }
}
