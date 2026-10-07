import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock } from '../common/clock';
import { uuidToBuf, bufToUuid } from '../common/ids';

export interface SessionStatus {
  userId: string;
  revoked: boolean;
  otpAt: Date | null;
  permVer: number;
  /** وضعیت حساب کاربر (active | disabled | deleted) — غیرفعال ⇒ رد در EndpointGuard */
  userStatus: string;
  /** رمز موقت مدیر: تا تغییر رمز فقط مسیرهای تغییر رمز/خروج مجازند */
  mustChange: boolean;
}

const TTL_MS = 5_000;
const MAX = 50_000;

/**
 * وضعیت نشست برای هر درخواست bearer (جلوگیری از DB hit در هر call).
 * revoke در همین instance فوری اعمال می‌شود؛ در instanceهای دیگر تا ۵ ثانیه تأخیر (پذیرفته‌شده؛ access فقط ۱۵ دقیقه عمر دارد).
 */
@Injectable()
export class SessionStatusCache {
  private readonly m = new Map<string, { v: SessionStatus | null; exp: number }>();

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock
  ) {}

  async get(sessionId: string): Promise<SessionStatus | null> {
    const now = this.clock.now().getTime();
    const hit = this.m.get(sessionId);
    if (hit && hit.exp > now) {
      // LRU: دسترسی تازه ⇒ انتهای Map (قدیمی‌ترین‌ها از ابتدا حذف می‌شوند)
      this.m.delete(sessionId);
      this.m.set(sessionId, hit);
      return hit.v;
    }
    const rows = (await this.ds.query(
      `SELECT s.user_id, s.revoked_at, s.otp_at, s.perm_ver, u.status, u.must_change_password
         FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
      [uuidToBuf(sessionId)]
    )) as {
      user_id: Buffer;
      revoked_at: Date | null;
      otp_at: Date | null;
      perm_ver: number;
      status: string;
      must_change_password: number | string | boolean;
    }[];
    const r = rows[0];
    const v: SessionStatus | null = r
      ? { userId: bufToUuid(r.user_id), revoked: r.revoked_at !== null, otpAt: r.otp_at, permVer: r.perm_ver, userStatus: r.status, mustChange: Number(r.must_change_password) > 0 }
      : null;
    this.m.delete(sessionId);
    this.m.set(sessionId, { v, exp: now + TTL_MS });
    // LRU به‌جای پاک‌کردن کل cache (جلوگیری از هجوم هم‌زمان به DB)
    while (this.m.size > MAX) {
      const oldest = this.m.keys().next().value;
      if (oldest === undefined) break;
      this.m.delete(oldest);
    }
    return v;
  }

  invalidate(...sessionIds: string[]) {
    for (const id of sessionIds) this.m.delete(id);
  }

  /** تغییر وضعیت/رمز موقت توسط ادمین: همهٔ نشست‌های کاربر فوراً (در همین instance) از DB بازخوانی شوند */
  invalidateUser(userId: string) {
    for (const [k, e] of this.m) if (e.v?.userId === userId) this.m.delete(k);
  }

  invalidateAll() {
    this.m.clear();
  }
}
