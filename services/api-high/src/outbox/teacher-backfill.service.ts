import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, isUuid, uuidToBuf } from '../common/ids';
import { ENV, type Env } from '../config/env';
import { TEACHER_BACKFILL_JOB } from '../db/migrations/1728700000000-TiersTeacherContent';
import { AuditService } from '../domain/audit.service';
import { ClaimsService } from '../domain/claims.service';
import { RbacService } from '../domain/rbac.service';
import { TEACHER } from '../domain/rules';
import { MidAdminClient } from '../internal/admin-clients';

const PAGE_SIZE = 100;
/** سقف صفحه در یک اجرا (۲۰٬۰۰۰ صاحب جلسه)؛ ادامه در اجرای بعد از همان cursor */
const MAX_PAGES_PER_RUN = 200;
const LEASE_MS = 5 * 60_000;
const RETRY_MS = 60_000;

interface JobRow {
  status: string;
  cursor_page: number;
  meta: unknown;
}
export interface BackfillResult {
  status: 'done' | 'pending' | 'busy' | 'skipped';
  granted: number;
  alreadyTeacher: number;
  unknown: number;
  inactive: number;
}

/**
 * job یک‌بارهٔ ۱.۷.۰ (docs-v2/31 §۷): به سازندگان/صاحبان فعلی جلسه نقش `teacher` داده می‌شود (فهرست از MID_ADMIN.sessionOwners).
 * HTTP بیرون از migration و بیرون از تراکنش؛ idempotent (INSERT IGNORE + cursor صفحه + وضعیت done) و امن برای چند instance
 * (claim با lease روی ردیف system_jobs). mid در دسترس نباشد ⇒ بعداً دوباره (هر دقیقه) از همان صفحه.
 * کاربر ناشناخته در دایرکتوری high یا حذف‌شده نادیده گرفته می‌شود (شمارش در audit)؛ claim دارندگان تازه منتشر می‌شود.
 */
@Injectable()
export class TeacherBackfillService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('TeacherBackfill');
  private timer?: NodeJS.Timeout;
  private finished = false;

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly mid: MidAdminClient,
    private readonly rbac: RbacService,
    private readonly claims: ClaimsService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env
  ) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test' || !this.env.MAINTENANCE_ENABLED) return;
    const tick = () =>
      void this.run()
        .then((r) => {
          if (r.status === 'done' || r.status === 'skipped') this.stop();
        })
        .catch((e: unknown) => this.log.warn({ err: e instanceof Error ? e.message : 'unknown' }, 'teacher backfill failed'));
    this.timer = setInterval(tick, RETRY_MS);
    this.timer.unref();
    setTimeout(tick, 5_000).unref();
  }

  onApplicationShutdown() {
    this.stop();
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.finished = true;
  }

  /** یک اجرا (تست‌پذیر)؛ خطای mid ⇒ status=pending و cursor حفظ می‌شود */
  async run(): Promise<BackfillResult> {
    const out: BackfillResult = { status: 'pending', granted: 0, alreadyTeacher: 0, unknown: 0, inactive: 0 };
    if (this.finished) return { ...out, status: 'skipped' };
    const now = this.clock.now();
    const claim = (await this.ds.query(
      "UPDATE system_jobs SET status = 'running', lease_until = ?, attempts = attempts + 1, updated_at = ? WHERE job_key = ? AND (status = 'pending' OR (status = 'running' AND lease_until < ?))",
      [new Date(now.getTime() + LEASE_MS), now, TEACHER_BACKFILL_JOB, now]
    )) as { affectedRows?: number };
    if (!claim.affectedRows) {
      const r = (await this.ds.query('SELECT status FROM system_jobs WHERE job_key = ?', [TEACHER_BACKFILL_JOB])) as { status: string }[];
      return { ...out, status: !r[0] || r[0].status === 'done' ? 'skipped' : 'busy' };
    }
    const job = ((await this.ds.query('SELECT status, cursor_page, meta FROM system_jobs WHERE job_key = ?', [TEACHER_BACKFILL_JOB])) as JobRow[])[0]!;
    const prev = (typeof job.meta === 'string' ? JSON.parse(job.meta) : (job.meta ?? {})) as Partial<BackfillResult>;
    for (const k of ['granted', 'alreadyTeacher', 'unknown', 'inactive'] as const) out[k] = Number(prev[k] ?? 0);
    let page = Math.max(1, job.cursor_page);
    try {
      for (let i = 0; i < MAX_PAGES_PER_RUN; i++) {
        const r = await this.mid.sessionOwners(page, PAGE_SIZE);
        await this.grant(r.items.map((x) => x.userId).filter(isUuid), out);
        page++;
        await this.ds.query('UPDATE system_jobs SET cursor_page = ?, meta = ?, lease_until = ?, updated_at = ? WHERE job_key = ?', [page, JSON.stringify(out), new Date(this.clock.now().getTime() + LEASE_MS), this.clock.now(), TEACHER_BACKFILL_JOB]);
        if (r.items.length < PAGE_SIZE || (page - 1) * PAGE_SIZE >= r.total) {
          await this.finish(out);
          return { ...out, status: 'done' };
        }
      }
    } catch (e) {
      this.log.warn({ page, code: e instanceof AppError ? e.code : 'unknown' }, 'teacher backfill paused');
    }
    await this.ds.query("UPDATE system_jobs SET status = 'pending', lease_until = NULL, meta = ?, updated_at = ? WHERE job_key = ?", [JSON.stringify(out), this.clock.now(), TEACHER_BACKFILL_JOB]);
    return out;
  }

  /** یک صفحه در یک تراکنش RBAC: فقط کاربران موجود و حذف‌نشدهٔ دایرکتوری؛ claim دارندگان تازه */
  private async grant(userIds: string[], out: BackfillResult): Promise<void> {
    if (!userIds.length) return;
    const ids = [...new Set(userIds.map((u) => u.toLowerCase()))];
    await this.rbac.write(async (m) => {
      const ph = ids.map(() => '?').join(',');
      const dir = (await m.query(`SELECT user_id, status FROM user_directory WHERE user_id IN (${ph})`, ids.map(uuidToBuf))) as { user_id: Buffer; status: string }[];
      const have = (await m.query(`SELECT user_id FROM user_system_roles WHERE role_key = ? AND user_id IN (${ph}) FOR UPDATE`, [TEACHER, ...ids.map(uuidToBuf)])) as { user_id: Buffer }[];
      const already = new Set(have.map((h) => bufToUuid(h.user_id)));
      const status = new Map(dir.map((d) => [bufToUuid(d.user_id), d.status]));
      const fresh: string[] = [];
      const now = this.clock.now();
      for (const id of ids) {
        const st = status.get(id);
        if (!st) out.unknown++;
        else if (st === 'deleted') out.inactive++;
        else if (already.has(id)) out.alreadyTeacher++;
        else fresh.push(id);
      }
      if (!fresh.length) return;
      await m.query(`INSERT IGNORE INTO user_system_roles (user_id, role_key, granted_by, granted_at) VALUES ${fresh.map(() => '(?, ?, NULL, ?)').join(',')}`, fresh.flatMap((id) => [uuidToBuf(id), TEACHER, now]));
      await this.claims.publishMany(m, fresh);
      await this.rbac.bump(m);
      out.granted += fresh.length;
    });
  }

  private async finish(out: BackfillResult): Promise<void> {
    const now = this.clock.now();
    await this.ds.transaction(async (m) => {
      await m.query("UPDATE system_jobs SET status = 'done', done_at = ?, lease_until = NULL, meta = ?, updated_at = ? WHERE job_key = ?", [now, JSON.stringify(out), now, TEACHER_BACKFILL_JOB]);
      await this.audit.write(m, {
        actor: null,
        action: 'system.teacher_backfill',
        target: { type: 'role', id: TEACHER, label: 'استاد' },
        summary: `نقش استاد به ${out.granted} سازندهٔ جلسه داده شد (مهاجرت ۱.۷.۰).`,
        meta: { ...out }
      });
    });
    this.log.log({ ...out }, 'teacher backfill done');
  }
}
