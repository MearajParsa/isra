import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock } from '../common/clock';
import { uuidToBuf } from '../common/ids';

const TTL_MS = 5_000;
const MAX = 20_000;

/**
 * نشست‌های revoke‌شده در low (رویداد `session.revoked` از طریق inbox) تا انقضای access توکن‌هایشان.
 * `isRevoked` با cache کوتاه (۵ ثانیه) ⇒ پنجرهٔ پذیرش توکن باطل‌شده ≤ چند ثانیه (نه تا ۲۰ دقیقه).
 */
@Injectable()
export class RevocationService {
  private readonly m = new Map<string, { revoked: boolean; exp: number }>();

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock
  ) {}

  async isRevoked(sessionId: string): Promise<boolean> {
    const now = this.clock.now().getTime();
    const hit = this.m.get(sessionId);
    if (hit && hit.exp > now) return hit.revoked;
    const rows = (await this.ds.query('SELECT 1 AS x FROM revoked_sessions WHERE session_id = ? AND expires_at > ? LIMIT 1', [uuidToBuf(sessionId), this.clock.now()])) as unknown[];
    const revoked = rows.length > 0;
    if (this.m.size >= MAX) this.m.clear();
    this.m.set(sessionId, { revoked, exp: now + TTL_MS });
    return revoked;
  }

  /** ثبت دسته‌ای (داخل تراکنش inbox)؛ cache محلی همان لحظه به‌روز می‌شود */
  async add(q: { query: (sql: string, args?: unknown[]) => Promise<unknown> }, ids: string[], expiresAt: Date): Promise<void> {
    for (const id of ids) {
      await q.query('INSERT INTO revoked_sessions (session_id, expires_at) VALUES (?, ?) ON DUPLICATE KEY UPDATE expires_at = GREATEST(expires_at, VALUES(expires_at))', [uuidToBuf(id), expiresAt]);
      this.m.set(id, { revoked: true, exp: this.clock.now().getTime() + TTL_MS });
    }
  }

  async purgeExpired(): Promise<number> {
    return ((await this.ds.query('DELETE FROM revoked_sessions WHERE expires_at < ? LIMIT 5000', [this.clock.now()])) as { affectedRows?: number }).affectedRows ?? 0;
  }
}
