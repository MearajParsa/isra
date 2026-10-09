import { Controller, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import { mid } from '@isra/api-types';
import { In, Route } from '../common/ep';
import type { IsraRequest } from '../common/request-context';
import { CatalogService } from './catalog.service';
import { CommentsService } from './comments.service';
import { GalleriesService, type Viewer } from './galleries.service';
import { SupportersService } from './supporters.service';

type Page = { page: number; pageSize: number };
type Id = { params: { id: string } };
type Gal = { params: { id: string; galleryId: string } };
type Item = { params: { id: string; galleryId: string; itemId: string } };
type Occ = { params: { id: string; occurrenceId: string } };
const uid = (r: IsraRequest) => r.user!.userId;
const viewer = (r: IsraRequest): Viewer => ({ userId: r.user!.userId, perms: r.user!.perms });

/**
 * ۱.۷.۰ (docs-v2/31): معیار ارزیابی، پشتیبان‌ها، گالری (بارگذاری خام/محتوای امضاشده) و کامنت.
 * مسیر/اعتبارسنجی از قرارداد (`@Route`)؛ مجوزهای درون‌جلسه در سرویس‌ها از DB.
 */
@Controller()
export class ContentController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly supporters: SupportersService,
    private readonly galleries: GalleriesService,
    private readonly comments: CommentsService
  ) {}

  // ───── معیار و کاتالوگ مجوز ─────
  @Route('M-45')
  async criteria() {
    const a = await this.catalog.activeCriteria();
    return { version: a.version, items: a.items.map((c) => ({ id: c.id, key: c.key, title: c.title, description: c.description, weight: c.weight, maxScore: c.maxScore, sortOrder: c.sortOrder })) };
  }

  @Route('M-68')
  permissionCatalog() {
    return { permissions: mid.SESSION_DELEGABLE_PERMISSIONS.map((p) => ({ key: p.key, title: p.title })) };
  }

  // ───── پشتیبان ثابت استاد ─────
  @Route('M-60')
  mySupporters(@Req() r: IsraRequest, @In() { query }: { query: Page }) {
    return this.supporters.listTeacher(uid(r), query.page, query.pageSize);
  }

  @Route('M-61')
  addMySupporter(@Req() r: IsraRequest, @In() { body }: { body: z.infer<typeof mid.AddSupporterBody> }) {
    return this.supporters.setTeacher(uid(r), body.user, body.permissions, { actorId: uid(r), mode: 'create' });
  }

  @Route('M-62')
  patchMySupporter(@Req() r: IsraRequest, @In() { params, body }: { params: { userId: string }; body: z.infer<typeof mid.SupporterPermissionsBody> }) {
    return this.supporters.patchTeacher(uid(r), params.userId, body.permissions);
  }

  @Route('M-63')
  removeMySupporter(@Req() r: IsraRequest, @In() { params }: { params: { userId: string } }) {
    return this.supporters.removeTeacher(uid(r), params.userId);
  }

  // ───── پشتیبان جلسه ─────
  @Route('M-64')
  sessionSupporters(@Req() r: IsraRequest, @In() { params, query }: Id & { query: Page }) {
    return this.supporters.listSession(uid(r), params.id, query.page, query.pageSize);
  }

  @Route('M-65')
  addSessionSupporter(@Req() r: IsraRequest, @In() { params, body }: Id & { body: z.infer<typeof mid.AddSupporterBody> }) {
    return this.supporters.addSession(uid(r), params.id, body.user, body.permissions);
  }

  @Route('M-66')
  patchSessionSupporter(@Req() r: IsraRequest, @In() { params, body }: { params: { id: string; userId: string }; body: z.infer<typeof mid.SupporterPermissionsBody> }) {
    return this.supporters.patchSession(uid(r), params.id, params.userId, body.permissions);
  }

  @Route('M-67')
  removeSessionSupporter(@Req() r: IsraRequest, @In() { params }: { params: { id: string; userId: string } }) {
    return this.supporters.removeSession(uid(r), params.id, params.userId);
  }

  // ───── گالری ─────
  @Route('M-70')
  galleriesOf(@Req() r: IsraRequest, @In() { params, query }: Occ & { query: Page }) {
    return this.galleries.list(viewer(r), params.id, params.occurrenceId, query.page, query.pageSize);
  }

  @Route('M-71')
  createGallery(@Req() r: IsraRequest, @In() { params, body }: Occ & { body: z.infer<typeof mid.CreateGalleryBody> }) {
    return this.galleries.create(uid(r), params.id, params.occurrenceId, body);
  }

  @Route('M-72')
  updateGallery(@Req() r: IsraRequest, @In() { params, body }: Gal & { body: z.infer<typeof mid.UpdateGalleryBody> }) {
    return this.galleries.update(uid(r), params.id, params.galleryId, body);
  }

  @Route('M-73')
  removeGallery(@Req() r: IsraRequest, @In() { params }: Gal) {
    return this.galleries.remove(uid(r), params.id, params.galleryId);
  }

  @Route('M-74')
  galleryItems(@Req() r: IsraRequest, @In() { params, query }: Gal & { query: Page }) {
    return this.galleries.items(viewer(r), params.id, params.galleryId, query.page, query.pageSize);
  }

  /** بدنهٔ خام stream می‌شود؛ خطا پیش از خواندن کامل بدنه ⇒ Connection: close (بدنهٔ ناخوانده دور ریخته نشود در keep-alive) */
  @Route('M-75')
  async upload(@Req() r: IsraRequest, @Res({ passthrough: true }) res: Response, @In() { params, query }: Gal & { query: { title?: string } }) {
    try {
      return await this.galleries.upload({ userId: uid(r), admin: false }, params.id, params.galleryId, r, query.title);
    } catch (e) {
      if (!r.readableEnded) res.setHeader('Connection', 'close');
      throw e;
    }
  }

  @Route('M-76')
  removeItem(@Req() r: IsraRequest, @In() { params }: Item) {
    return this.galleries.removeItem(uid(r), params.id, params.galleryId, params.itemId);
  }

  @Route('M-77')
  async content(@Req() r: IsraRequest, @Res() res: Response, @In() { params }: Item) {
    await this.galleries.content({ ...viewer(r), signed: !!r.user!.signed }, params.id, params.galleryId, params.itemId, r, res);
  }

  @Route('M-78')
  publicGalleries(@In() { params, query }: Id & { query: Page & { occurrenceId?: string } }) {
    return this.galleries.publicList(params.id, query.occurrenceId, query.page, query.pageSize);
  }

  @Route('M-79')
  async publicContent(@Req() r: IsraRequest, @Res() res: Response, @In() { params }: { params: { galleryId: string; itemId: string } }) {
    await this.galleries.publicContent(params.galleryId, params.itemId, r, res);
  }

  // ───── کامنت ─────
  @Route('M-80')
  commentsOf(@Req() r: IsraRequest, @In() { params, query }: Occ & { query: z.infer<typeof mid.CommentsQuery> }) {
    return this.comments.list(uid(r), params.id, params.occurrenceId, query);
  }

  @Route('M-81')
  createComment(@Req() r: IsraRequest, @In() { params, body }: Occ & { body: z.infer<typeof mid.CreateCommentBody> }) {
    return this.comments.create(uid(r), params.id, params.occurrenceId, body);
  }

  @Route('M-82')
  removeComment(@Req() r: IsraRequest, @In() { params }: { params: { id: string; commentId: string } }) {
    return this.comments.remove(uid(r), params.id, params.commentId);
  }

  @Route('M-83')
  moderateComment(@Req() r: IsraRequest, @In() { params, body }: { params: { id: string; commentId: string }; body: z.infer<typeof mid.ModerateCommentBody> }) {
    return this.comments.moderate(uid(r), params.id, params.commentId, body.hidden);
  }
}
