import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock } from '../common/clock';
import { TEHRAN_OFFSET_MIN, type Interval, fillSeries, resolveRange } from '../common/tehran';
import { LowAdminClient, MidAdminClient } from '../internal/admin-clients';
import { REPORT_ROLE_KEYS } from './rules';

const n = (v: unknown) => Number(v ?? 0);
const MEMO_TTL_MS = 30_000;
const MEMO_MAX = 64;

/**
 * گزارش‌ها (H-80..H-84): کاربران از دایرکتوری/نقش‌های خود high، حساب/OTP/کلاینت از low، جلسه/مشارکت از mid.
 * H-80: خطای یک مبدأ ⇒ همان بخش degraded (null/صفر/خالی)، نه خطای کل. H-82..H-84 پروکسی مستقیم‌اند (خطای مبدأ ⇒ 503 طبق قرارداد).
 */
@Injectable()
export class ReportsService {
  private readonly log = new Logger('Reports');
  private readonly memo = new Map<string, { v: Awaited<ReturnType<ReportsService['computeOverview']>>; exp: number }>();

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly low: LowAdminClient,
    private readonly mid: MidAdminClient
  ) {}

  private async soft<T>(p: Promise<T>, what: string): Promise<T | null> {
    try {
      return await p;
    } catch (e) {
      this.log.warn({ what, code: (e as { code?: string }).code ?? 'unknown' }, 'report section degraded');
      return null;
    }
  }

  async registrations(q: { from?: string; to?: string; interval: Interval }) {
    const range = resolveRange(this.clock.now(), q.from, q.to);
    const rows = (await this.ds.query(
      `SELECT DATE(DATE_ADD(created_at, INTERVAL ${TEHRAN_OFFSET_MIN} MINUTE)) AS d, COUNT(*) AS c FROM user_directory WHERE created_at >= ? AND created_at < ? GROUP BY d`,
      [range.fromUtc, range.toUtcExclusive]
    )) as { d: Date | string; c: string | number }[];
    const perDay = new Map<string, number>();
    for (const r of rows) perDay.set(r.d instanceof Date ? r.d.toISOString().slice(0, 10) : String(r.d).slice(0, 10), n(r.c));
    return { interval: q.interval, items: fillSeries(range, q.interval, perDay) };
  }

  /** H-80: memo درون‌پروسه‌ای ۳۰ ثانیه per بازه (۷ query/فراخوانی مبدأ؛ داشبورد مکرراً تازه می‌شود) */
  async overview(q: { from?: string; to?: string }) {
    const range = resolveRange(this.clock.now(), q.from, q.to);
    const key = `${range.from}|${range.to}`;
    const now = this.clock.now().getTime();
    const hit = this.memo.get(key);
    if (hit && hit.exp > now) return hit.v;
    const v = await this.computeOverview(range);
    if (this.memo.size >= MEMO_MAX) this.memo.clear();
    this.memo.set(key, { v, exp: now + MEMO_TTL_MS });
    return v;
  }

  private async computeOverview(range: ReturnType<typeof resolveRange>) {
    const [dir, roles, reg, lowUsers, otp, clients, mid] = await Promise.all([
      this.ds.query("SELECT COUNT(*) AS total, SUM(status = 'active') AS active, SUM(status = 'disabled') AS disabled, SUM(status = 'deleted') AS deleted FROM user_directory") as Promise<Record<string, string | null>[]>,
      this.ds.query('SELECT role_key, COUNT(DISTINCT user_id) AS c FROM user_system_roles GROUP BY role_key') as Promise<{ role_key: string; c: string | number }[]>,
      this.ds.query('SELECT COUNT(*) AS c FROM user_directory WHERE created_at >= ? AND created_at < ?', [range.fromUtc, range.toUtcExclusive]) as Promise<{ c: string | number }[]>,
      this.soft(this.low.reportUsers({ from: range.from, to: range.to, interval: 'day' }), 'low.users'),
      this.soft(this.low.reportOtp({ from: range.from, to: range.to, interval: 'day' }), 'low.otp'),
      this.soft(this.low.reportClients(), 'low.clients'),
      this.soft(this.mid.reportOverview({ from: range.from, to: range.to }), 'mid.overview')
    ]);
    const d = dir[0] ?? {};
    const total = n(d.total);
    const byRole = { developer: 0, super_admin: 0, none: 0 };
    let withRole = 0;
    for (const r of roles) if ((REPORT_ROLE_KEYS as readonly string[]).includes(r.role_key)) byRole[r.role_key as 'developer' | 'super_admin'] = n(r.c);
    const anyRole = (await this.ds.query('SELECT COUNT(DISTINCT user_id) AS c FROM user_system_roles')) as { c: string | number }[];
    withRole = n(anyRole[0]?.c);
    byRole.none = Math.max(0, total - withRole);

    return {
      range: { from: range.from, to: range.to },
      users: {
        total,
        registered: n(reg[0]?.c),
        byStatus: { active: n(d.active), disabled: n(d.disabled), deleted: n(d.deleted) },
        byRole,
        withPassword: lowUsers ? lowUsers.withPassword : null
      },
      sessions: mid?.sessions ?? { total: 0, created: 0, byStatus: { draft: 0, scheduled: 0, started: 0, ended: 0 } },
      participation: mid?.participation ?? { attendance: 0, evaluations: 0, avgScore: null, pointsAwarded: 0 },
      messaging: otp ? { otpRequested: otp.items.reduce((a, i) => a + i.requested, 0), otpVerified: otp.items.reduce((a, i) => a + i.verified, 0) } : null,
      clients: clients?.items ?? []
    };
  }

  sessions(q: { from?: string; to?: string; interval: Interval }) {
    const r = resolveRange(this.clock.now(), q.from, q.to);
    return this.mid.reportSessions({ from: r.from, to: r.to, interval: q.interval });
  }

  otp(q: { from?: string; to?: string; interval: Interval }) {
    const r = resolveRange(this.clock.now(), q.from, q.to);
    return this.low.reportOtp({ from: r.from, to: r.to, interval: q.interval });
  }

  leaderboard(limit: number) {
    return this.mid.reportLeaderboard(limit);
  }
}
