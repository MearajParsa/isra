import { Controller, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import type { high, mid } from '@isra/api-types';
import { In, Route } from '../common/ep';
import { originIdempotencyKey as okey } from '../common/idempotency.interceptor';
import type { IsraRequest } from '../common/request-context';
import { CriteriaService } from './criteria/criteria.service';
import { SessionContentService } from './session-content.service';

type Page = { page: number; pageSize: number };
type Id = { id: string };
type B<K extends keyof typeof high> = (typeof high)[K] extends z.ZodType ? z.infer<(typeof high)[K]> : never;
type M<K extends keyof typeof mid> = (typeof mid)[K] extends z.ZodType ? z.infer<(typeof mid)[K]> : never;
type Gal = Id & { galleryId: string };
const uid = (r: IsraRequest) => r.user!.userId;

/**
 * ۱.۷.۰ (docs-v2/31): معیارهای ارزیابی (H-100..H-103)، پشتیبان‌ها (H-104..H-109)، گالری (H-110..H-117) و کامنت (H-118..H-120).
 * مجوز/step-up/اعتبارسنجی (و بدنهٔ خام H-115، URL امضاشدهٔ H-117) در EndpointGuard.
 */
@Controller()
export class ContentController {
  constructor(
    private readonly criteria: CriteriaService,
    private readonly content: SessionContentService
  ) {}

  // ───────── معیارهای ارزیابی ─────────
  @Route('H-100')
  listCriteria() {
    return this.criteria.list();
  }
  @Route('H-101')
  createCriterion(@Req() r: IsraRequest, @In() { body }: { body: B<'CreateCriterionBody'> }) {
    return this.criteria.create(uid(r), body);
  }
  @Route('H-102')
  updateCriterion(@Req() r: IsraRequest, @In() { params, body }: { params: Id; body: B<'UpdateCriterionBody'> }) {
    return this.criteria.update(uid(r), params.id, body);
  }
  @Route('H-103')
  deleteCriterion(@Req() r: IsraRequest, @In() { params }: { params: Id }) {
    return this.criteria.remove(uid(r), params.id);
  }

  // ───────── پشتیبان‌ها ─────────
  @Route('H-104')
  teacherSupporters(@In() { params, query }: { params: Id; query: Page }) {
    return this.content.teacherSupporters(params.id, query);
  }
  @Route('H-105')
  setTeacherSupporter(@Req() r: IsraRequest, @In() { params, body }: { params: Id & { supporterId: string }; body: M<'SupporterPermissionsBody'> }) {
    return this.content.setTeacherSupporter(uid(r), params.id, params.supporterId, body.permissions);
  }
  @Route('H-106')
  async removeTeacherSupporter(@Req() r: IsraRequest, @In() { params }: { params: Id & { supporterId: string } }) {
    await this.content.removeTeacherSupporter(uid(r), params.id, params.supporterId);
    return {};
  }
  @Route('H-107')
  sessionSupporters(@In() { params, query }: { params: Id; query: Page }) {
    return this.content.sessionSupporters(params.id, query);
  }
  @Route('H-108')
  setSessionSupporter(@Req() r: IsraRequest, @In() { params, body }: { params: Id & { userId: string }; body: M<'SupporterPermissionsBody'> }) {
    return this.content.setSessionSupporter(uid(r), params.id, params.userId, body.permissions);
  }
  @Route('H-109')
  async removeSessionSupporter(@Req() r: IsraRequest, @In() { params }: { params: Id & { userId: string } }) {
    await this.content.removeSessionSupporter(uid(r), params.id, params.userId);
    return {};
  }

  // ───────── گالری ─────────
  @Route('H-110')
  galleries(@In() { params, query }: { params: Id; query: Page & { occurrenceId?: string } }) {
    return this.content.galleries(params.id, query);
  }
  @Route('H-111')
  createGallery(@Req() r: IsraRequest, @In() { params, body }: { params: Id; body: B<'AdminCreateGalleryBody'> }) {
    return this.content.createGallery(uid(r), params.id, body, okey(r, 'H-111', 'mid'));
  }
  @Route('H-112')
  updateGallery(@Req() r: IsraRequest, @In() { params, body }: { params: Gal; body: M<'UpdateGalleryBody'> }) {
    return this.content.updateGallery(uid(r), params.id, params.galleryId, body);
  }
  @Route('H-113')
  async deleteGallery(@Req() r: IsraRequest, @In() { params }: { params: Gal }) {
    await this.content.deleteGallery(uid(r), params.id, params.galleryId);
    return {};
  }
  @Route('H-114')
  items(@Req() r: IsraRequest, @In() { params, query }: { params: Gal; query: Page }) {
    return this.content.items(uid(r), params.id, params.galleryId, query);
  }
  @Route('H-115')
  upload(@Req() r: IsraRequest, @In() { params, query }: { params: Gal; query: z.infer<typeof mid.UploadItemQuery> }) {
    return this.content.upload(uid(r), params.id, params.galleryId, query, r, okey(r, 'H-115', 'mid'));
  }
  @Route('H-116')
  async deleteItem(@Req() r: IsraRequest, @In() { params }: { params: Gal & { itemId: string } }) {
    await this.content.deleteItem(uid(r), params.id, params.galleryId, params.itemId);
    return {};
  }
  /** پاسخ خام stream‌شده (@Res): Envelope/Cache این endpoint را handler می‌نویسد */
  @Route('H-117')
  content_(@Req() r: IsraRequest, @Res() res: Response, @In() { params }: { params: Gal & { itemId: string } }) {
    return this.content.content(params.id, params.galleryId, params.itemId, r, res);
  }

  // ───────── کامنت ─────────
  @Route('H-118')
  comments(@In() { params, query }: { params: Id; query: Page & Record<string, string | number | undefined> }) {
    return this.content.comments(params.id, query);
  }
  @Route('H-119')
  moderateComment(@Req() r: IsraRequest, @In() { params, body }: { params: Id & { commentId: string }; body: M<'ModerateCommentBody'> }) {
    return this.content.moderateComment(uid(r), params.id, params.commentId, body.hidden);
  }
  @Route('H-120')
  async deleteComment(@Req() r: IsraRequest, @In() { params }: { params: Id & { commentId: string } }) {
    await this.content.deleteComment(uid(r), params.id, params.commentId);
    return {};
  }
}
