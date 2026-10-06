import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { PointsReason as PointsReasonSchema } from '@isra/api-types';
import { Clock } from '../common/clock';
import { bufToUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { BadgesService, type Catalog } from './badges.service';
import { type Q } from './db';
import { type InboxItem, emitInboxBatch } from './outbox.writer';

export type PointsReason = z.infer<typeof PointsReasonSchema>;

export interface LedgerEntry {
  userId: string;
  /** مثبت یا منفی؛ منفی فقط تا کف ۰ کسر می‌شود و مقدار واقعی ثبت می‌شود */
  points: number;
  reason: PointsReason;
  /** ref قطعی؛ یکتایی (user_id, reason, ref_id) ⇒ تکرار بی‌اثر */
  refId: string;
  sessionId?: string | null;
  note?: string | null;
  actorId?: string | null;
}

export interface ApplyResult {
  /** per ورودی: آیا ثبت شد (ref تکراری ⇒ false) */
  applied: boolean[];
  /** per ورودی: مقدار واقعی ثبت‌شده (کسر محدود به کف ۰) */
  actual: number[];
  ledgerIds: (string | null)[];
  /** total جدید per کاربر */
  totals: Map<string, number>;
}

interface LedgerRow {
  id: Buffer;
  points: number;
  reason: PointsReason;
  session_id: Buffer | null;
  title: string | null;
  note: string | null;
  created_at: Date;
}

const ph = (n: number) => Array.from({ length: n }, () => '?').join(', ');

export const ledgerDto = (r: LedgerRow) => ({
  id: bufToUuid(r.id),
  points: Number(r.points),
  reason: r.reason,
  session: r.session_id ? { id: bufToUuid(r.session_id), title: r.title ?? '' } : null,
  note: r.note,
  createdAt: r.created_at.toISOString()
});

/**
 * دفتر امتیاز امضادار (docs-v2/30 §۱.۲): همهٔ تغییرهای امتیاز فقط از `apply` و در تراکنش کسب‌وکار.
 * ترتیب قفل ثابت: user_points (مرتب بر user_id، FOR UPDATE) ⇒ point_ledger ⇒ badge_awards ⇒ outbox.
 */
@Injectable()
export class PointsService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly badges: BadgesService
  ) {}

  /** کاتالوگ نشان (بیرون از تراکنش بگیرید و به apply بدهید) */
  catalog(): Promise<Catalog> {
    return this.badges.catalog();
  }

  /**
   * ثبت چند ردیف دفتر در همان تراکنش: total = max(0, …) زیر قفل ردیف user_points، نشان‌ها فقط با عبور از آستانه،
   * inbox دسته‌ای نشان‌ها (اگر notify) و رویداد outbox `points.changed {userId,total}` per کاربری که total‌اش عوض شد.
   */
  async apply(m: Q, entries: readonly LedgerEntry[], cat: Catalog, notify = true): Promise<ApplyResult> {
    const out: ApplyResult = { applied: [], actual: [], ledgerIds: [], totals: new Map() };
    if (!entries.length) return out;
    const now = this.clock.now();
    const users = [...new Set(entries.map((e) => e.userId))].sort();
    const ubufs = users.map(uuidToBuf);

    await m.query(`INSERT INTO user_points (user_id, total, updated_at) VALUES ${users.map(() => '(?, 0, ?)').join(', ')} ON DUPLICATE KEY UPDATE user_id = user_id`, ubufs.flatMap((u) => [u, now]));
    const locked = (await m.query(`SELECT user_id, total FROM user_points WHERE user_id IN (${ph(users.length)}) ORDER BY user_id FOR UPDATE`, ubufs)) as { user_id: Buffer; total: number }[];
    const before = new Map(locked.map((r) => [bufToUuid(r.user_id), Number(r.total)]));
    const running = new Map(before);

    const refs = [...new Set(entries.map((e) => e.refId))];
    const seen = new Set(
      ((await m.query(`SELECT user_id, reason, ref_id FROM point_ledger WHERE user_id IN (${ph(users.length)}) AND ref_id IN (${ph(refs.length)})`, [...ubufs, ...refs.map(uuidToBuf)])) as { user_id: Buffer; reason: string; ref_id: Buffer }[]).map(
        (r) => `${bufToUuid(r.user_id)}|${r.reason}|${bufToUuid(r.ref_id)}`
      )
    );

    const rows: unknown[] = [];
    for (const e of entries) {
      const k = `${e.userId}|${e.reason}|${e.refId}`;
      if (seen.has(k)) {
        out.applied.push(false);
        out.actual.push(0);
        out.ledgerIds.push(null);
        continue;
      }
      seen.add(k);
      const cur = running.get(e.userId) ?? 0;
      const actual = e.points >= 0 ? e.points : Math.max(e.points, -cur);
      running.set(e.userId, cur + actual);
      const id = uuidv7(now.getTime());
      rows.push(uuidToBuf(id), uuidToBuf(e.userId), actual, e.reason, uuidToBuf(e.refId), e.sessionId ? uuidToBuf(e.sessionId) : null, e.note ? e.note.slice(0, 200) : null, e.actorId ? uuidToBuf(e.actorId) : null, now);
      out.applied.push(true);
      out.actual.push(actual);
      out.ledgerIds.push(id);
    }
    if (rows.length)
      await m.query(`INSERT INTO point_ledger (id, user_id, points, reason, ref_id, session_id, note, actor_id, created_at) VALUES ${Array.from({ length: rows.length / 9 }, () => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`, rows);

    const changed = users.filter((u) => running.get(u) !== before.get(u));
    if (changed.length) {
      await m.query(
        `INSERT INTO user_points (user_id, total, updated_at) VALUES ${changed.map(() => '(?, ?, ?)').join(', ')} ON DUPLICATE KEY UPDATE total = VALUES(total), updated_at = VALUES(updated_at)`,
        changed.flatMap((u) => [uuidToBuf(u), running.get(u)!, now])
      );
      const inbox: InboxItem[] = [];
      for (const u of changed) inbox.push(...(await this.badges.syncUser(m, u, before.get(u) ?? 0, running.get(u)!, cat)));
      if (notify && inbox.length) await emitInboxBatch(m, now, inbox);
      await m.query(
        `INSERT INTO outbox_events (id, type, payload, created_at, attempts, next_attempt_at) VALUES ${changed.map(() => "(?, 'points.changed', ?, ?, 0, ?)").join(', ')}`,
        changed.flatMap((u) => [uuidToBuf(uuidv7(now.getTime())), JSON.stringify({ userId: u, total: running.get(u)! }), now, now])
      );
    }
    for (const u of users) out.totals.set(u, running.get(u) ?? 0);
    return out;
  }

  /** PointsSummary پویا (M-42، low internal، MID_ADMIN) */
  async summary(userId: string, q: Q = this.ds) {
    const cat = await this.badges.catalog();
    const [pts, badges] = await Promise.all([q.query('SELECT total FROM user_points WHERE user_id = ?', [uuidToBuf(userId)]) as Promise<{ total: number }[]>, this.badges.view(q, userId, cat)]);
    return { total: Math.max(0, Number(pts[0]?.total ?? 0)), badges };
  }

  /** دفتر امتیاز یک کاربر (M-46، MID_FOR_LOW.pointsLedger، MID_ADMIN.userPoints)؛ جدیدترین اول */
  async ledger(userId: string, page: number, pageSize: number) {
    const uid = uuidToBuf(userId);
    const [rows, cnt] = await Promise.all([
      this.ds.query(
        `SELECT l.id, l.points, l.reason, l.session_id, s.title, l.note, l.created_at FROM point_ledger l LEFT JOIN sessions s ON s.id = l.session_id
          WHERE l.user_id = ? ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?`,
        [uid, pageSize, (page - 1) * pageSize]
      ) as Promise<LedgerRow[]>,
      this.ds.query('SELECT COUNT(*) AS n FROM point_ledger WHERE user_id = ?', [uid]) as Promise<{ n: string | number }[]>
    ]);
    return { items: rows.map(ledgerDto), page, pageSize, total: Number(cnt[0]?.n ?? 0) };
  }

  async ledgerItem(q: Q, id: string) {
    const rows = (await q.query('SELECT l.id, l.points, l.reason, l.session_id, s.title, l.note, l.created_at FROM point_ledger l LEFT JOIN sessions s ON s.id = l.session_id WHERE l.id = ?', [uuidToBuf(id)])) as LedgerRow[];
    return ledgerDto(rows[0]!);
  }
}
