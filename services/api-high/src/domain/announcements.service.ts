import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { high } from '@isra/api-types';
import { isImplicitRole } from './rules';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { LowAdminClient, MidAdminClient } from '../internal/admin-clients';
import { AuditService } from './audit.service';
import { type Q, displayName, parseJson } from './db';
import { emit } from './outbox.writer';

type Body = z.infer<typeof high.CreateAnnouncementBody>;
type Audience = z.infer<typeof high.AnnouncementAudience>;
type Announcement = z.infer<typeof high.Announcement>;
type Status = Announcement['status'];

/** سقف اضافهٔ audience=all (docs-v2/30 §۳): ۲ در ساعت per کاربر (durable، دقیق بین instanceها) */
const ALL_LIMIT = 2;
const ALL_WINDOW_SEC = 3600;

interface Row {
  id: Buffer;
  audience: unknown;
  title: string;
  body: string;
  ref: string | null;
  status: Status;
  recipients: number | null;
  created_by: Buffer;
  created_at: Date;
  first_name: string | null;
  last_name: string | null;
}
const COLS = 'a.id, a.audience, a.title, a.body, a.ref, a.status, a.recipients, a.created_by, a.created_at, d.first_name, d.last_name';

/**
 * پیام همگانی درون‌برنامه‌ای (H-41/H-42/H-46؛ فقط اینباکس — بدون پیامک/پوش).
 *  - all/users/role ⇒ رویداد `inbox.broadcast.created` (outbox فقط به low) در همان تراکنش ثبت
 *  - session ⇒ MID_ADMIN.notify (mid رویداد دسته‌ای inbox می‌سازد) **پیش از** تراکنش ثبت؛ شکست ⇒ بدون ردیف/audit
 *  - آمار (H-46) از LOW_ADMIN.broadcast
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly limiter: RateLimitService,
    private readonly low: LowAdminClient,
    private readonly mid: MidAdminClient
  ) {}

  private dto(r: Row, stats?: { status: Status; delivered: number | null; read: number | null; recipients?: number | null }): Announcement {
    return {
      id: bufToUuid(r.id),
      audience: parseJson<Audience>(r.audience),
      title: r.title,
      body: r.body,
      ref: r.ref,
      status: stats?.status ?? r.status,
      recipients: stats?.recipients ?? r.recipients,
      delivered: stats?.delivered ?? null,
      read: stats?.read ?? null,
      createdBy: { id: bufToUuid(r.created_by), name: displayName(r.first_name, r.last_name) },
      createdAt: r.created_at.toISOString()
    };
  }

  /** تعداد گیرندگان فعلی (برآورد زمان ثبت؛ تحویل واقعی را low می‌شمارد) */
  private async recipients(q: Q, a: Audience): Promise<number | null> {
    if (a.type === 'all') return Number(((await q.query("SELECT COUNT(*) AS n FROM user_directory WHERE status = 'active'")) as { n: string }[])[0]?.n ?? 0);
    if (a.type === 'users') {
      const ids = [...new Set(a.userIds.map((u) => u.toLowerCase()))];
      return Number(((await q.query(`SELECT COUNT(*) AS n FROM user_directory WHERE status = 'active' AND user_id IN (${ids.map(() => '?').join(',')})`, ids.map(uuidToBuf))) as { n: string }[])[0]?.n ?? 0);
    }
    if (a.type === 'role') return Number(((await q.query("SELECT COUNT(DISTINCT r.user_id) AS n FROM user_system_roles r JOIN user_directory d ON d.user_id = r.user_id WHERE r.role_key = ? AND d.status = 'active'", [a.role])) as { n: string }[])[0]?.n ?? 0);
    return null;
  }

  async create(actorId: string, body: Body, idempotencyKey?: string): Promise<Announcement> {
    const a = body.audience;
    if (a.type === 'users' && a.userIds.some((u) => !isUuid(u))) throw new AppError('VALIDATION_FAILED', { details: { fields: { 'audience.userIds': 'شناسهٔ کاربر نامعتبر است.' } } });
    if (a.type === 'session' && !isUuid(a.sessionId)) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    if (a.type === 'role') {
      // ۱.۷.۰: نقش ضمنی دارندهٔ صریح ندارد (quran_student = همه ⇒ audience `all`؛ guest = بی‌حساب)
      if (isImplicitRole(a.role)) throw new AppError('VALIDATION_FAILED', { message: 'برای همهٔ کاربران مخاطب «همه» را انتخاب کنید؛ نقش ضمنی مخاطب نمی‌شود.', details: { fields: { 'audience.role': 'نقش ضمنی مجاز نیست.' } } });
      const r = (await this.ds.query('SELECT 1 AS x FROM system_roles WHERE role_key = ?', [a.role])) as unknown[];
      if (!r.length) throw new AppError('NOT_FOUND', { message: 'نقش پیدا نشد.' });
    }
    if (a.type === 'all') {
      const h = await this.limiter.hit('durable', `H-41:all:u:${actorId}`, ALL_LIMIT, ALL_WINDOW_SEC);
      if (!h.allowed) throw new AppError('RATE_LIMITED', { message: 'پیام به همهٔ کاربران حداکثر ۲ بار در ساعت مجاز است.', details: { retryAfterSec: h.resetSec } });
    }
    const now = this.clock.now();
    const id = uuidv7(now.getTime());
    const ref = body.ref ?? null;

    // session ⇒ HTTP پیش از تراکنش (هرگز HTTP داخل تراکنش)
    let sessionRecipients: number | null = null;
    if (a.type === 'session') {
      const r = await this.mid.notify(a.sessionId, { actorId, broadcastId: id, ...(a.roles ? { roles: a.roles } : {}), title: body.title, body: body.body, ref }, idempotencyKey);
      sessionRecipients = r.recipients;
    }

    await this.ds.transaction(async (m) => {
      const recipients = a.type === 'session' ? sessionRecipients : await this.recipients(m, a);
      const status: Status = a.type === 'session' ? 'done' : 'queued';
      await m.query('INSERT INTO announcements (id, audience, title, body, ref, status, recipients, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        uuidToBuf(id),
        JSON.stringify(a),
        body.title,
        body.body,
        ref,
        status,
        recipients,
        uuidToBuf(actorId),
        now
      ]);
      if (a.type !== 'session') {
        const segment = a.type === 'users' ? { type: 'users', userIds: [...new Set(a.userIds.map((u) => u.toLowerCase()))] } : a;
        await emit(m, now, 'inbox.broadcast.created', { broadcastId: id, segment, title: body.title, body: body.body, ref, createdBy: actorId });
      }
      await this.audit.write(m, {
        actor: await this.audit.actorOf(actorId, m),
        action: 'announcement.send',
        target: { type: 'announcement', id, label: body.title },
        summary: `پیام همگانی «${body.title}» ارسال شد.`,
        meta: { audience: a.type === 'users' ? { type: 'users', count: a.userIds.length } : a, recipients }
      });
    });
    return this.get(id, false);
  }

  async list(page: number, pageSize: number) {
    const [rows, cnt] = await Promise.all([
      this.ds.query(`SELECT ${COLS} FROM announcements a LEFT JOIN user_directory d ON d.user_id = a.created_by ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`, [pageSize, (page - 1) * pageSize]) as Promise<Row[]>,
      this.ds.query('SELECT COUNT(*) AS n FROM announcements') as Promise<{ n: string | number }[]>
    ]);
    return { items: rows.map((r) => this.dto(r)), page, pageSize, total: Number(cnt[0]?.n ?? 0) };
  }

  /** H-46: آمار تحویل/خواندن از low (پیام جلسه ⇒ تحویل همان گیرندگان mid)؛ low هنوز دریافت نکرده (404) ⇒ queued */
  async get(id: string, withStats = true): Promise<Announcement> {
    const rows = isUuid(id) ? ((await this.ds.query(`SELECT ${COLS} FROM announcements a LEFT JOIN user_directory d ON d.user_id = a.created_by WHERE a.id = ?`, [uuidToBuf(id)])) as Row[]) : [];
    const r = rows[0];
    if (!r) throw new AppError('NOT_FOUND', { message: 'پیام پیدا نشد.' });
    if (!withStats) return this.dto(r);
    const aud = parseJson<Audience>(r.audience);
    if (aud.type === 'session') return this.dto(r, { status: r.status, delivered: r.recipients, read: null });
    try {
      const s = await this.low.broadcast(bufToUuid(r.id));
      return this.dto(r, { status: s.status, delivered: s.delivered, read: s.read, recipients: s.targeted ?? r.recipients });
    } catch (e) {
      if (e instanceof AppError && e.code === 'NOT_FOUND') return this.dto(r, { status: 'queued', delivered: 0, read: 0 });
      throw e;
    }
  }
}
