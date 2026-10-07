import { Controller, Req } from '@nestjs/common';
import type { z } from 'zod';
import { type high, mid } from '@isra/api-types';
import { In, Route } from '../common/ep';
import { originIdempotencyKey as okey } from '../common/idempotency.interceptor';
import type { IsraRequest } from '../common/request-context';
import { AnnouncementsService } from './announcements.service';
import { BadgesService } from './badges/badges.service';

type Page = { page: number; pageSize: number };
type Id = { id: string };
type B<K extends keyof typeof high> = (typeof high)[K] extends z.ZodType ? z.infer<(typeof high)[K]> : never;
const uid = (r: IsraRequest) => r.user!.userId;

type SessionRole = z.infer<typeof mid.SessionRole>;
type SessionPermission = z.infer<typeof mid.Permission>;
const ROLE_TITLES: Record<SessionRole, string> = { session_manager: 'مدیر جلسه', session_supporter: 'پشتیبان', teacher: 'معلم', quran_student: 'قرآن‌آموز' };
const PERMISSION_TITLES: Record<SessionPermission, string> = {
  'session.edit': 'ویرایش جلسه',
  'session.transition': 'تغییر وضعیت جلسه',
  'membership.approve': 'تأیید یا رد درخواست عضویت',
  'membership.roles': 'تعیین نقش اعضا',
  'queue.manage': 'مدیریت صف نوبت',
  'eval.submit': 'ثبت ارزیابی',
  'attendance.view': 'دیدن حضور',
  'attendance.manage': 'ثبت حضور و غیاب',
  'occurrence.manage': 'باز و بستن نوبت برگزاری'
};
/** H-48: ماتریس ثابت از منبع حقیقت مشترک (`SESSION_ROLE_PERMISSIONS` در api-types) */
export const SESSION_ROLES_MATRIX: B<'SessionRolesMatrix'> = {
  roles: (Object.keys(mid.SESSION_ROLE_PERMISSIONS) as SessionRole[]).map((key) => ({ key, title: ROLE_TITLES[key], permissions: [...mid.SESSION_ROLE_PERMISSIONS[key]] as SessionPermission[] })),
  permissions: mid.Permission.options.map((key) => ({ key, title: PERMISSION_TITLES[key] }))
};

/** ۱.۶.۰ (docs-v2/30): نشان‌ها، پیام همگانی، ماتریس نقش جلسه. مجوز/step-up/اعتبارسنجی در EndpointGuard. */
@Controller()
export class OpsController {
  constructor(
    private readonly badges: BadgesService,
    private readonly announcements: AnnouncementsService
  ) {}

  @Route('H-32')
  listBadges(@In() { query }: { query: Page }) {
    return this.badges.list(query.page, query.pageSize);
  }
  @Route('H-33')
  createBadge(@Req() r: IsraRequest, @In() { body }: { body: B<'CreateBadgeBody'> }) {
    return this.badges.create(uid(r), body);
  }
  @Route('H-34')
  updateBadge(@Req() r: IsraRequest, @In() { params, body }: { params: Id; body: B<'UpdateBadgeBody'> }) {
    return this.badges.update(uid(r), params.id, body);
  }
  @Route('H-35')
  deleteBadge(@Req() r: IsraRequest, @In() { params }: { params: Id }) {
    return this.badges.remove(uid(r), params.id);
  }
  @Route('H-36')
  setBadgeImage(@Req() r: IsraRequest, @In() { params, body }: { params: Id; body: B<'BadgeImageBody'> }) {
    return this.badges.setImage(uid(r), params.id, body);
  }
  @Route('H-37')
  clearBadgeImage(@Req() r: IsraRequest, @In() { params }: { params: Id }) {
    return this.badges.clearImage(uid(r), params.id);
  }

  @Route('H-41')
  sendAnnouncement(@Req() r: IsraRequest, @In() { body }: { body: B<'CreateAnnouncementBody'> }) {
    return this.announcements.create(uid(r), body, okey(r, 'H-41', 'mid'));
  }
  @Route('H-42')
  listAnnouncements(@In() { query }: { query: Page }) {
    return this.announcements.list(query.page, query.pageSize);
  }
  @Route('H-46')
  getAnnouncement(@In() { params }: { params: Id }) {
    return this.announcements.get(params.id);
  }

  @Route('H-48')
  sessionRoles() {
    return SESSION_ROLES_MATRIX;
  }
}
