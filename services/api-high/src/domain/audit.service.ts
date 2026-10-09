import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { high } from '@isra/api-types';
import { Clock } from '../common/clock';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { parseDay, startOfDayUtc } from '../common/tehran';
import { type Q, displayName, parseJson } from './db';

/** از قرارداد (۱.۷.۰: + criterion، supporter، gallery، comment) */
export type AuditTargetType = z.infer<typeof high.AuditTargetType>;

export interface AuditFilters {
  /** نوع دقیق اقدام؛ اگر به `.` ختم شود پیشوند است (مثلاً `user.`) */
  action?: string;
  q?: string;
  actorId?: string;
  targetType?: AuditTargetType;
  targetId?: string;
  /** تاریخ تقویمی تهران (شامل) */
  from?: string;
  to?: string;
}

export interface AuditInput {
  actor: { id: string; name: string } | null;
  action: string;
  target?: { type: AuditTargetType; id: string; label: string };
  summary: string;
  meta?: Record<string, unknown>;
}

interface Row {
  id: Buffer;
  at: Date;
  actor_id: Buffer | null;
  actor_name: string;
  action: string;
  target_type: AuditTargetType | null;
  target_id: string | null;
  target_label: string | null;
  summary: string;
  meta: unknown;
}

export type AuditRow = Row;
export const AUDIT_COLS = 'id, at, actor_id, actor_name, action, target_type, target_id, target_label, summary, meta';

export const auditDto = (r: Row) => ({
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

  /** همهٔ فیلترها پارامتری‌اند (هیچ مقدار کاربری در متن SQL نیست) */
  async list(page: number, pageSize: number, f: AuditFilters = {}) {
    const { where: w, args } = auditWhere(f);
    const [rows, cnt] = await Promise.all([
      this.ds.query(`SELECT ${AUDIT_COLS} FROM audit_logs ${w} ORDER BY at DESC, id DESC LIMIT ? OFFSET ?`, [...args, pageSize, (page - 1) * pageSize]) as Promise<Row[]>,
      this.ds.query(`SELECT COUNT(*) AS n FROM audit_logs ${w}`, args) as Promise<{ n: string | number }[]>
    ]);
    return { items: rows.map(auditDto), page, pageSize, total: Number(cnt[0]?.n ?? 0) };
  }

  async last(n: number) {
    const rows = (await this.ds.query('SELECT id, at, actor_id, actor_name, action, target_type, target_id, target_label, summary, meta FROM audit_logs ORDER BY at DESC, id DESC LIMIT ?', [n])) as Row[];
    return rows.map(auditDto);
  }
}

/** WHERE پارامتری فیلترهای audit (مشترک H-40 و خروجی H-45) */
export function auditWhere(f: AuditFilters): { where: string; args: unknown[]; clauses: string[] } {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.action) {
    if (f.action.endsWith('.')) (where.push('action LIKE ?'), args.push(`${escapeLike(f.action)}%`));
    else (where.push('action = ?'), args.push(f.action));
  }
  if (f.actorId) {
    // actorId نامعتبر (غیر UUID) ⇒ هیچ نتیجه‌ای (نه خطا)
    if (!isUuid(f.actorId)) where.push('1 = 0');
    else (where.push('actor_id = ?'), args.push(uuidToBuf(f.actorId)));
  }
  if (f.targetType) (where.push('target_type = ?'), args.push(f.targetType));
  if (f.targetId) (where.push('target_id = ?'), args.push(f.targetId));
  const from = f.from ? parseDay(f.from) : null;
  const to = f.to ? parseDay(f.to) : null;
  if (from !== null) (where.push('at >= ?'), args.push(startOfDayUtc(from)));
  if (to !== null) (where.push('at < ?'), args.push(startOfDayUtc(to + 86_400_000)));
  if (f.q) {
    where.push('(summary LIKE ? OR actor_name LIKE ? OR target_label LIKE ?)');
    const like = `%${escapeLike(f.q)}%`;
    args.push(like, like, like);
  }
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', args, clauses: where };
}
