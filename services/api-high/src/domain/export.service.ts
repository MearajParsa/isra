import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { high } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid } from '../common/ids';
import { dayStr, todayTehran } from '../common/tehran';
import { MidAdminClient } from '../internal/admin-clients';
import { forbidden } from './access/write-helpers';
import { AUDIT_COLS, type AuditFilters, type AuditRow, AuditService, auditDto, auditWhere } from './audit.service';
import { SessionsAdminService } from './sessions-admin.service';
import { UsersService } from './users.service';

export const MAX_USERS_ROWS = 50_000;
export const MAX_AUDIT_ROWS = 100_000;
export const MAX_SESSION_ROWS = 20_000;
const BATCH = 1_000;
const MID_PAGE = 100;

/** خنثی‌سازی تزریق فرمول (CSV injection): سلولی که با = + - @ tab CR شروع شود ⇒ پیشوند «'» */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const csvRow = (cells: readonly unknown[]): string => `${cells.map(csvCell).join(',')}\r\n`;

interface Actor {
  id: string;
  perms: readonly string[];
}

/** نوشتن stream با رعایت backpressure */
class CsvStream {
  rows = 0;
  private started = false;
  constructor(
    private readonly res: Response,
    private readonly filename: string
  ) {}

  private start() {
    if (this.started) return;
    this.started = true;
    this.res.status(200);
    this.res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    this.res.setHeader('Content-Disposition', `attachment; filename="${this.filename}"`);
    this.res.setHeader('Cache-Control', 'no-store');
    this.res.setHeader('X-Content-Type-Options', 'nosniff');
    this.res.write('﻿'); // BOM ⇒ Excel فارسی را درست باز کند
  }

  async header(cells: readonly string[]) {
    this.start();
    await this.write(csvRow(cells));
  }

  async row(cells: readonly unknown[]) {
    this.rows++;
    await this.write(csvRow(cells));
  }

  private write(chunk: string): Promise<void> {
    if (this.res.write(chunk)) return Promise.resolve();
    return new Promise((r) => {
      const done = () => (this.res.off('drain', done), this.res.off('close', done), r());
      this.res.once('drain', done);
      this.res.once('close', done);
    });
  }

  get closed(): boolean {
    return this.res.destroyed || this.res.writableEnded;
  }

  end() {
    this.res.end();
  }
}

/**
 * خروجی CSV سمت سرور (H-43..H-45): stream با keyset (بدون OFFSET روی جدول‌های بزرگ)، BOM UTF-8، خنثی‌سازی فرمول،
 * سقف ردیف، مجوز دوم (view منبع) در سرویس، audit `export.*` با فیلترها و تعداد ردیف (شماره هرگز در audit نیست).
 */
@Injectable()
export class ExportService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly sessions: SessionsAdminService,
    private readonly mid: MidAdminClient
  ) {}

  private need(actor: Actor, perm: string) {
    if (!actor.perms.includes(perm)) throw forbidden(`این خروجی به «${perm}» هم نیاز دارد.`, { missing: [perm] });
  }

  private stamp(): string {
    return dayStr(todayTehran(this.clock.now())).replace(/-/g, '');
  }

  private async logExport(actorId: string, action: string, summary: string, meta: Record<string, unknown>, target?: { type: 'session'; id: string; label: string }) {
    await this.audit.write(this.ds, { actor: await this.audit.actorOf(actorId), action, ...(target ? { target } : {}), summary, meta });
  }

  /** H-43 کاربران با فیلترهای H-20؛ keyset روی (created_at, user_id) (sort=name ⇒ جدیدترین؛ مرتب‌سازی نام keyset‌پذیر نیست) */
  async users_(actor: Actor, q: z.infer<typeof high.UsersQuery>, res: Response): Promise<void> {
    this.need(actor, 'system.users.view');
    const { clauses, args } = this.users.filterWhere(q);
    const asc = q.sort === 'oldest';
    const out = new CsvStream(res, `users-${this.stamp()}.csv`);
    await out.header(['id', 'firstName', 'lastName', 'phone', 'status', 'roles', 'grants', 'createdAt']);
    let cursor: { at: Date; id: Buffer } | null = null;
    while (out.rows < MAX_USERS_ROWS && !out.closed) {
      const where = [...clauses];
      const a = [...args];
      if (cursor) (where.push(asc ? '(d.created_at > ? OR (d.created_at = ? AND d.user_id > ?))' : '(d.created_at < ? OR (d.created_at = ? AND d.user_id < ?))'), a.push(cursor.at, cursor.at, cursor.id));
      const dir = asc ? 'ASC' : 'DESC';
      const rows = (await this.ds.query(`SELECT d.user_id, d.phone, d.first_name, d.last_name, d.status, d.created_at FROM user_directory d ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY d.created_at ${dir}, d.user_id ${dir} LIMIT ?`, [
        ...a,
        Math.min(BATCH, MAX_USERS_ROWS - out.rows)
      ])) as { user_id: Buffer; phone: string; first_name: string; last_name: string; status: string; created_at: Date }[];
      if (!rows.length) break;
      const { roles, grants } = await this.users.rolesAndGrants(rows.map((r) => r.user_id));
      for (const r of rows) {
        const h = r.user_id.toString('hex');
        await out.row([bufToUuid(r.user_id), r.first_name, r.last_name, r.phone, r.status, (roles.get(h) ?? []).join(' '), (grants.get(h) ?? []).join(' '), r.created_at.toISOString()]);
      }
      const last = rows[rows.length - 1]!;
      cursor = { at: last.created_at, id: last.user_id };
      if (rows.length < BATCH) break;
    }
    out.end();
    const { q: search, ...rest } = q;
    await this.logExport(actor.id, 'export.users', `خروجی کاربران (${out.rows} ردیف) گرفته شد.`, { filters: { ...rest, ...(search ? { q: /^\d+$/.test(search) ? '[digits]' : search } : {}) }, rows: out.rows, capped: out.rows >= MAX_USERS_ROWS });
  }

  /** H-45 audit با فیلترهای H-40؛ keyset روی (at, id) نزولی */
  async audit_(actor: Actor, f: AuditFilters, res: Response): Promise<void> {
    this.need(actor, 'system.audit.view');
    const { clauses, args } = auditWhere(f);
    const out = new CsvStream(res, `audit-${this.stamp()}.csv`);
    await out.header(['id', 'at', 'actorId', 'actorName', 'action', 'targetType', 'targetId', 'targetLabel', 'summary', 'meta']);
    let cursor: { at: Date; id: Buffer } | null = null;
    while (out.rows < MAX_AUDIT_ROWS && !out.closed) {
      const where = [...clauses];
      const a = [...args];
      if (cursor) (where.push('(at < ? OR (at = ? AND id < ?))'), a.push(cursor.at, cursor.at, cursor.id));
      const rows = (await this.ds.query(`SELECT ${AUDIT_COLS} FROM audit_logs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY at DESC, id DESC LIMIT ?`, [...a, Math.min(BATCH, MAX_AUDIT_ROWS - out.rows)])) as AuditRow[];
      if (!rows.length) break;
      for (const r of rows) {
        const d = auditDto(r);
        await out.row([d.id, d.at, d.actor.id, d.actor.name, d.action, d.target?.type ?? '', d.target?.id ?? '', d.target?.label ?? '', d.summary, d.meta]);
      }
      const last = rows[rows.length - 1]!;
      cursor = { at: last.at, id: last.id };
      if (rows.length < BATCH) break;
    }
    out.end();
    await this.logExport(actor.id, 'export.audit', `خروجی گزارش اقدام‌ها (${out.rows} ردیف) گرفته شد.`, { filters: f, rows: out.rows, capped: out.rows >= MAX_AUDIT_ROWS });
  }

  /** H-44 اعضا/حضور/ارزیابی یک جلسه از mid (صفحه‌به‌صفحه؛ صفحهٔ اول پیش از شروع stream تا 404/503 به‌صورت JSON برسد) */
  async session(actor: Actor, id: string, q: z.infer<typeof high.SessionExportQuery>, res: Response): Promise<void> {
    this.need(actor, 'system.sessions.view');
    const s = await this.sessions.get(id);
    type Page = { items: unknown[]; total: number };
    const fetchPage = async (page: number): Promise<Page> => {
      if (q.kind === 'members') {
        const r = await this.mid.listMembers(id, { page, pageSize: MID_PAGE });
        return { items: await this.sessions.withPhones(r.items), total: r.total };
      }
      if (q.kind === 'attendance') return this.mid.attendance(id, { page, pageSize: MID_PAGE, occurrenceId: q.occurrenceId });
      return this.mid.evaluations(id, { page, pageSize: MID_PAGE, occurrenceId: q.occurrenceId, includeVoid: 'true' });
    };
    let page = 1;
    let cur = await fetchPage(page);
    const out = new CsvStream(res, `session-${q.kind}-${this.stamp()}.csv`);
    const headers: Record<typeof q.kind, string[]> = {
      members: ['memberId', 'userId', 'name', 'phone', 'roles', 'status', 'requestedAt', 'decidedAt'],
      attendance: ['userId', 'name', 'enteredAt', 'source', 'occurrenceId'],
      evaluations: ['id', 'userId', 'userName', 'evaluatorName', 'voice', 'tone', 'tajweed', 'score', 'points', 'note', 'status', 'occurrenceId', 'createdAt']
    };
    await out.header(headers[q.kind]);
    for (;;) {
      for (const it of cur.items as Record<string, unknown>[]) {
        if (out.rows >= MAX_SESSION_ROWS || out.closed) break;
        if (q.kind === 'members') await out.row([it.id, it.userId, it.name, it.phone, (it.roles as string[]).join(' '), it.status, it.requestedAt, it.decidedAt]);
        else if (q.kind === 'attendance') await out.row([it.userId, it.name, it.enteredAt, it.source, it.occurrenceId]);
        else await out.row([it.id, it.userId, it.userName, it.evaluatorName, it.voice, it.tone, it.tajweed, it.score, it.points, it.note, it.status, it.occurrenceId, it.createdAt]);
      }
      if (out.rows >= MAX_SESSION_ROWS || out.closed || cur.items.length < MID_PAGE || page * MID_PAGE >= cur.total) break;
      try {
        cur = await fetchPage(++page);
      } catch (e) {
        // خطای مبدأ وسط stream ⇒ فایل ناقص قطع شود (کلاینت آن را کامل نپندارد)
        res.destroy();
        throw e instanceof AppError ? e : new AppError('SERVICE_UNAVAILABLE');
      }
    }
    out.end();
    await this.logExport(actor.id, 'export.session', `خروجی ${q.kind} جلسه (${out.rows} ردیف) گرفته شد:`, { kind: q.kind, occurrenceId: q.occurrenceId ?? null, rows: out.rows }, { type: 'session', id, label: s.title });
  }
}
