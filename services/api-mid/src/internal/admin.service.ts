import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { SessionInput as SessionInputSchema, high } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { bufToUuid, isUuid, uuidToBuf } from '../common/ids';
import { type SessionRow } from '../domain/access.service';
import { AttendanceService } from '../domain/attendance.service';
import { NAME_SQL, conflict, displayName, nameSql } from '../domain/db';
import { EvaluationsService } from '../domain/evaluations.service';
import { QueueService } from '../domain/queue.service';
import type { SessionState } from '../domain/rules';
import { SessionsService } from '../domain/sessions.service';

type SessionInput = z.infer<typeof SessionInputSchema>;
type ListQuery = z.infer<typeof high.AdminSessionsQuery> & { page: number; pageSize: number };
export type Interval = 'day' | 'week' | 'month';

/** ایران ثابت UTC+03:30 (بدون DST)؛ همهٔ تاریخ‌های گزارش به‌وقت Asia/Tehran */
const TEHRAN_MS = 3.5 * 3_600_000;
const TEHRAN_MIN = 210;
const DAY = 86_400_000;
const MAX_RANGE_DAYS = 366;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

const num = (v: unknown): number => Number(v ?? 0);
const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (utcMs: number): string => {
  const d = new Date(utcMs);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
/** `YYYY-MM-DD` ⇒ ms (UTC نیمه‌شب همان تاریخ، فقط برای حساب تقویمی)؛ تاریخ غیرواقعی (۳۱ بهمن…) ⇒ null */
function calMs(date: string): number | null {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const ms = Date.UTC(y, m - 1, d);
  return isoDate(ms) === date ? ms : null;
}
const invalid = (message: string) => new AppError('VALIDATION_FAILED', { message });

export interface Range {
  from: string;
  to: string;
  /** شروع بازه (UTC؛ نیمه‌شب تهران روز from) و پایان انحصاری (نیمه‌شب تهران روز بعد از to) */
  start: Date;
  end: Date;
}

/** بازهٔ بسته [from,to] به‌وقت تهران؛ حداکثر ۳۶۶ روز */
export function parseRange(from: string, to: string): Range {
  const f = calMs(from);
  const t = calMs(to);
  if (f === null || t === null) throw invalid('تاریخ نامعتبر است.');
  if (t < f) throw invalid('تاریخ پایان قبل از شروع است.');
  if ((t - f) / DAY + 1 > MAX_RANGE_DAYS) throw invalid('بازه نباید بیش از ۳۶۶ روز باشد.');
  return { from, to, start: new Date(f - TEHRAN_MS), end: new Date(t + DAY - TEHRAN_MS) };
}

/** شروع bucket برای یک تاریخ تهران: day=همان روز؛ week=شنبهٔ همان هفته؛ month=روز اول ماه میلادی */
export function bucketStart(date: string, interval: Interval): string {
  const ms = calMs(date)!;
  if (interval === 'day') return date;
  if (interval === 'month') return `${date.slice(0, 8)}01`;
  const sinceSat = (new Date(ms).getUTCDay() + 1) % 7; // شنبه=۰ … جمعه=۶
  return isoDate(ms - sinceSat * DAY);
}

function nextBucket(bucket: string, interval: Interval): string {
  const ms = calMs(bucket)!;
  if (interval === 'day') return isoDate(ms + DAY);
  if (interval === 'week') return isoDate(ms + 7 * DAY);
  const d = new Date(ms);
  return isoDate(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

/** همهٔ bucketهای بازه (صفرپرشده) از bucket روز from تا bucket روز to */
export function bucketsOf(from: string, to: string, interval: Interval): string[] {
  const out: string[] = [];
  const last = bucketStart(to, interval);
  for (let b = bucketStart(from, interval); b <= last; b = nextBucket(b, interval)) out.push(b);
  return out;
}

/** روز تقویمی تهران برای ستون DATETIME(3) (UTC): افست ثابت ۲۱۰ دقیقه */
const tehranDay = (col: string) => `DATE_FORMAT(DATE_ADD(${col}, INTERVAL ${TEHRAN_MIN} MINUTE), '%Y-%m-%d')`;

interface AdminRow extends SessionRow {
  updated_at: Date;
  deleted_at: Date | null;
  creator_name: string | null;
  c_members: string | number;
  c_pending: string | number;
  c_attendance: string | number;
  c_evaluations: string | number;
  c_managers: string | number;
}

const SORTS: Record<ListQuery['sort'], string> = {
  newest: 's.created_at DESC, s.id DESC',
  oldest: 's.created_at ASC, s.id ASC',
  title: 's.title ASC, s.id ASC',
  nextStart: 's.next_starts_at IS NULL, s.next_starts_at ASC, s.id ASC'
};

const SELECT_ADMIN = `SELECT s.id, s.title, s.description, s.status, s.schedule, s.location_label, s.location_route_url, s.created_by, s.created_at, s.updated_at, s.deleted_at, s.next_starts_at,
        s.join_policy, s.visibility, s.capacity,
        ${nameSql('c')} AS creator_name,
        (SELECT COUNT(*) FROM session_members x WHERE x.session_id = s.id AND x.status = 'approved') AS c_members,
        (SELECT COUNT(*) FROM session_members x JOIN session_member_roles xr ON xr.member_id = x.id AND xr.role = 'session_manager' WHERE x.session_id = s.id AND x.status = 'approved') AS c_managers,
        (SELECT COUNT(*) FROM session_members x WHERE x.session_id = s.id AND x.status = 'pending') AS c_pending,
        (SELECT COUNT(*) FROM attendance_entries x WHERE x.session_id = s.id) AS c_attendance,
        (SELECT COUNT(*) FROM evaluations x WHERE x.session_id = s.id) AS c_evaluations
   FROM sessions s LEFT JOIN user_directory c ON c.user_id = s.created_by`;

/**
 * عملیات ادمین روی داده‌های mid (فقط api-high با `@InternalCallers('high')`؛ مجوزسنجی و audit در high).
 * قواعد دامنه همان قواعد عادی‌اند (فقط‌رو‌به‌جلو، edit فقط draft/scheduled، مدیر قابل‌حذف نیست) ولی بدون نیاز به عضویت.
 * جلسهٔ حذف‌نرم‌شده: خواندن (فهرست با includeDeleted، جزئیات، اعضا/حضور/صف/ارزیابی) مجاز؛ هر تغییری ⇒ 404.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly ds: DataSource,
    private readonly sessions: SessionsService,
    private readonly attendance: AttendanceService,
    private readonly queue: QueueService,
    private readonly evals: EvaluationsService
  ) {}

  // ───────────────────────── جلسه ─────────────────────────
  private dto(r: AdminRow) {
    const base = this.sessions.toDto({ ...r, member_count: r.c_members, id: bufToUuid(r.id as unknown as Buffer), created_by: bufToUuid(r.created_by as unknown as Buffer) });
    return {
      ...base,
      createdBy: { id: bufToUuid(r.created_by as unknown as Buffer), name: r.creator_name || displayName() },
      counts: { members: num(r.c_members), pending: num(r.c_pending), attendance: num(r.c_attendance), evaluations: num(r.c_evaluations), managers: num(r.c_managers) },
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      deletedAt: r.deleted_at ? r.deleted_at.toISOString() : null
    };
  }

  async list(q: ListQuery) {
    const where: string[] = [];
    const args: unknown[] = [];
    if (q.includeDeleted !== 'true') where.push('s.deleted_at IS NULL');
    if (q.q) {
      const like = `%${q.q.replace(/[\\%_]/g, '\\$&')}%`;
      where.push('(s.title LIKE ? OR s.location_label LIKE ?)');
      args.push(like, like);
    }
    if (q.status) {
      where.push('s.status = ?');
      args.push(q.status);
    }
    if (q.creatorId) {
      where.push('s.created_by = ?');
      args.push(uuidToBuf(q.creatorId));
    }
    // from/to: تاریخ تقویمی تهران روی next_starts_at
    if (q.from || q.to) {
      if (q.from && q.to && q.to < q.from) throw invalid('تاریخ پایان قبل از شروع است.');
      if (q.from) {
        where.push('s.next_starts_at >= ?');
        args.push(parseRange(q.from, q.from).start);
      }
      if (q.to) {
        where.push('s.next_starts_at < ?');
        args.push(parseRange(q.to, q.to).end);
      }
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows, cnt] = await Promise.all([
      this.ds.query(`${SELECT_ADMIN} ${w} ORDER BY ${SORTS[q.sort]} LIMIT ? OFFSET ?`, [...args, q.pageSize, (q.page - 1) * q.pageSize]) as Promise<AdminRow[]>,
      this.ds.query(`SELECT COUNT(*) AS n FROM sessions s ${w}`, args) as Promise<{ n: string | number }[]>
    ]);
    return { items: rows.map((r) => this.dto(r)), page: q.page, pageSize: q.pageSize, total: num(cnt[0]?.n) };
  }

  /** جزئیات (جلسهٔ حذف‌شده هم) */
  async one(id: string) {
    if (!isUuid(id)) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    const rows = (await this.ds.query(`${SELECT_ADMIN} WHERE s.id = ?`, [uuidToBuf(id)])) as AdminRow[];
    if (!rows[0]) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    return this.dto(rows[0]);
  }

  /** وجود جلسه (حتی حذف‌شده) برای مسیرهای فقط‌خواندنی */
  private async exists(id: string): Promise<string> {
    if (!isUuid(id)) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    const r = (await this.ds.query('SELECT 1 AS x FROM sessions WHERE id = ?', [uuidToBuf(id)])) as unknown[];
    if (!r.length) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    return id;
  }

  /** ساخت برای creatorId: draft + سازنده session_manager (همان SessionsService.create)؛ سازنده باید در دایرکتوری و فعال باشد */
  async create(creatorId: string, input: SessionInput) {
    const d = ((await this.ds.query('SELECT status, deleted FROM user_directory WHERE user_id = ?', [uuidToBuf(creatorId)])) as { status: string; deleted: number }[])[0];
    if (!d) throw new AppError('NOT_FOUND', { message: 'کاربر سازنده پیدا نشد.' });
    if (d.deleted || d.status !== 'active') throw conflict('USER_NOT_ACTIVE', 'کاربر سازنده فعال نیست.');
    const s = await this.sessions.create(creatorId, input);
    return this.one(s.id);
  }

  async patch(id: string, input: SessionInput) {
    await this.sessions.adminEdit(id, input);
    return this.one(id);
  }

  async transition(id: string, to: Exclude<SessionState, 'draft'>) {
    await this.sessions.adminTransition(id, to);
    return this.one(id);
  }

  async remove(id: string) {
    if (!(await this.sessions.softDelete(id))) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    return this.one(id);
  }

  // ───────────────────────── اعضا / حضور / صف / ارزیابی ─────────────────────────
  async attendanceOf(id: string) {
    return this.attendance.adminList(await this.exists(id));
  }
  /** نمای کامل صف: ادمین استثنای حریم خصوصی D4 است (userId/name همهٔ ردیف‌ها؛ done تا ۵۰ مورد آخر) */
  async queueOf(id: string) {
    return this.queue.state(this.ds, await this.exists(id), NIL_UUID, true);
  }
  async evaluationsOf(id: string) {
    return this.evals.adminList(await this.exists(id));
  }

  // ───────────────────────── کاربر ─────────────────────────
  /** شمارش‌ها بدون جلسه‌های حذف‌شده؛ کاربر بدون فعالیت ⇒ صفر (دادهٔ کاربر در low/high است، نه mid) */
  async userSummary(userId: string) {
    if (!isUuid(userId)) throw new AppError('NOT_FOUND', { message: 'کاربر پیدا نشد.' });
    const u = uuidToBuf(userId);
    const [pts, badges, created, memberships, attended] = await Promise.all([
      this.ds.query('SELECT total FROM user_points WHERE user_id = ?', [u]) as Promise<{ total: number }[]>,
      this.ds.query('SELECT COUNT(*) AS n FROM badge_awards WHERE user_id = ?', [u]) as Promise<{ n: string }[]>,
      this.ds.query('SELECT COUNT(*) AS n FROM sessions WHERE created_by = ? AND deleted_at IS NULL', [u]) as Promise<{ n: string }[]>,
      this.ds.query("SELECT COUNT(*) AS n FROM session_members m JOIN sessions s ON s.id = m.session_id AND s.deleted_at IS NULL WHERE m.user_id = ? AND m.status = 'approved'", [u]) as Promise<{ n: string }[]>,
      this.ds.query('SELECT COUNT(*) AS n FROM attendance_entries a JOIN sessions s ON s.id = a.session_id AND s.deleted_at IS NULL WHERE a.user_id = ?', [u]) as Promise<{ n: string }[]>
    ]);
    return {
      points: { total: num(pts[0]?.total), badges: num(badges[0]?.n) },
      sessions: { created: num(created[0]?.n), memberships: num(memberships[0]?.n), attended: num(attended[0]?.n) }
    };
  }

  // ───────────────────────── گزارش‌ها ─────────────────────────
  /**
   * نمای کلی: شمارش جلسه‌ها (بدون حذف‌شده) per وضعیت؛ `created` = ساخته‌شده در بازه؛ مشارکت در بازه:
   * حضور (entered_at)، ارزیابی (created_at) + میانگین score (یک رقم اعشار؛ null اگر نبود)، و مجموع امتیاز ledger.
   * امتیاز ledger وابسته به حذف جلسه نیست (امتیاز هرگز کم نمی‌شود).
   */
  async overview(r: Range) {
    const [st, created, att, ev, pts] = await Promise.all([
      this.ds.query('SELECT status, COUNT(*) AS n FROM sessions WHERE deleted_at IS NULL GROUP BY status') as Promise<{ status: string; n: string }[]>,
      this.ds.query('SELECT COUNT(*) AS n FROM sessions WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?', [r.start, r.end]) as Promise<{ n: string }[]>,
      this.ds.query('SELECT COUNT(*) AS n FROM attendance_entries a JOIN sessions s ON s.id = a.session_id AND s.deleted_at IS NULL WHERE a.entered_at >= ? AND a.entered_at < ?', [r.start, r.end]) as Promise<{ n: string }[]>,
      this.ds.query('SELECT COUNT(*) AS n, AVG(e.score) AS avg FROM evaluations e JOIN sessions s ON s.id = e.session_id AND s.deleted_at IS NULL WHERE e.created_at >= ? AND e.created_at < ?', [r.start, r.end]) as Promise<{ n: string; avg: string | null }[]>,
      this.ds.query('SELECT COALESCE(SUM(points), 0) AS n FROM point_ledger WHERE created_at >= ? AND created_at < ?', [r.start, r.end]) as Promise<{ n: string }[]>
    ]);
    const byStatus = { draft: 0, scheduled: 0, started: 0, ended: 0 };
    for (const x of st) if (x.status in byStatus) byStatus[x.status as keyof typeof byStatus] = num(x.n);
    const avg = ev[0]?.avg;
    return {
      sessions: { total: byStatus.draft + byStatus.scheduled + byStatus.started + byStatus.ended, created: num(created[0]?.n), byStatus },
      participation: { attendance: num(att[0]?.n), evaluations: num(ev[0]?.n), avgScore: avg === null || avg === undefined ? null : Math.round(Number(avg) * 10) / 10, pointsAwarded: Math.max(0, num(pts[0]?.n)) }
    };
  }

  /**
   * سری زمانی جلسه‌ها (صفرپرشده روی همهٔ bucketهای بازه؛ bucket = تاریخ شروع آن، تهران؛ هفته از شنبه؛ ماه = ماه میلادی):
   *  - created: جلسه‌های ساخته‌شده (created_at) — بدون حذف‌شده
   *  - held: جلسه‌هایی که به started/ended رسیده‌اند و «لحظهٔ آخرین transition» (updated_at) در bucket می‌افتد.
   *    (edit فقط در draft/scheduled ممکن است و transition فقط رو‌به‌جلو ⇒ برای started همان لحظهٔ شروع واقعی است؛
   *    برای ended لحظهٔ پایان؛ هر جلسه فقط یک‌بار شمرده می‌شود). ستون «زمان شروع» جدا در schema نیست.
   *  - attendance: ورودهای حضور (entered_at) — بدون جلسه‌های حذف‌شده
   * رخدادهای بیرون از [from,to] شمرده نمی‌شوند (bucket اول/آخر ممکن است ناقص باشد).
   */
  async sessionsSeries(r: Range, interval: Interval) {
    const grouped = async (sql: string) => {
      const rows = (await this.ds.query(sql, [r.start, r.end])) as { d: string; n: string }[];
      const m = new Map<string, number>();
      for (const x of rows) {
        const b = bucketStart(x.d, interval);
        m.set(b, (m.get(b) ?? 0) + num(x.n));
      }
      return m;
    };
    const [created, held, att] = await Promise.all([
      grouped(`SELECT ${tehranDay('created_at')} AS d, COUNT(*) AS n FROM sessions WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ? GROUP BY d`),
      grouped(`SELECT ${tehranDay('updated_at')} AS d, COUNT(*) AS n FROM sessions WHERE deleted_at IS NULL AND status IN ('started','ended') AND updated_at >= ? AND updated_at < ? GROUP BY d`),
      grouped(`SELECT ${tehranDay('a.entered_at')} AS d, COUNT(*) AS n FROM attendance_entries a JOIN sessions s ON s.id = a.session_id AND s.deleted_at IS NULL WHERE a.entered_at >= ? AND a.entered_at < ? GROUP BY d`)
    ]);
    return { interval, items: bucketsOf(r.from, r.to, interval).map((bucket) => ({ bucket, created: created.get(bucket) ?? 0, held: held.get(bucket) ?? 0, attendance: att.get(bucket) ?? 0 })) };
  }

  /** برترین‌ها: user_points (کل امتیاز) + شمار نشان؛ هم‌امتیاز ⇒ زودتر رسیده اول. کاربر حذف‌شده «کاربر حذف‌شده» */
  async leaderboard(limit: number) {
    const rows = (await this.ds.query(
      `SELECT p.user_id, p.total, ${NAME_SQL} AS name, (SELECT COUNT(*) FROM badge_awards b WHERE b.user_id = p.user_id) AS badges
         FROM user_points p LEFT JOIN user_directory d ON d.user_id = p.user_id
        WHERE p.total > 0 ORDER BY p.total DESC, p.updated_at ASC, p.user_id ASC LIMIT ?`,
      [limit]
    )) as { user_id: Buffer; total: number; name: string; badges: string }[];
    return { items: rows.map((r) => ({ userId: bufToUuid(r.user_id), name: r.name || displayName(), points: num(r.total), badges: num(r.badges) })) };
  }
}
