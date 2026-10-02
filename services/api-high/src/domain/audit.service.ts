import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock } from '../common/clock';
import { bufToUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { type Q, displayName, parseJson } from './db';

export interface AuditInput {
  actor: { id: string; name: string } | null;
  action: string;
  target?: { type: 'user' | 'role' | 'settings'; id: string; label: string };
  summary: string;
  meta?: Record<string, unknown>;
}

interface Row {
  id: Buffer;
  at: Date;
  actor_id: Buffer | null;
  actor_name: string;
  action: string;
  target_type: 'user' | 'role' | 'settings' | null;
  target_id: string | null;
  target_label: string | null;
  summary: string;
  meta: unknown;
}

const dto = (r: Row) => ({
  id: bufToUuid(r.id),
  at: r.at.toISOString(),
  actor: { id: r.actor_id ? bufToUuid(r.actor_id) : 'system', name: r.actor_name },
  action: r.action,
  ...(r.target_type && r.target_id ? { target: { type: r.target_type, id: r.target_id, label: r.target_label ?? '' } } : {}),
  summary: r.summary,
  meta: parseJson<Record<string, unknown>>(r.meta) ?? {}
});

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** گزارش اقدام‌ها: فقط‌الحاق (append-only)؛ در همان تراکنش تغییر نوشته می‌شود. meta بدون PII حساس (OTP/توکن/رمز هرگز) */
@Injectable()
export class AuditService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock
  ) {}

  async write(q: Q, a: AuditInput): Promise<void> {
    const now = this.clock.now();
    await q.query('INSERT INTO audit_logs (id, at, actor_id, actor_name, action, target_type, target_id, target_label, summary, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      uuidToBuf(uuidv7(now.getTime())),
      now,
      a.actor ? uuidToBuf(a.actor.id) : null,
      a.actor?.name ?? 'سیستم',
      a.action,
      a.target?.type ?? null,
      a.target?.id.slice(0, 64) ?? null,
      a.target?.label.slice(0, 120) ?? null,
      a.summary.slice(0, 300),
      JSON.stringify(a.meta ?? {})
    ]);
  }

  async actorOf(userId: string, q: Q = this.ds): Promise<{ id: string; name: string }> {
    const r = (await q.query('SELECT first_name, last_name FROM user_directory WHERE user_id = ?', [uuidToBuf(userId)])) as { first_name: string; last_name: string }[];
    return { id: userId, name: displayName(r[0]?.first_name, r[0]?.last_name) };
  }

  async list(page: number, pageSize: number, action?: string, text?: string) {
    const where: string[] = [];
    const args: unknown[] = [];
    if (action) (where.push('action = ?'), args.push(action));
    if (text) {
      where.push('(summary LIKE ? OR actor_name LIKE ? OR target_label LIKE ?)');
      const like = `%${escapeLike(text)}%`;
      args.push(like, like, like);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows, cnt] = await Promise.all([
      this.ds.query(`SELECT id, at, actor_id, actor_name, action, target_type, target_id, target_label, summary, meta FROM audit_logs ${w} ORDER BY at DESC, id DESC LIMIT ? OFFSET ?`, [...args, pageSize, (page - 1) * pageSize]) as Promise<Row[]>,
      this.ds.query(`SELECT COUNT(*) AS n FROM audit_logs ${w}`, args) as Promise<{ n: string | number }[]>
    ]);
    return { items: rows.map(dto), page, pageSize, total: Number(cnt[0]?.n ?? 0) };
  }

  async last(n: number) {
    const rows = (await this.ds.query('SELECT id, at, actor_id, actor_name, action, target_type, target_id, target_label, summary, meta FROM audit_logs ORDER BY at DESC, id DESC LIMIT ?', [n])) as Row[];
    return rows.map(dto);
  }
}
