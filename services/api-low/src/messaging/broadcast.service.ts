import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { z } from 'zod';
import { internal } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { ENV, type Env } from '../config/env';
import { lockClause } from '../db/lock-clause';

type BroadcastEvent = z.infer<typeof internal.InboxBroadcastCreated>;
type Segment = BroadcastEvent['segment'];

export const BROADCAST_CHUNK = 2000;
const POLL_MS = 5_000;

interface Row {
  id: Buffer;
  segment: Segment | string;
  title: string;
  body: string;
  ref: string | null;
  status: string;
  cursor_id: Buffer | null;
}

/**
 * پیام همگانی (high ⇒ low، `inbox.broadcast.created`): ذخیره در `inbox_broadcasts` و تحویل دسته‌ای ۲۰۰۰تایی با cursor پایدار روی users.id
 * (keyset). هر دسته یک تراکنش کوتاه: قفل ردیف پیام همگانی ⇒ انتخاب کاربران active ⇒ INSERT IGNORE چندردیفی ⇒ پیشروی cursor.
 * یکتایی UNIQUE(broadcast_id, user_id) ⇒ تکرار/خرابی میانه بی‌اثر و قابل ازسرگیری است.
 */
@Injectable()
export class BroadcastService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Broadcast');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env
  ) {}

  onApplicationBootstrap() {
    if (!this.env.MAINTENANCE_ENABLED || this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.run(), POLL_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  /** داخل تراکنش مصرف رویداد؛ تکرار همان broadcastId بی‌اثر */
  async enqueue(m: EntityManager, p: BroadcastEvent, now: Date): Promise<void> {
    await m.query(
      `INSERT IGNORE INTO inbox_broadcasts (id, segment, title, body, ref, created_by, status, delivered, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)`,
      [uuidToBuf(p.broadcastId), JSON.stringify(p.segment), p.title, p.body, p.ref, uuidToBuf(p.createdBy), now, now]
    );
  }

  /** شروع تحویل بلافاصله پس از دریافت (بیرون از تراکنش؛ در تست غیرفعال تا قطعی بماند) */
  kick(): void {
    if (this.env.NODE_ENV === 'test') return;
    setImmediate(() => void this.run());
  }

  /** پردازش تا `maxChunks` دسته از پیام‌های همگانی باز (تست‌پذیر) */
  async run(maxChunks = 50): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let chunks = 0;
    try {
      while (chunks < maxChunks && (await this.deliverChunk())) chunks++;
    } catch (e) {
      this.log.error({ err: e instanceof Error ? e.message : 'unknown' }, 'broadcast delivery failed');
    } finally {
      this.running = false;
    }
    return chunks;
  }

  /** یک دسته از قدیمی‌ترین پیام همگانی باز؛ false = کاری نمانده */
  async deliverChunk(): Promise<boolean> {
    const lock = await lockClause(this.ds);
    return this.ds.transaction(async (m) => {
      const now = this.clock.now();
      const rows = (await m.query(`SELECT id, segment, title, body, ref, status, cursor_id FROM inbox_broadcasts WHERE status IN ('queued', 'sending') ORDER BY created_at, id LIMIT 1 ${lock}`)) as Row[];
      const b = rows[0];
      if (!b) return false;
      const seg = (typeof b.segment === 'string' ? JSON.parse(b.segment) : b.segment) as Segment;
      const { from, where, args } = this.audience(seg);

      if (b.status === 'queued') {
        const cnt = (await m.query(`SELECT COUNT(*) AS n FROM ${from} WHERE ${where}`, args)) as { n: string | number }[];
        await m.query("UPDATE inbox_broadcasts SET status = 'sending', targeted = ?, updated_at = ? WHERE id = ?", [Number(cnt[0]?.n ?? 0), now, b.id]);
      }

      const users = (await m.query(`SELECT u.id FROM ${from} WHERE ${where}${b.cursor_id ? ' AND u.id > ?' : ''} ORDER BY u.id LIMIT ?`, [...args, ...(b.cursor_id ? [b.cursor_id] : []), BROADCAST_CHUNK])) as { id: Buffer }[];
      let inserted = 0;
      if (users.length) {
        const vals: unknown[] = [];
        for (const u of users) vals.push(uuidToBuf(uuidv7(now.getTime())), u.id, 'announcement', b.title, b.body, b.ref, now, b.id);
        const r = (await m.query(
          `INSERT IGNORE INTO inbox_messages (id, user_id, kind, title, body, ref, created_at, broadcast_id) VALUES ${users.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
          vals
        )) as { affectedRows?: number };
        inserted = r.affectedRows ?? 0;
      }
      const done = users.length < BROADCAST_CHUNK;
      await m.query(
        `UPDATE inbox_broadcasts SET delivered = delivered + ?, cursor_id = ?, status = ?, updated_at = ?, finished_at = ? WHERE id = ?`,
        [inserted, users.length ? users[users.length - 1]!.id : b.cursor_id, done ? 'done' : 'sending', now, done ? now : null, b.id]
      );
      if (done) this.log.log({ broadcastId: bufToUuid(b.id) }, 'broadcast delivered');
      return true;
    });
  }

  /** مخاطبان: همه / فهرست کاربران / نقش سیستمی (user_claims) — همیشه فقط active */
  private audience(seg: Segment): { from: string; where: string; args: unknown[] } {
    if (seg.type === 'all') return { from: 'users u', where: "u.status = 'active'", args: [] };
    if (seg.type === 'users') {
      const ids = seg.userIds.map(uuidToBuf);
      return { from: 'users u', where: `u.status = 'active' AND u.id IN (${ids.map(() => '?').join(',')})`, args: ids };
    }
    return { from: 'users u JOIN user_claims c ON c.user_id = u.id', where: "u.status = 'active' AND JSON_CONTAINS(c.system_roles, JSON_QUOTE(?))", args: [seg.role] };
  }

  /** LOW_ADMIN.broadcast: آمار تحویل */
  async stats(id: string) {
    if (!isUuid(id)) throw new AppError('NOT_FOUND');
    const rows = (await this.ds.query('SELECT status, targeted, delivered FROM inbox_broadcasts WHERE id = ?', [uuidToBuf(id)])) as { status: 'queued' | 'sending' | 'done' | 'failed'; targeted: number | null; delivered: number }[];
    const b = rows[0];
    if (!b) throw new AppError('NOT_FOUND');
    const read = (await this.ds.query('SELECT COUNT(*) AS n FROM inbox_messages WHERE broadcast_id = ? AND read_at IS NOT NULL', [uuidToBuf(id)])) as { n: string | number }[];
    return { status: b.status, targeted: b.targeted === null ? null : Number(b.targeted), delivered: Number(b.delivered), read: Number(read[0]?.n ?? 0) };
  }
}
