import { Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { mid } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { LiveService } from '../live/live.service';
import { MediaService } from '../media/media.service';
import { MembersAccess, type SessionRow } from './access.service';
import { CatalogService } from './catalog.service';
import { NAME_SQL, conflict, displayName, nameSql, type Q } from './db';
import { OccurrencesService } from './occurrences.service';
import { PostCommit } from './post-commit';
import type { SessionRole } from './rules';

export type GalleryKind = 'image' | 'audio';
export type GalleryVisibility = 'public' | 'members' | 'staff';
type Level = GalleryVisibility;

export const MAX_GALLERIES_PER_OCCURRENCE = 20;
const PUBLIC_INLINE_ITEMS = 100;
const IMAGE_TYPES = new Set<string>(mid.GALLERY_IMAGE_TYPES);
const AUDIO_TYPES = new Set<string>(mid.GALLERY_AUDIO_TYPES);

/** کاربر درخواست‌دهنده (Bearer یا URL امضاشده؛ perms فقط از JWT) */
export interface Viewer {
  userId: string;
  perms: readonly string[];
}

interface GalleryRaw {
  id: Buffer;
  session_id: Buffer;
  occurrence_id: Buffer;
  title: string;
  kind: GalleryKind;
  visibility: GalleryVisibility;
  sort_order: number;
  created_by: Buffer;
  created_at: Date;
  creator_name: string | null;
  item_count: string | number;
  total_bytes: string | number | null;
}
interface ItemRaw {
  id: Buffer;
  gallery_id: Buffer;
  session_id: Buffer;
  mime: string;
  bytes: string | number;
  sha256: string;
  width: number | null;
  height: number | null;
  duration_sec: number | null;
  title: string;
  storage_key: string;
  uploaded_by: Buffer;
  created_at: Date;
  uploader_name: string | null;
}

const GAL_SELECT = `SELECT g.id, g.session_id, g.occurrence_id, g.title, g.kind, g.visibility, g.sort_order, g.created_by, g.created_at, ${nameSql('c')} AS creator_name,
        (SELECT COUNT(*) FROM gallery_items i WHERE i.gallery_id = g.id AND i.deleted_at IS NULL) AS item_count,
        (SELECT SUM(i.bytes) FROM gallery_items i WHERE i.gallery_id = g.id AND i.deleted_at IS NULL) AS total_bytes
   FROM galleries g LEFT JOIN user_directory c ON c.user_id = g.created_by`;
const ITEM_SELECT = `SELECT i.id, i.gallery_id, i.session_id, i.mime, i.bytes, i.sha256, i.width, i.height, i.duration_sec, i.title, i.storage_key, i.uploaded_by, i.created_at, ${NAME_SQL} AS uploader_name
   FROM gallery_items i LEFT JOIN user_directory d ON d.user_id = i.uploaded_by`;

const galleryDto = (r: GalleryRaw) => ({
  id: bufToUuid(r.id),
  sessionId: bufToUuid(r.session_id),
  occurrenceId: bufToUuid(r.occurrence_id),
  title: r.title,
  kind: r.kind,
  visibility: r.visibility,
  sortOrder: Number(r.sort_order),
  itemCount: Number(r.item_count ?? 0),
  totalBytes: Number(r.total_bytes ?? 0),
  createdBy: { id: bufToUuid(r.created_by), name: r.creator_name || displayName() },
  createdAt: r.created_at.toISOString()
});

export const contentPath = (sessionId: string, galleryId: string, itemId: string) => `/o/v1/sessions/${sessionId}/galleries/${galleryId}/items/${itemId}/content`;

/** سطح‌های نمایش قابل‌دیدن (docs-v2/31 §۴): کادر/ادمین ⇒ همه؛ عضو تأییدشده ⇒ public+members؛ دیگران با gallery.view ⇒ public */
export function visibleLevels(role: SessionRole | null | 'admin', canViewPublic: boolean): Level[] {
  if (role === 'admin' || role === 'owner' || role === 'supporter') return ['public', 'members', 'staff'];
  if (role === 'member') return ['public', 'members'];
  return canViewPublic ? ['public'] : [];
}

/** نوع Content-Type بدون پارامتر */
export const mediaType = (raw: string | undefined): string => (raw ?? '').split(';')[0]!.trim().toLowerCase();

const notFound = () => new AppError('NOT_FOUND', { message: 'گالری پیدا نشد.' });
const itemNotFound = () => new AppError('NOT_FOUND', { message: 'فایل پیدا نشد.' });
const ph = (n: number) => Array.from({ length: n }, () => '?').join(',');

/**
 * گالری per نوبت برگزاری (۱.۷.۰؛ docs-v2/31 §۴، T7): چند گالری per نوبت (عنوان، نوع تصویر/صوت، سطح نمایش).
 * مدیریت: صاحب، پشتیبانِ `gallery.manage`، ادمین (MID_ADMIN). دیدن طبق `visibleLevels`؛ گالری نادیدنی ⇒ NOT_FOUND (بدون نشت).
 * حذف نرم؛ فایل‌ها با job پاک‌سازی (`purgeDeleted`) حذف می‌شوند.
 */
@Injectable()
export class GalleriesService {
  private readonly log = new Logger('Galleries');
  private purging?: Promise<number>;

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly access: MembersAccess,
    private readonly occurrences: OccurrencesService,
    private readonly catalog: CatalogService,
    private readonly media: MediaService,
    private readonly live: LiveService,
    private readonly post: PostCommit
  ) {}

  // ───────────────────────── کمکی ─────────────────────────
  private itemDto(r: ItemRaw, signFor: string | null) {
    const sid = bufToUuid(r.session_id);
    const gid = bufToUuid(r.gallery_id);
    const iid = bufToUuid(r.id);
    return {
      id: iid,
      galleryId: gid,
      mime: r.mime as (typeof mid.GALLERY_IMAGE_TYPES)[number] | (typeof mid.GALLERY_AUDIO_TYPES)[number],
      bytes: Number(r.bytes),
      sha256: r.sha256,
      width: r.width,
      height: r.height,
      durationSec: r.duration_sec,
      title: r.title,
      uploadedBy: { id: bufToUuid(r.uploaded_by), name: r.uploader_name || displayName() },
      createdAt: r.created_at.toISOString(),
      // MID_ADMIN: high نشانی H-117 را با کلید خودش می‌سازد ⇒ اینجا خالی
      url: signFor ? this.media.sign(contentPath(sid, gid, iid), signFor) : ''
    };
  }

  private async galleryRaw(q: Q, sessionId: string, galleryId: string, lock = false): Promise<GalleryRaw> {
    if (!isUuid(galleryId)) throw notFound();
    if (lock) await q.query('SELECT id FROM galleries WHERE id = ? FOR UPDATE', [uuidToBuf(galleryId)]);
    const r = (await q.query(`${GAL_SELECT} WHERE g.id = ? AND g.session_id = ? AND g.deleted_at IS NULL`, [uuidToBuf(galleryId), uuidToBuf(sessionId)])) as GalleryRaw[];
    if (!r[0]) throw notFound();
    return r[0];
  }

  /** نقش و سطح‌های قابل‌دیدن یک کاربر واردشده در جلسه (draft برای غیرکادر ⇒ NOT_FOUND) */
  private async viewerLevels(v: Viewer, sessionId: string): Promise<{ session: SessionRow; role: SessionRole | null; levels: Level[] }> {
    const a = await this.access.load(this.ds, sessionId, v.userId);
    const canPublic = a.role ? true : await this.catalog.hasSystemPermission('gallery.view', v);
    return { session: a.session, role: a.role, levels: visibleLevels(a.role, canPublic) };
  }

  private async page(sessionId: string, where: string[], args: unknown[], page: number, pageSize: number) {
    const w = ['g.session_id = ?', 'g.deleted_at IS NULL', ...where].join(' AND ');
    const a = [uuidToBuf(sessionId), ...args];
    const [rows, cnt] = await Promise.all([
      this.ds.query(`${GAL_SELECT} WHERE ${w} ORDER BY g.sort_order ASC, g.created_at ASC, g.id ASC LIMIT ? OFFSET ?`, [...a, pageSize, (page - 1) * pageSize]) as Promise<GalleryRaw[]>,
      this.ds.query(`SELECT COUNT(*) AS n FROM galleries g WHERE ${w}`, a) as Promise<{ n: string | number }[]>
    ]);
    return { items: rows.map(galleryDto), page, pageSize, total: Number(cnt[0]?.n ?? 0) };
  }

  // ───────────────────────── M-70..M-77 ─────────────────────────
  /** M-70: گالری‌های یک نوبت (فقط سطح‌های قابل‌دیدن) */
  async list(v: Viewer, sessionId: string, occurrenceId: string, page: number, pageSize: number) {
    const { levels } = await this.viewerLevels(v, sessionId);
    if (!levels.length) throw new AppError('AUTH_FORBIDDEN');
    await this.occurrences.byId(this.ds, sessionId, occurrenceId);
    return this.page(sessionId, ['g.occurrence_id = ?', `g.visibility IN (${ph(levels.length)})`], [uuidToBuf(occurrenceId), ...levels], page, pageSize);
  }

  /** ساخت داخل تراکنش (جلسه قفل): نوبت همان جلسه؛ حداکثر ۲۰ گالری per نوبت */
  private async createIn(m: Q, session: SessionRow, occurrenceId: string, b: { title: string; kind: GalleryKind; visibility: GalleryVisibility; sortOrder: number }, actorId: string): Promise<string> {
    await this.occurrences.byId(m, session.id, occurrenceId);
    const n = (await m.query('SELECT COUNT(*) AS n FROM galleries WHERE occurrence_id = ? AND deleted_at IS NULL', [uuidToBuf(occurrenceId)])) as { n: string | number }[];
    if (Number(n[0]?.n ?? 0) >= MAX_GALLERIES_PER_OCCURRENCE) throw conflict('LIMIT_REACHED', `حداکثر ${MAX_GALLERIES_PER_OCCURRENCE} گالری برای هر نوبت مجاز است.`);
    const now = this.clock.now();
    const id = uuidv7(now.getTime());
    await m.query('INSERT INTO galleries (id, session_id, occurrence_id, title, kind, visibility, sort_order, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      uuidToBuf(id),
      uuidToBuf(session.id),
      uuidToBuf(occurrenceId),
      b.title,
      b.kind,
      b.visibility,
      b.sortOrder,
      uuidToBuf(actorId),
      now,
      now
    ]);
    this.post.after(m, () => this.live.emit(session.id, 'gallery.updated', { galleryId: id, occurrenceId }));
    return id;
  }

  /** M-71 (gallery.manage) */
  async create(actorId: string, sessionId: string, occurrenceId: string, b: { title: string; kind: GalleryKind; visibility: GalleryVisibility; sortOrder: number }) {
    const id = await this.ds.transaction(async (m) => {
      const { session } = await this.access.load(m, sessionId, actorId, 'gallery.manage', true);
      return this.createIn(m, session, occurrenceId, b, actorId);
    });
    return galleryDto(await this.galleryRaw(this.ds, sessionId, id));
  }

  private async updateIn(m: Q, sessionId: string, galleryId: string, b: { title?: string; visibility?: GalleryVisibility; sortOrder?: number }): Promise<void> {
    const g = await this.galleryRaw(m, sessionId, galleryId, true);
    const sets: string[] = [];
    const args: unknown[] = [];
    if (b.title !== undefined) sets.push('title = ?') && args.push(b.title);
    if (b.visibility !== undefined) sets.push('visibility = ?') && args.push(b.visibility);
    if (b.sortOrder !== undefined) sets.push('sort_order = ?') && args.push(b.sortOrder);
    if (!sets.length) return;
    await m.query(`UPDATE galleries SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [...args, this.clock.now(), g.id]);
    this.post.after(m, () => this.live.emit(sessionId, 'gallery.updated', { galleryId, occurrenceId: bufToUuid(g.occurrence_id) }));
  }

  /** M-72 (gallery.manage)؛ نوع (kind) ثابت است */
  async update(actorId: string, sessionId: string, galleryId: string, b: { title?: string; visibility?: GalleryVisibility; sortOrder?: number }) {
    await this.ds.transaction(async (m) => {
      await this.access.load(m, sessionId, actorId, 'gallery.manage');
      await this.updateIn(m, sessionId, galleryId, b);
    });
    return galleryDto(await this.galleryRaw(this.ds, sessionId, galleryId));
  }

  /** حذف نرم گالری و آیتم‌هایش (idempotent: حذف‌شده ⇒ بدون خطا) */
  private async removeIn(m: Q, sessionId: string, galleryId: string): Promise<boolean> {
    if (!isUuid(galleryId)) throw notFound();
    const r = (await m.query('SELECT id, occurrence_id, deleted_at FROM galleries WHERE id = ? AND session_id = ? FOR UPDATE', [uuidToBuf(galleryId), uuidToBuf(sessionId)])) as { id: Buffer; occurrence_id: Buffer; deleted_at: Date | null }[];
    if (!r[0]) throw notFound();
    if (r[0].deleted_at) return false;
    const now = this.clock.now();
    await m.query('UPDATE galleries SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, r[0].id]);
    await m.query('UPDATE gallery_items SET deleted_at = ? WHERE gallery_id = ? AND deleted_at IS NULL', [now, r[0].id]);
    const occ = bufToUuid(r[0].occurrence_id);
    this.post.after(m, () => {
      this.live.emit(sessionId, 'gallery.updated', { galleryId, occurrenceId: occ, deleted: true });
      this.schedulePurge();
    });
    return true;
  }

  /** M-73 (gallery.manage) */
  async remove(actorId: string, sessionId: string, galleryId: string): Promise<Record<string, never>> {
    await this.ds.transaction(async (m) => {
      await this.access.load(m, sessionId, actorId, 'gallery.manage');
      await this.removeIn(m, sessionId, galleryId);
    });
    return {};
  }

  private async itemsPage(sessionId: string, galleryId: string, page: number, pageSize: number, signFor: string | null) {
    const gid = uuidToBuf(galleryId);
    const [rows, cnt] = await Promise.all([
      this.ds.query(`${ITEM_SELECT} WHERE i.gallery_id = ? AND i.deleted_at IS NULL ORDER BY i.created_at ASC, i.id ASC LIMIT ? OFFSET ?`, [gid, pageSize, (page - 1) * pageSize]) as Promise<ItemRaw[]>,
      this.ds.query('SELECT COUNT(*) AS n FROM gallery_items WHERE gallery_id = ? AND deleted_at IS NULL', [gid]) as Promise<{ n: string | number }[]>
    ]);
    void sessionId;
    return { items: rows.map((r) => this.itemDto(r, signFor)), page, pageSize, total: Number(cnt[0]?.n ?? 0) };
  }

  /** گالری قابل‌دیدن برای کاربر (وگرنه NOT_FOUND) */
  private async visibleGallery(v: Viewer, sessionId: string, galleryId: string): Promise<GalleryRaw> {
    const { levels } = await this.viewerLevels(v, sessionId);
    const g = await this.galleryRaw(this.ds, sessionId, galleryId);
    if (!levels.includes(g.visibility)) throw notFound();
    return g;
  }

  /** M-74 */
  async items(v: Viewer, sessionId: string, galleryId: string, page: number, pageSize: number) {
    await this.visibleGallery(v, sessionId, galleryId);
    return this.itemsPage(sessionId, galleryId, page, pageSize, v.userId);
  }

  // ───── بارگذاری ─────
  /**
   * M-75 / MID_ADMIN.galleryItems: بدنهٔ خام. ترتیب: مجوز ⇒ گالری ⇒ نوع/حجم اعلام‌شده ⇒ MEDIA_DIR ⇒ پیش‌بررسی سهمیه ⇒
   * stream به فایل موقت (magic bytes، EXIF، sha256) ⇒ تراکنش (قفل جلسه، سهمیهٔ قطعی، درج) + rename اتمیک پیش از commit.
   */
  async upload(actor: { userId: string; admin: boolean }, sessionId: string, galleryId: string, req: Request, title: string | undefined) {
    // مجوز و وجود گالری پیش از خواندن بدنه
    if (actor.admin) {
      if (!(await this.access.session(this.ds, sessionId))) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    } else await this.access.load(this.ds, sessionId, actor.userId, 'gallery.manage');
    const g = await this.galleryRaw(this.ds, sessionId, galleryId);
    const type = mediaType(req.header('content-type'));
    if (!IMAGE_TYPES.has(type) && !AUDIO_TYPES.has(type)) throw new AppError('UNSUPPORTED_MEDIA_TYPE');
    if ((g.kind === 'image') !== IMAGE_TYPES.has(type)) throw conflict('GALLERY_KIND_MISMATCH', g.kind === 'image' ? 'این گالری فقط تصویر می‌پذیرد.' : 'این گالری فقط صوت می‌پذیرد.');
    const max = g.kind === 'image' ? mid.GALLERY_IMAGE_MAX_BYTES : mid.GALLERY_AUDIO_MAX_BYTES;
    const declared = Number(req.header('content-length') ?? NaN);
    if (Number.isFinite(declared) && declared > max) throw new AppError('PAYLOAD_TOO_LARGE');
    this.media.requireDir();
    const used = await this.usedBytes(this.ds, sessionId);
    if (Number.isFinite(declared) && used + declared > this.media.quotaBytes) throw conflict('QUOTA_EXCEEDED', 'سهمیهٔ فضای این جلسه پر است.');

    const rec = await this.media.receive(req, type, max);
    const itemId = uuidv7(this.clock.now().getTime());
    const storageKey = `${sessionId}/${galleryId}/${itemId}`;
    let renamed = false;
    try {
      await this.ds.transaction(async (m) => {
        const s = await this.access.session(m, sessionId, true);
        if (!s) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
        await this.galleryRaw(m, sessionId, galleryId);
        if ((await this.usedBytes(m, sessionId)) + rec.bytes > this.media.quotaBytes) throw conflict('QUOTA_EXCEEDED', 'سهمیهٔ فضای این جلسه پر است.');
        await m.query(
          'INSERT INTO gallery_items (id, gallery_id, session_id, mime, bytes, sha256, width, height, duration_sec, title, storage_key, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)',
          [uuidToBuf(itemId), uuidToBuf(galleryId), uuidToBuf(sessionId), rec.mime, rec.bytes, rec.sha256, rec.width, rec.height, title ?? '', storageKey, uuidToBuf(actor.userId), this.clock.now()]
        );
        await this.media.commit(rec.tmpPath, storageKey);
        renamed = true;
      });
    } catch (e) {
      if (renamed) await this.media.remove(storageKey).catch(() => undefined);
      else await this.media.discard(rec.tmpPath);
      throw e;
    }
    this.live.emit(sessionId, 'gallery.updated', { galleryId, occurrenceId: bufToUuid(g.occurrence_id) });
    const r = (await this.ds.query(`${ITEM_SELECT} WHERE i.id = ?`, [uuidToBuf(itemId)])) as ItemRaw[];
    return this.itemDto(r[0]!, actor.admin ? null : actor.userId);
  }

  private async usedBytes(q: Q, sessionId: string): Promise<number> {
    const r = (await q.query('SELECT COALESCE(SUM(bytes), 0) AS n FROM gallery_items WHERE session_id = ? AND deleted_at IS NULL', [uuidToBuf(sessionId)])) as { n: string | number }[];
    return Number(r[0]?.n ?? 0);
  }

  private async removeItemIn(m: Q, sessionId: string, galleryId: string, itemId: string): Promise<void> {
    await this.galleryRaw(m, sessionId, galleryId);
    if (!isUuid(itemId)) throw itemNotFound();
    const r = (await m.query('SELECT id, deleted_at FROM gallery_items WHERE id = ? AND gallery_id = ? FOR UPDATE', [uuidToBuf(itemId), uuidToBuf(galleryId)])) as { id: Buffer; deleted_at: Date | null }[];
    if (!r[0]) throw itemNotFound();
    if (r[0].deleted_at) return;
    await m.query('UPDATE gallery_items SET deleted_at = ? WHERE id = ?', [this.clock.now(), r[0].id]);
    this.post.after(m, () => {
      this.live.emit(sessionId, 'gallery.updated', { galleryId, itemId, deleted: true });
      this.schedulePurge();
    });
  }

  /** M-76 (gallery.manage)؛ idempotent */
  async removeItem(actorId: string, sessionId: string, galleryId: string, itemId: string): Promise<Record<string, never>> {
    await this.ds.transaction(async (m) => {
      await this.access.load(m, sessionId, actorId, 'gallery.manage');
      await this.removeItemIn(m, sessionId, galleryId, itemId);
    });
    return {};
  }

  private async itemRow(galleryId: string, itemId: string): Promise<ItemRaw> {
    if (!isUuid(itemId)) throw itemNotFound();
    const r = (await this.ds.query(`${ITEM_SELECT} WHERE i.id = ? AND i.gallery_id = ? AND i.deleted_at IS NULL`, [uuidToBuf(itemId), uuidToBuf(galleryId)])) as ItemRaw[];
    if (!r[0]) throw itemNotFound();
    return r[0];
  }

  /**
   * M-77: Bearer یا URL امضاشده (کاربر `u`)؛ دسترسی همیشه دوباره بررسی می‌شود. کاربر حذف‌شده/غیرفعال با امضا ⇒ AUTH_REQUIRED.
   */
  async content(v: Viewer & { signed: boolean }, sessionId: string, galleryId: string, itemId: string, req: Request, res: Response): Promise<void> {
    if (v.signed) {
      const d = ((await this.ds.query('SELECT status, deleted FROM user_directory WHERE user_id = ?', [uuidToBuf(v.userId)])) as { status: string; deleted: number }[])[0];
      if (d && (d.deleted || d.status !== 'active')) throw new AppError('AUTH_REQUIRED');
    }
    await this.visibleGallery(v, sessionId, galleryId);
    const it = await this.itemRow(galleryId, itemId);
    this.media.requireDir();
    await this.media.serve(req, res, { mime: it.mime, bytes: Number(it.bytes), sha256: it.sha256, storageKey: it.storage_key }, 'private, max-age=3600');
  }

  // ───────────────────────── عمومی (M-78/M-79) ─────────────────────────
  /** M-78: گالری‌های public جلسهٔ غیر draft (unlisted هم با شناسهٔ مستقیم)؛ آیتم‌ها درون‌خطی ≤ ۱۰۰ */
  async publicList(sessionId: string, occurrenceId: string | undefined, page: number, pageSize: number) {
    const s = await this.access.session(this.ds, sessionId);
    if (!s || s.status === 'draft') throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    const where = ["g.session_id = ?", 'g.deleted_at IS NULL', "g.visibility = 'public'"];
    const args: unknown[] = [uuidToBuf(sessionId)];
    if (occurrenceId) {
      await this.occurrences.byId(this.ds, sessionId, occurrenceId);
      where.push('g.occurrence_id = ?');
      args.push(uuidToBuf(occurrenceId));
    }
    const w = where.join(' AND ');
    const [rows, cnt] = await Promise.all([
      this.ds.query(
        `SELECT g.id, g.title, g.kind, o.id AS occ_id, o.seq, o.opened_at,
                (SELECT COUNT(*) FROM gallery_items i WHERE i.gallery_id = g.id AND i.deleted_at IS NULL) AS item_count
           FROM galleries g JOIN session_occurrences o ON o.id = g.occurrence_id
          WHERE ${w} ORDER BY o.seq DESC, g.sort_order ASC, g.created_at ASC, g.id ASC LIMIT ? OFFSET ?`,
        [...args, pageSize, (page - 1) * pageSize]
      ) as Promise<{ id: Buffer; title: string; kind: GalleryKind; occ_id: Buffer; seq: number; opened_at: Date; item_count: string | number }[]>,
      this.ds.query(`SELECT COUNT(*) AS n FROM galleries g WHERE ${w}`, args) as Promise<{ n: string | number }[]>
    ]);
    const items = new Map<string, ItemRaw[]>();
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      const its = (await this.ds.query(
        `SELECT * FROM (SELECT i.*, ROW_NUMBER() OVER (PARTITION BY i.gallery_id ORDER BY i.created_at ASC, i.id ASC) AS rn FROM gallery_items i WHERE i.gallery_id IN (${ph(ids.length)}) AND i.deleted_at IS NULL) x WHERE x.rn <= ?`,
        [...ids, PUBLIC_INLINE_ITEMS]
      )) as ItemRaw[];
      for (const it of its) {
        const k = bufToUuid(it.gallery_id);
        const list = items.get(k);
        if (list) list.push(it);
        else items.set(k, [it]);
      }
    }
    return {
      items: rows.map((r) => ({
        id: bufToUuid(r.id),
        occurrence: { id: bufToUuid(r.occ_id), seq: Number(r.seq), openedAt: r.opened_at.toISOString() },
        title: r.title,
        kind: r.kind,
        itemCount: Number(r.item_count ?? 0),
        items: (items.get(bufToUuid(r.id)) ?? []).map((it) => ({ id: bufToUuid(it.id), mime: it.mime, bytes: Number(it.bytes), sha256: it.sha256, width: it.width, height: it.height, durationSec: it.duration_sec, title: it.title }))
      })),
      page,
      pageSize,
      total: Number(cnt[0]?.n ?? 0)
    };
  }

  /** M-79: فقط گالری public از جلسهٔ موجود و غیر draft */
  async publicContent(galleryId: string, itemId: string, req: Request, res: Response): Promise<void> {
    if (!isUuid(galleryId)) throw notFound();
    const g = (await this.ds.query(
      "SELECT g.session_id FROM galleries g JOIN sessions s ON s.id = g.session_id AND s.deleted_at IS NULL AND s.status <> 'draft' WHERE g.id = ? AND g.deleted_at IS NULL AND g.visibility = 'public'",
      [uuidToBuf(galleryId)]
    )) as { session_id: Buffer }[];
    if (!g[0]) throw notFound();
    const it = await this.itemRow(galleryId, itemId);
    this.media.requireDir();
    await this.media.serve(req, res, { mime: it.mime, bytes: Number(it.bytes), sha256: it.sha256, storageKey: it.storage_key }, 'public, max-age=86400');
  }

  // ───────────────────────── ادمین (MID_ADMIN؛ مجوز/audit در high) ─────────────────────────
  private async adminSession(sessionId: string, includeDeleted: boolean): Promise<SessionRow> {
    const s = await this.access.session(this.ds, sessionId, false, includeDeleted);
    if (!s) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    return s;
  }

  async adminList(sessionId: string, occurrenceId: string | undefined, page: number, pageSize: number) {
    await this.adminSession(sessionId, true);
    if (occurrenceId) await this.occurrences.byId(this.ds, sessionId, occurrenceId);
    return this.page(sessionId, occurrenceId ? ['g.occurrence_id = ?'] : [], occurrenceId ? [uuidToBuf(occurrenceId)] : [], page, pageSize);
  }

  async adminCreate(sessionId: string, b: { occurrenceId: string; title: string; kind: GalleryKind; visibility: GalleryVisibility; sortOrder: number; actorId: string }) {
    const id = await this.ds.transaction(async (m) => {
      const s = await this.access.session(m, sessionId, true);
      if (!s) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
      return this.createIn(m, s, b.occurrenceId, b, b.actorId);
    });
    return galleryDto(await this.galleryRaw(this.ds, sessionId, id));
  }

  async adminUpdate(sessionId: string, galleryId: string, b: { title?: string; visibility?: GalleryVisibility; sortOrder?: number }) {
    await this.adminSession(sessionId, false);
    await this.ds.transaction(async (m) => this.updateIn(m, sessionId, galleryId, b));
    return galleryDto(await this.galleryRaw(this.ds, sessionId, galleryId));
  }

  async adminRemove(sessionId: string, galleryId: string): Promise<Record<string, never>> {
    await this.adminSession(sessionId, false);
    await this.ds.transaction(async (m) => this.removeIn(m, sessionId, galleryId));
    return {};
  }

  async adminItems(sessionId: string, galleryId: string, page: number, pageSize: number) {
    await this.adminSession(sessionId, true);
    await this.galleryRaw(this.ds, sessionId, galleryId);
    return this.itemsPage(sessionId, galleryId, page, pageSize, null);
  }

  async adminRemoveItem(sessionId: string, galleryId: string, itemId: string): Promise<Record<string, never>> {
    await this.adminSession(sessionId, false);
    await this.ds.transaction(async (m) => this.removeItemIn(m, sessionId, galleryId, itemId));
    return {};
  }

  async adminContent(sessionId: string, galleryId: string, itemId: string, req: Request, res: Response): Promise<void> {
    await this.adminSession(sessionId, true);
    await this.galleryRaw(this.ds, sessionId, galleryId);
    const it = await this.itemRow(galleryId, itemId);
    this.media.requireDir();
    await this.media.serve(req, res, { mime: it.mime, bytes: Number(it.bytes), sha256: it.sha256, storageKey: it.storage_key }, 'private, max-age=3600');
  }

  // ───────────────────────── پاک‌سازی فایل‌های حذف‌شده ─────────────────────────
  private schedulePurge(): void {
    if (!this.media.available) return;
    void this.purgeDeleted().catch((e: unknown) => this.log.warn({ err: e instanceof Error ? e.message : 'unknown' }, 'purge failed'));
  }

  /** job: فایل آیتم‌های حذف نرم ⇒ unlink و purged_at (idempotent؛ اجرای هم‌زمان ⇒ همان promise) */
  purgeDeleted(limit = 200): Promise<number> {
    if (!this.media.available) return Promise.resolve(0);
    this.purging ??= (async () => {
      try {
        const rows = (await this.ds.query('SELECT id, storage_key FROM gallery_items WHERE deleted_at IS NOT NULL AND purged_at IS NULL ORDER BY deleted_at ASC LIMIT ?', [limit])) as { id: Buffer; storage_key: string }[];
        const done: Buffer[] = [];
        for (const r of rows) {
          try {
            await this.media.remove(r.storage_key);
            done.push(r.id);
          } catch (e) {
            this.log.warn({ err: e instanceof Error ? e.message : 'unknown' }, 'media unlink failed');
          }
        }
        if (done.length) await this.ds.query(`UPDATE gallery_items SET purged_at = ? WHERE id IN (${ph(done.length)})`, [this.clock.now(), ...done]);
        return done.length;
      } finally {
        this.purging = undefined;
      }
    })();
    return this.purging;
  }
}
