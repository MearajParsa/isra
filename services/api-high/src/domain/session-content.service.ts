import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import { type high, type internal, mid as midTypes } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { isUuid, uuidToBuf } from '../common/ids';
import { MediaUrlSigner, contentPath } from '../common/media-url';
import type { IsraRequest } from '../common/request-context';
import { type Paged, MidAdminClient } from '../internal/admin-clients';
import { type AuditTargetType, AuditService } from './audit.service';
import { conflict, displayName } from './db';
import { SessionsAdminService } from './sessions-admin.service';

type GalleryItem = z.infer<typeof internal.MidAdminGalleryItem>;
type Query = Record<string, string | number | boolean | undefined>;
type SupporterPermissions = z.infer<typeof midTypes.SupporterPermissions>;

const IMAGE_TYPES = new Set<string>(midTypes.GALLERY_IMAGE_TYPES);
const MEDIA_TYPES = new Set<string>([...midTypes.GALLERY_IMAGE_TYPES, ...midTypes.GALLERY_AUDIO_TYPES]);
/** هدرهای پاسخ محتوا که از mid عبور می‌کنند (allowlist؛ بقیه دور ریخته می‌شود) */
const PASS_HEADERS = ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'] as const;

interface DirUser {
  first_name: string;
  last_name: string;
  status: string;
}

/**
 * ۱.۷.۰ (docs-v2/31): پشتیبان‌ها (H-104..H-109)، گالری (H-110..H-117) و کامنت (H-118..H-120) — واسطهٔ MID_ADMIN.
 * high مالک داده نیست: کاربر/وضعیت از دایرکتوری high، audit پس از موفقیت مبدأ (بدون متن کامنت/محتوا)، شناسهٔ ادمین (`actorId`) به mid.
 * رسانه: بارگذاری stream به mid (هرگز بافر کامل)، محتوا stream از mid با Range؛ `url` آیتم‌ها به H-117 امضاشده برای همین ادمین بازنویسی می‌شود.
 */
@Injectable()
export class SessionContentService {
  constructor(
    private readonly ds: DataSource,
    private readonly mid: MidAdminClient,
    private readonly sessions: SessionsAdminService,
    private readonly media: MediaUrlSigner,
    private readonly audit: AuditService
  ) {}

  /** audit پس از موفقیت مبدأ؛ جلسه (شناسه/عنوان کش‌شده) در meta برای ردگیری */
  private async log(actorId: string, action: string, target: { type: AuditTargetType; id: string; label: string }, summary: string, meta: Record<string, unknown>) {
    await this.audit.write(this.ds, { actor: await this.audit.actorOf(actorId), action, target, summary, meta });
  }

  private async user(id: string): Promise<DirUser | null> {
    if (!isUuid(id)) return null;
    const r = (await this.ds.query('SELECT first_name, last_name, status FROM user_directory WHERE user_id = ?', [uuidToBuf(id)])) as DirUser[];
    return r[0] ?? null;
  }

  private async mustUser(id: string, what: string): Promise<DirUser> {
    const u = await this.user(id);
    if (!u) throw new AppError('NOT_FOUND', { message: `${what} پیدا نشد.` });
    return u;
  }

  /** پشتیبان باید کاربر فعال باشد (docs-v2/31 §۲) */
  private async activeSupporter(id: string): Promise<DirUser> {
    const u = await this.mustUser(id, 'کاربر پشتیبان');
    if (u.status !== 'active') throw conflict('USER_NOT_ACTIVE', 'پشتیبان باید کاربر فعال باشد.');
    return u;
  }

  // ───────── پشتیبان ثابت استاد (H-104..H-106) ─────────
  async teacherSupporters(teacherId: string, query: { page: number; pageSize: number }) {
    await this.mustUser(teacherId, 'استاد');
    return this.mid.teacherSupporters(teacherId, query);
  }

  async setTeacherSupporter(actorId: string, teacherId: string, supporterId: string, permissions: SupporterPermissions) {
    if (teacherId.toLowerCase() === supporterId.toLowerCase()) throw conflict('SELF_PROTECTED', 'استاد نمی‌تواند پشتیبان خودش باشد.');
    const teacher = await this.mustUser(teacherId, 'استاد');
    const u = await this.activeSupporter(supporterId);
    const r = await this.mid.putTeacherSupporter(teacherId, supporterId, { actorId, permissions, firstName: u.first_name, lastName: u.last_name });
    await this.log(actorId, 'supporter.teacher_set', { type: 'supporter', id: supporterId, label: displayName(u.first_name, u.last_name) }, `پشتیبان ثابت استاد «${displayName(teacher.first_name, teacher.last_name)}» تعیین شد.`, { teacherId, permissions });
    return r;
  }

  async removeTeacherSupporter(actorId: string, teacherId: string, supporterId: string): Promise<void> {
    const teacher = await this.mustUser(teacherId, 'استاد');
    await this.mid.deleteTeacherSupporter(teacherId, supporterId, actorId);
    const u = await this.user(supporterId);
    await this.log(actorId, 'supporter.teacher_remove', { type: 'supporter', id: supporterId, label: u ? displayName(u.first_name, u.last_name) : 'کاربر' }, `پشتیبان ثابت استاد «${displayName(teacher.first_name, teacher.last_name)}» حذف شد.`, { teacherId });
  }

  // ───────── پشتیبان per جلسه (H-107..H-109) ─────────
  sessionSupporters(id: string, query: { page: number; pageSize: number }) {
    return this.mid.sessionSupporters(id, query);
  }

  /** صاحب جلسه ⇒ SELF_PROTECTED را mid (مالک owner_id) برمی‌گرداند */
  async setSessionSupporter(actorId: string, id: string, userId: string, permissions: SupporterPermissions) {
    const u = await this.activeSupporter(userId);
    const r = await this.mid.putSessionSupporter(id, userId, { actorId, permissions, firstName: u.first_name, lastName: u.last_name });
    const s = this.sessions.ref(id);
    await this.log(actorId, 'supporter.session_set', { type: 'supporter', id: userId, label: displayName(u.first_name, u.last_name) }, `پشتیبان جلسهٔ «${s.title}» تعیین شد.`, { sessionId: id, permissions });
    return r;
  }

  async removeSessionSupporter(actorId: string, id: string, userId: string): Promise<void> {
    await this.mid.deleteSessionSupporter(id, userId, actorId);
    const u = await this.user(userId);
    await this.log(actorId, 'supporter.session_remove', { type: 'supporter', id: userId, label: u ? displayName(u.first_name, u.last_name) : 'کاربر' }, `پشتیبان جلسهٔ «${this.sessions.ref(id).title}» حذف شد.`, { sessionId: id });
  }

  // ───────── گالری (H-110..H-117) ─────────
  galleries(id: string, query: Query) {
    return this.mid.galleries(id, query);
  }

  async createGallery(actorId: string, id: string, body: z.infer<typeof high.AdminCreateGalleryBody>, idempotencyKey?: string) {
    const g = await this.mid.createGallery(id, { actorId, ...body }, idempotencyKey);
    await this.log(actorId, 'gallery.create', { type: 'gallery', id: g.id, label: g.title }, `گالری «${g.title}» در جلسهٔ «${this.sessions.ref(id).title}» ساخته شد.`, { sessionId: id, occurrenceId: g.occurrenceId, kind: g.kind, visibility: g.visibility });
    return g;
  }

  async updateGallery(actorId: string, id: string, galleryId: string, body: z.infer<typeof midTypes.UpdateGalleryBody>) {
    const g = await this.mid.patchGallery(id, galleryId, { actorId, ...body });
    await this.log(actorId, 'gallery.update', { type: 'gallery', id: galleryId, label: g.title }, `گالری «${g.title}» ویرایش شد.`, { sessionId: id, fields: Object.keys(body), visibility: g.visibility });
    return g;
  }

  async deleteGallery(actorId: string, id: string, galleryId: string): Promise<void> {
    await this.mid.deleteGallery(id, galleryId, actorId);
    await this.log(actorId, 'gallery.delete', { type: 'gallery', id: galleryId, label: 'گالری' }, `گالری از جلسهٔ «${this.sessions.ref(id).title}» حذف شد.`, { sessionId: id });
  }

  /** `url` آیتم ⇒ مسیر H-117 امضاشده برای همین ادمین (۱۰ دقیقه؛ docs-v2/31 §۴) */
  private withUrl(sessionId: string, galleryId: string, it: GalleryItem, userId: string): GalleryItem {
    return { ...it, url: this.media.sign(contentPath(sessionId, galleryId, it.id), userId) };
  }

  async items(userId: string, id: string, galleryId: string, query: Query): Promise<Paged<GalleryItem>> {
    const r = await this.mid.galleryItems(id, galleryId, query);
    return { ...r, items: r.items.map((it) => this.withUrl(id, galleryId, it, userId)) };
  }

  /**
   * H-115: بدنهٔ خام بدون بافر به mid stream می‌شود (Content-Type/Content-Length اصلی). نوع/طول کلی را guard بررسی کرده؛
   * سقف ۵MB تصویر پیش از ارسال حتی یک بایت. magic bytes/EXIF/سهمیه را mid (مالک فایل) اعمال می‌کند.
   */
  async upload(actorId: string, id: string, galleryId: string, query: z.infer<typeof midTypes.UploadItemQuery>, req: IsraRequest, idempotencyKey?: string) {
    const contentType = (req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    const contentLength = Number(req.header('content-length'));
    if (IMAGE_TYPES.has(contentType) && contentLength > midTypes.GALLERY_IMAGE_MAX_BYTES) throw new AppError('PAYLOAD_TOO_LARGE', { details: { maxBytes: midTypes.GALLERY_IMAGE_MAX_BYTES } });
    const it = await this.mid.uploadGalleryItem(id, galleryId, { actorId, title: query.title }, req, { contentType, contentLength, idempotencyKey });
    await this.log(actorId, 'gallery.upload', { type: 'gallery', id: galleryId, label: 'گالری' }, `فایل در گالری جلسهٔ «${this.sessions.ref(id).title}» بارگذاری شد.`, { sessionId: id, itemId: it.id, mime: it.mime, bytes: it.bytes });
    return this.withUrl(id, galleryId, it, actorId);
  }

  async deleteItem(actorId: string, id: string, galleryId: string, itemId: string): Promise<void> {
    await this.mid.deleteGalleryItem(id, galleryId, itemId, actorId);
    await this.log(actorId, 'gallery.item_delete', { type: 'gallery', id: galleryId, label: 'گالری' }, `فایل گالری جلسهٔ «${this.sessions.ref(id).title}» حذف شد.`, { sessionId: id, itemId });
  }

  /**
   * H-117: stream محتوا از mid. Range/If-None-Match/If-Range عبور می‌کند (۲۰۶/۳۰۴/۴۱۶ همان‌طور)؛ هدرها فقط از allowlist؛
   * Content-Type فقط از انواع مجاز گالری (وگرنه octet-stream)؛ `nosniff`، `inline`، `Cache-Control: private` و `no-referrer`.
   */
  async content(id: string, galleryId: string, itemId: string, req: IsraRequest, res: Response): Promise<void> {
    const fwd: Record<string, string> = {};
    for (const h of ['range', 'if-none-match', 'if-range'] as const) {
      const v = req.header(h);
      if (v && v.length <= 200) fwd[h] = v;
    }
    const up = await this.mid.galleryItemContent(id, galleryId, itemId, fwd);
    const status = up.statusCode ?? 200;
    res.status(status);
    for (const h of PASS_HEADERS) {
      const v = up.headers[h];
      if (typeof v === 'string') res.setHeader(h, v);
    }
    const ct = String(up.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
    if (status !== 304) res.setHeader('Content-Type', MEDIA_TYPES.has(ct) ? ct : 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Referrer-Policy', 'no-referrer');
    await new Promise<void>((resolve) => {
      const finish = () => resolve();
      up.on('error', () => (res.destroy(), finish()));
      res.on('close', () => (up.destroy(), finish()));
      res.on('finish', finish);
      up.pipe(res);
    });
  }

  // ───────── کامنت (H-118..H-120) ─────────
  comments(id: string, query: Query) {
    return this.mid.comments(id, query);
  }

  async moderateComment(actorId: string, id: string, commentId: string, hidden: boolean) {
    const c = await this.mid.moderateComment(id, commentId, { actorId, hidden });
    await this.log(actorId, 'comment.moderate', { type: 'comment', id: commentId, label: 'کامنت' }, `کامنتی در جلسهٔ «${this.sessions.ref(id).title}» ${hidden ? 'پنهان' : 'آشکار'} شد.`, { sessionId: id, hidden, authorId: c.author.id });
    return c;
  }

  async deleteComment(actorId: string, id: string, commentId: string): Promise<void> {
    await this.mid.deleteComment(id, commentId, actorId);
    await this.log(actorId, 'comment.delete', { type: 'comment', id: commentId, label: 'کامنت' }, `کامنتی از جلسهٔ «${this.sessions.ref(id).title}» حذف شد.`, { sessionId: id });
  }
}
