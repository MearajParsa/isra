import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock } from '../common/clock';
import { uuidToBuf, bufToUuid } from '../common/ids';

export interface SessionStatus {
  userId: string;
  revoked: boolean;
  otpAt: Date | null;
  permVer: number;
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
    if (hit && hit.exp > now) return hit.v;
    const rows = (await this.ds.query('SELECT user_id, revoked_at, otp_at, perm_ver FROM auth_sessions WHERE id = ?', [uuidToBuf(sessionId)])) as {
      user_id: Buffer;
      revoked_at: Date | null;
      otp_at: Date | null;
      perm_ver: number;
    }[];
    const r = rows[0];
    const v: SessionStatus | null = r ? { userId: bufToUuid(r.user_id), revoked: r.revoked_at !== null, otpAt: r.otp_at, permVer: r.perm_ver } : null;
    if (this.m.size >= MAX) this.m.clear();
    this.m.set(sessionId, { v, exp: now + TTL_MS });
    return v;
  }

  invalidate(...sessionIds: string[]) {
    for (const id of sessionIds) this.m.delete(id);
  }

  invalidateAll() {
    this.m.clear();
  }
}
