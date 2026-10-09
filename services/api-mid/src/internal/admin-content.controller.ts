import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { HEADERS, internal } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { isUuid } from '../common/ids';
import type { IsraRequest } from '../common/request-context';
import { CommentsService } from '../domain/comments.service';
import { GalleriesService, mediaType } from '../domain/galleries.service';
import { InternalGuard } from './internal.guard';
import { InternalCallers, InternalRoute } from './internal-auth';
import { internalIdempotent } from './internal-idempotency';

const R = internal.MID_ADMIN;
const id = (v: string): string => {
  if (!isUuid(v)) throw new AppError('NOT_FOUND');
  return v;
};
const ok = (data: unknown) => ({ success: true, data });
const okList = (r: { items: unknown[]; page: number; pageSize: number; total: number }) => ({ success: true, data: r.items, meta: { page: r.page, pageSize: r.pageSize, total: r.total } });

/**
 * MID_ADMIN ۱.۷.۰ (docs-v2/31): گالری و کامنت برای H-110..H-120. فقط api-high؛ مجوز/audit در high.
 * بارگذاری: بدنهٔ خام stream‌شده از high (قواعد M-75)؛ محتوا: stream با عبور Range/If-None-Match.
 * GalleryItem.url در این پاسخ‌ها خالی است (high نشانی H-117 را با کلید خودش امضا می‌کند).
 */
@Controller('o/internal/v1')
@InternalRoute()
@UseGuards(InternalGuard)
export class AdminContentController {
  constructor(
    private readonly galleries: GalleriesService,
    private readonly comments: CommentsService,
    private readonly ds: DataSource,
    private readonly clock: Clock
  ) {}

  @InternalCallers('high')
  @Get(R.galleries)
  async list(@Param('id') sid: string, @Query() raw: unknown) {
    const q = internal.MidAdminGalleriesQuery.parse(raw);
    return okList(await this.galleries.adminList(id(sid), q.occurrenceId, q.page, q.pageSize));
  }

  @InternalCallers('high')
  @Post(R.galleries)
  @HttpCode(200)
  async create(@Param('id') sid: string, @Body() raw: unknown, @Headers(HEADERS.idempotencyKey.toLowerCase()) key?: string) {
    const b = internal.MidAdminCreateGallery.parse(raw);
    const sessionId = id(sid);
    return ok(await internalIdempotent(this.ds, this.clock, `galleries:${sessionId}`, key, b, () => this.galleries.adminCreate(sessionId, b)));
  }

  @InternalCallers('high')
  @Patch(R.gallery)
  @HttpCode(200)
  async update(@Param('id') sid: string, @Param('galleryId') gid: string, @Body() raw: unknown) {
    const { actorId: _a, ...b } = internal.MidAdminPatchGallery.parse(raw);
    return ok(await this.galleries.adminUpdate(id(sid), gid, b));
  }

  @InternalCallers('high')
  @Delete(R.gallery)
  @HttpCode(200)
  async remove(@Param('id') sid: string, @Param('galleryId') gid: string, @Query() raw: unknown) {
    internal.MidAdminActorQuery.parse(raw);
    return ok(await this.galleries.adminRemove(id(sid), gid));
  }

  @InternalCallers('high')
  @Get(R.galleryItems)
  async items(@Param('id') sid: string, @Param('galleryId') gid: string, @Query() raw: unknown) {
    const q = internal.MidAdminGalleryItemsQuery.parse(raw);
    return okList(await this.galleries.adminItems(id(sid), gid, q.page, q.pageSize));
  }

  /** بدنهٔ خام (Content-Type و Content-Length اصلی)؛ ?actorId&title */
  @InternalCallers('high')
  @Post(R.galleryItems)
  @HttpCode(200)
  async upload(@Param('id') sid: string, @Param('galleryId') gid: string, @Query() raw: unknown, @Req() req: IsraRequest, @Res({ passthrough: true }) res: Response, @Headers(HEADERS.idempotencyKey.toLowerCase()) key?: string) {
    try {
      const q = internal.MidAdminUploadQuery.parse(raw);
      const type = mediaType(req.header('content-type'));
      if (!type.includes('/')) throw new AppError('UNSUPPORTED_MEDIA_TYPE');
      const sessionId = id(sid);
      // retry high با همان کلید ⇒ همان آیتم (بدنهٔ تکراری خوانده نمی‌شود؛ اتصال بسته می‌شود)
      const fp = { gid, q, type, len: req.header('content-length') ?? '' };
      const r = await internalIdempotent(this.ds, this.clock, `upload:${sessionId}`, key, fp, () => this.galleries.upload({ userId: q.actorId, admin: true }, sessionId, gid, req, q.title));
      if (!req.readableEnded) res.setHeader('Connection', 'close');
      return ok(r);
    } catch (e) {
      if (!req.readableEnded) res.setHeader('Connection', 'close');
      throw e;
    }
  }

  @InternalCallers('high')
  @Delete(R.galleryItem)
  @HttpCode(200)
  async removeItem(@Param('id') sid: string, @Param('galleryId') gid: string, @Param('itemId') iid: string, @Query() raw: unknown) {
    internal.MidAdminActorQuery.parse(raw);
    return ok(await this.galleries.adminRemoveItem(id(sid), gid, iid));
  }

  @InternalCallers('high')
  @Get(R.galleryItemContent)
  async content(@Param('id') sid: string, @Param('galleryId') gid: string, @Param('itemId') iid: string, @Req() req: IsraRequest, @Res() res: Response) {
    await this.galleries.adminContent(id(sid), gid, iid, req, res);
  }

  // ───── کامنت ─────
  @InternalCallers('high')
  @Get(R.comments)
  async commentsList(@Param('id') sid: string, @Query() raw: unknown) {
    return okList(await this.comments.adminList(id(sid), internal.MidAdminCommentsQuery.parse(raw)));
  }

  @InternalCallers('high')
  @Patch(R.comment)
  @HttpCode(200)
  async moderate(@Param('id') sid: string, @Param('commentId') cid: string, @Body() raw: unknown) {
    const b = internal.MidAdminModerateComment.parse(raw);
    return ok(await this.comments.adminModerate(id(sid), cid, b.hidden, b.actorId));
  }

  @InternalCallers('high')
  @Delete(R.comment)
  @HttpCode(200)
  async removeComment(@Param('id') sid: string, @Param('commentId') cid: string, @Query() raw: unknown) {
    const q = internal.MidAdminActorQuery.parse(raw);
    return ok(await this.comments.adminRemove(id(sid), cid, q.actorId));
  }
}
