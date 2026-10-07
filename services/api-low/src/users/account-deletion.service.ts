import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SessionStatusCache } from '../auth/session-status.cache';
import { SessionService } from '../auth/session.service';
import { AppError, conflict } from '../common/app-error';
import { Clock } from '../common/clock';
import { isUuid, uuidToBuf, uuidv7 } from '../common/ids';

export type DeletionSource = 'admin' | 'self';

/**
 * هستهٔ مشترک حذف حساب (ادمین LOW_ADMIN.user DELETE و L-22 خود کاربر):
 * حذف نرم + ناشناس‌سازی (برگشت‌ناپذیر، idempotent) + revoke همهٔ نشست‌ها + رویداد `user.status.changed`.
 * شمارهٔ ناشناس `d` + ۱۰ هگز از شناسه؛ ده نویسهٔ ابتدای UUIDv7 فقط بخش زمان است (کاربران هم‌پنجره ⇒ برخورد) پس در برخورد از قطعهٔ دیگر استفاده می‌شود.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly sessions: SessionService,
    private readonly cache: SessionStatusCache
  ) {}

  /**
   * @param protectSystemRoles دارندهٔ نقش سیستمی (user_claims.system_roles غیرخالی) ⇒ CONFLICT/SYSTEM_PROTECTED (مسیر خود کاربر)
   * @returns true اگر همین فراخوانی حذف کرد؛ false اگر از قبل حذف شده بود
   */
  async softDelete(id: string, source: DeletionSource, protectSystemRoles: boolean): Promise<boolean> {
    if (!isUuid(id)) throw new AppError('NOT_FOUND');
    const now = this.clock.now();
    const uid = uuidToBuf(id);
    const hex = uid.toString('hex');
    const changed = await this.ds.transaction(async (m) => {
      const rows = (await m.query('SELECT u.phone, u.status, c.system_roles FROM users u LEFT JOIN user_claims c ON c.user_id = u.id WHERE u.id = ? FOR UPDATE', [uid])) as {
        phone: string;
        status: string;
        system_roles: string[] | string | null;
      }[];
      const cur = rows[0];
      if (!cur) throw new AppError('NOT_FOUND');
      if (cur.status === 'deleted') return false;
      if (protectSystemRoles) {
        const roles = Array.isArray(cur.system_roles) ? cur.system_roles : typeof cur.system_roles === 'string' ? (JSON.parse(cur.system_roles) as unknown[]) : [];
        if (roles.length > 0) throw conflict('SYSTEM_PROTECTED', 'حساب دارای نقش سیستمی است و از این مسیر حذف نمی‌شود؛ ابتدا نقش‌ها را از پنل مدیریت بردارید.');
      }
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
      await m.query('INSERT INTO outbox_events (id, type, payload, created_at, attempts, next_attempt_at) VALUES (?, ?, ?, ?, 0, ?)', [
        uuidToBuf(uuidv7(now.getTime())),
        'user.status.changed',
        JSON.stringify({ userId: id, status: 'deleted', changedAt: now.toISOString(), anonymizedPhone: anon, source }),
        now,
        now
      ]);
      return true;
    });
    this.cache.invalidateUser(id);
    return changed;
  }
}
