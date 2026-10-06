import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { high } from '@isra/api-types';
import { AppError } from '../../common/app-error';
import { Clock } from '../../common/clock';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../../common/ids';
import { ENV, type Env } from '../../config/env';
import { MidAdminClient } from '../../internal/admin-clients';
import { isDupKey, keyTaken } from '../access/write-helpers';
import { AuditService } from '../audit.service';
import { type Q, conflict, withRetry } from '../db';
import { BADGE_COLS, BADGE_ORDER, type BadgeRow, MAX_BADGES, lockCatalog, publishCatalog } from './catalog';
import { type BadgeImageType, validateBadgeImage } from './image';

type AdminBadge = z.infer<typeof high.AdminBadge>;
const HOLDERS_TIMEOUT_MS = 800;

/**
 * نشان‌های پویا (H-32..H-37، D5): منبع حقیقت کاتالوگ high است. هر تغییر ⇒ نسخه +۱ و `badge.catalog.changed`
 * (کاتالوگ کامل بدون باینری) به mid و low در همان تراکنش. تصویر در `badges.image` (MEDIUMBLOB) و از طریق
 * `HIGH_INTERNAL.badgeImage` فقط به low داده می‌شود. `holders` از mid با timeout کوتاه (خطا ⇒ ۰).
 */
@Injectable()
export class BadgesService {
  private readonly log = new Logger('Badges');

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly mid: MidAdminClient,
    @Inject(ENV) private readonly env: Env
  ) {}

  private async holders(): Promise<Map<string, number>> {
    try {
      const r = await this.mid.badgeHolders(Math.min(HOLDERS_TIMEOUT_MS, this.env.INTERNAL_TIMEOUT_MS));
      return new Map(r.items.map((i) => [i.badgeId.toLowerCase(), i.holders]));
    } catch (e) {
      this.log.warn({ code: e instanceof AppError ? e.code : 'unknown' }, 'badge holders unavailable');
      return new Map();
    }
  }

  private dto(r: BadgeRow, holders: Map<string, number>): AdminBadge {
    const id = bufToUuid(r.id);
    return {
      id,
      key: r.badge_key,
      title: r.title,
      description: r.description,
      threshold: r.threshold,
      active: !!r.active,
      sortOrder: r.sort_order,
      image: r.image_hash && r.image_type && r.image_bytes && r.image_w && r.image_h ? { hash: r.image_hash, contentType: r.image_type as BadgeImageType, bytes: r.image_bytes, width: r.image_w, height: r.image_h } : null,
      holders: holders.get(id) ?? 0,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString()
    };
  }

  async list(page: number, pageSize: number) {
    const [rows, cnt, holders] = await Promise.all([
      this.ds.query(`SELECT ${BADGE_COLS} FROM badges ORDER BY ${BADGE_ORDER} LIMIT ? OFFSET ?`, [pageSize, (page - 1) * pageSize]) as Promise<BadgeRow[]>,
      this.ds.query('SELECT COUNT(*) AS n FROM badges') as Promise<{ n: string | number }[]>,
      this.holders()
    ]);
    return { items: rows.map((r) => this.dto(r, holders)), page, pageSize, total: Number(cnt[0]?.n ?? 0) };
  }

  private async row(q: Q, id: string, lock = false): Promise<BadgeRow> {
    const rows = isUuid(id) ? ((await q.query(`SELECT ${BADGE_COLS} FROM badges WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [uuidToBuf(id)])) as BadgeRow[]) : [];
    if (!rows[0]) throw new AppError('NOT_FOUND', { message: 'نشان پیدا نشد.' });
    return rows[0];
  }

  private async one(id: string): Promise<AdminBadge> {
    const [r, h] = await Promise.all([this.row(this.ds, id), this.holders()]);
    return this.dto(r, h);
  }

  /** تراکنش نوشتن کاتالوگ: قفل نسخه ⇒ تغییر ⇒ نسخه +۱ + رویداد + audit (همه اتمیک) */
  private write<T>(fn: (m: Q, now: Date) => Promise<T>): Promise<T> {
    return withRetry(() =>
      this.ds.transaction(async (m) => {
        await lockCatalog(m);
        return fn(m, this.clock.now());
      })
    );
  }

  private async logAudit(m: Q, actorId: string, action: string, b: { id: string; title: string }, summary: string, meta: Record<string, unknown>) {
    await this.audit.write(m, { actor: await this.audit.actorOf(actorId, m), action, target: { type: 'badge', id: b.id, label: b.title }, summary, meta });
  }

  async create(actorId: string, body: z.infer<typeof high.CreateBadgeBody>) {
    const id = uuidv7(this.clock.now().getTime());
    await this.write(async (m, now) => {
      const n = (await m.query('SELECT COUNT(*) AS n FROM badges')) as { n: string | number }[];
      if (Number(n[0]?.n ?? 0) >= MAX_BADGES) throw conflict('LIMIT_REACHED', `حداکثر ${MAX_BADGES} نشان مجاز است.`, { limit: MAX_BADGES });
      try {
        await m.query('INSERT INTO badges (id, badge_key, title, description, threshold, active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
          uuidToBuf(id),
          body.key,
          body.title,
          body.description,
          body.threshold,
          body.active ? 1 : 0,
          body.sortOrder,
          now,
          now
        ]);
      } catch (e) {
        if (isDupKey(e)) throw keyTaken('نشان');
        throw e;
      }
      const version = await publishCatalog(m, now);
      await this.logAudit(m, actorId, 'badge.create', { id, title: body.title }, `نشان «${body.title}» ساخته شد.`, { key: body.key, threshold: body.threshold, active: body.active, version });
    });
    return this.one(id);
  }

  async update(actorId: string, id: string, body: z.infer<typeof high.UpdateBadgeBody>) {
    await this.write(async (m, now) => {
      const cur = await this.row(m, id, true);
      const next = { title: body.title ?? cur.title, description: body.description ?? cur.description, threshold: body.threshold ?? cur.threshold, active: body.active ?? !!cur.active, sortOrder: body.sortOrder ?? cur.sort_order };
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const before = { title: cur.title, description: cur.description, threshold: cur.threshold, active: !!cur.active, sortOrder: cur.sort_order };
      for (const k of Object.keys(next) as (keyof typeof next)[]) if (next[k] !== before[k]) changes[k] = { from: k === 'description' ? undefined : before[k], to: k === 'description' ? undefined : next[k] };
      if (!Object.keys(changes).length) return;
      await m.query('UPDATE badges SET title = ?, description = ?, threshold = ?, active = ?, sort_order = ?, updated_at = ? WHERE id = ?', [next.title, next.description, next.threshold, next.active ? 1 : 0, next.sortOrder, now, cur.id]);
      const version = await publishCatalog(m, now);
      await this.logAudit(m, actorId, 'badge.update', { id, title: next.title }, `نشان «${next.title}» ویرایش شد.`, { changes, version });
    });
    return this.one(id);
  }

  async remove(actorId: string, id: string) {
    const holders = await this.holders();
    return this.write(async (m, now) => {
      const cur = await this.row(m, id, true);
      await m.query('DELETE FROM badges WHERE id = ?', [cur.id]);
      const version = await publishCatalog(m, now);
      await this.logAudit(m, actorId, 'badge.delete', { id, title: cur.title }, `نشان «${cur.title}» حذف شد.`, { key: cur.badge_key, version });
      return this.dto(cur, holders);
    });
  }

  async setImage(actorId: string, id: string, body: z.infer<typeof high.BadgeImageBody>) {
    const img = validateBadgeImage(body.contentType, body.dataBase64);
    await this.write(async (m, now) => {
      const cur = await this.row(m, id, true);
      if (cur.image_hash === img.hash) return; // همان تصویر (idempotent)
      await m.query('UPDATE badges SET image = ?, image_type = ?, image_hash = ?, image_bytes = ?, image_w = ?, image_h = ?, updated_at = ? WHERE id = ?', [img.bytes, img.type, img.hash, img.bytes.length, img.width, img.height, now, cur.id]);
      const version = await publishCatalog(m, now);
      await this.logAudit(m, actorId, 'badge.image_set', { id, title: cur.title }, `تصویر نشان «${cur.title}» تغییر کرد.`, { contentType: img.type, bytes: img.bytes.length, width: img.width, height: img.height, hash: img.hash, version });
    });
    return this.one(id);
  }

  async clearImage(actorId: string, id: string) {
    await this.write(async (m, now) => {
      const cur = await this.row(m, id, true);
      if (!cur.image_hash) return;
      await m.query('UPDATE badges SET image = NULL, image_type = NULL, image_hash = NULL, image_bytes = NULL, image_w = NULL, image_h = NULL, updated_at = ? WHERE id = ?', [now, cur.id]);
      const version = await publishCatalog(m, now);
      await this.logAudit(m, actorId, 'badge.image_clear', { id, title: cur.title }, `تصویر نشان «${cur.title}» حذف شد.`, { version });
    });
    return this.one(id);
  }

  /** HIGH_INTERNAL.badgeImage (فقط low): بایت خام + نوع دقیق */
  async image(id: string): Promise<{ bytes: Buffer; type: string; hash: string } | null> {
    if (!isUuid(id)) return null;
    const rows = (await this.ds.query('SELECT image, image_type, image_hash FROM badges WHERE id = ?', [uuidToBuf(id)])) as { image: Buffer | null; image_type: string | null; image_hash: string | null }[];
    const r = rows[0];
    return r?.image && r.image_type && r.image_hash ? { bytes: r.image, type: r.image_type, hash: r.image_hash } : null;
  }
}
