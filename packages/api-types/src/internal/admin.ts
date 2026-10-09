import { z } from 'zod';
import { IranMobile, IsoDateTime, PersonName, Uuid } from '../core/primitives';
import { SessionInput } from '../domain/session';
import {
  AttendanceEntry,
  Evaluation,
  EvaluationScores,
  QueueState,
  AddMemberOutcome,
  SessionRole,
  MarkAttendanceResult,
  RevokeAttendanceResult,
  QueueActBody,
  Comment,
  Gallery,
  GalleryItem,
  ModerateCommentBody,
  SessionSupporter,
  SupporterPermissions,
  SupportersQuery,
  TeacherSupporter,
  UpdateGalleryBody,
  UploadItemQuery,
  GalleryItemsQuery
} from '../mid/schemas';
import {
  AdminCommentsQuery,
  AdminCreateGalleryBody,
  AdminGalleriesQuery,
  AdminMember,
  AdminSession,
  AnonPhone,
  IsoDate,
  UserStatus,
  UserMembership,
  UserMembershipsQuery
} from '../high/schemas';
import { TransitionBody } from '../mid/schemas';
import { Occurrence } from '../domain/session';
import { PointsLedgerItem, PointsSummary } from '../domain/points';

const Count = z.number().int().min(0);
const Interval = z.enum(['day', 'week', 'month']);

/** مسیرها نسبت به پیشوند سرویس: low `/c/internal/v1`، mid `/o/internal/v1` */
export const LOW_ADMIN = {
  users: '/admin/users',
  user: '/admin/users/:id',
  status: '/admin/users/:id/status',
  password: '/admin/users/:id/password',
  changePassword: '/admin/users/:id/change-password',
  sessions: '/admin/users/:id/sessions',
  session: '/admin/users/:id/sessions/:sessionId',
  logoutAll: '/admin/users/:id/logout-all',
  reportOtp: '/admin/reports/otp',
  reportClients: '/admin/reports/clients',
  reportUsers: '/admin/reports/users',
  /** ۱.۶.۰ */
  usersBulk: '/admin/users/bulk',
  broadcast: '/admin/broadcasts/:id'
} as const;

/**
 * ۱.۶.۰: مسیرهای internal عمومی low (نه فقط high). پیشوند `/c/internal/v1`.
 * resolve: فراخوان‌ها mid و high (ACL `@InternalCallers('mid','high')`)؛ فقط POST تا شماره در URL/لاگ دسترسی نیاید.
 */
export const LOW_INTERNAL = {
  resolveUsers: '/users/resolve'
} as const;

/**
 * ۱.۶.۰: مسیرهای internal high برای low (پیشوند `/s/internal/v1`) — تصویر نشان (باینری؛ ACL فقط low).
 */
export const HIGH_INTERNAL = {
  badgeImage: '/badges/:id/image'
} as const;

/** ۱.۶.۰: مسیرهای internal mid برای low (پیشوند `/o/internal/v1`؛ ACL فقط low) */
export const MID_FOR_LOW = {
  pointsLedger: '/users/:id/points/ledger'
} as const;

export const MID_ADMIN = {
  sessions: '/admin/sessions',
  session: '/admin/sessions/:id',
  transition: '/admin/sessions/:id/transition',
  members: '/admin/sessions/:id/members',
  member: '/admin/sessions/:id/members/:memberId',
  attendance: '/admin/sessions/:id/attendance',
  queue: '/admin/sessions/:id/queue',
  evaluations: '/admin/sessions/:id/evaluations',
  userSummary: '/admin/users/:id/summary',
  reportOverview: '/admin/reports/overview',
  reportSessions: '/admin/reports/sessions',
  reportLeaderboard: '/admin/reports/leaderboard',
  /** ۱.۶.۰ (docs-v2/30) */
  membersAdd: '/admin/sessions/:id/members/add',
  membersDecide: '/admin/sessions/:id/members/decide',
  occurrences: '/admin/sessions/:id/occurrences',
  attendanceMark: '/admin/sessions/:id/attendance/mark',
  attendanceRevoke: '/admin/sessions/:id/attendance/:userId/revoke',
  queueNext: '/admin/sessions/:id/queue/next',
  queueItem: '/admin/sessions/:id/queue/:itemId',
  evaluation: '/admin/sessions/:id/evaluations/:evalId',
  evaluationVoid: '/admin/sessions/:id/evaluations/:evalId/void',
  notify: '/admin/sessions/:id/notify',
  userMemberships: '/admin/users/:id/memberships',
  userPoints: '/admin/users/:id/points',
  pointsAdjust: '/admin/users/:id/points/adjust',
  badgeHolders: '/admin/badges/holders',
  /**
   * ۱.۷.۰ (docs-v2/31). حذف‌شده: `memberRoles` (H-68) و `manager` (⇒ `owner`).
   * DELETEها شناسهٔ ادمین را در query می‌فرستند (`?actorId=`؛ MidAdminActorQuery).
   */
  owner: '/admin/sessions/:id/owner',
  sessionOwners: '/admin/session-owners',
  teacherSupporters: '/admin/users/:id/supporters',
  teacherSupporter: '/admin/users/:id/supporters/:supporterId',
  supporters: '/admin/sessions/:id/supporters',
  supporter: '/admin/sessions/:id/supporters/:userId',
  galleries: '/admin/sessions/:id/galleries',
  gallery: '/admin/sessions/:id/galleries/:galleryId',
  galleryItems: '/admin/sessions/:id/galleries/:galleryId/items',
  galleryItem: '/admin/sessions/:id/galleries/:galleryId/items/:itemId',
  galleryItemContent: '/admin/sessions/:id/galleries/:galleryId/items/:itemId/content',
  comments: '/admin/sessions/:id/comments',
  comment: '/admin/sessions/:id/comments/:commentId'
} as const;

// ───────────────────────── low (مالک حساب) ─────────────────────────
export const LowAdminUser = z.object({
  id: Uuid,
  phone: IranMobile.or(AnonPhone).meta({ description: 'برای کاربر حذف‌شده مقدار ناشناس (`d` + ۱۰ هگز)' }),
  firstName: z.string().max(40),
  lastName: z.string().max(40),
  status: UserStatus,
  hasPassword: z.boolean(),
  mustChangePassword: z.boolean(),
  createdAt: IsoDateTime,
  lastActiveAt: IsoDateTime.nullable(),
  activeSessions: Count,
  sessionsByClient: z.record(z.string(), Count)
});
export type LowAdminUser = z.infer<typeof LowAdminUser>;

/** POST LOW_ADMIN.users — کاربر با شمارهٔ تکراری ⇒ 409 CONFLICT reason=PHONE_TAKEN. `password` ⇒ mustChangePassword=true */
export const LowAdminCreateUser = z.object({ phone: IranMobile, firstName: PersonName, lastName: PersonName, password: z.string().min(8).max(128).optional() }).strict();
/** PATCH LOW_ADMIN.user — تغییر شماره ⇒ رویداد user.phone.changed؛ تغییر نام ⇒ user.profile.updated */
export const LowAdminUpdateUser = z
  .object({ firstName: PersonName.optional(), lastName: PersonName.optional(), phone: IranMobile.optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'دست‌کم یک فیلد لازم است.' });
/** POST LOW_ADMIN.status — disabled ⇒ همهٔ نشست‌ها revoke؛ رویداد user.status.changed */
export const LowAdminStatus = z.object({ status: z.enum(['active', 'disabled']) }).strict();
/** PUT LOW_ADMIN.password — set ⇒ mustChangePassword=true + revoke نشست‌ها؛ clear ⇒ بدون رمز */
export const LowAdminPassword = z.discriminatedUnion('action', [
  z.object({ action: z.literal('set'), password: z.string().min(8).max(128) }).strict(),
  z.object({ action: z.literal('clear') }).strict()
]);
/**
 * POST LOW_ADMIN.changePassword — تغییر رمز خود کاربر (high پیش‌تر step-up را محلی تأیید کرده یا حالت mustChange است).
 * `verified='stepup'` ⇒ low فقط رمز را می‌گذارد؛ `verified='current'` ⇒ low `currentPassword` را با argon2 تطبیق می‌دهد (خطا ⇒ 401 AUTH_INVALID_CREDENTIALS).
 * پس از موفقیت: mustChangePassword=false و سایر نشست‌ها revoke (به‌جز `keepSessionId`).
 */
export const LowAdminChangePassword = z
  .object({ newPassword: z.string().min(8).max(128), verified: z.enum(['stepup', 'current']), currentPassword: z.string().min(1).max(128).optional(), keepSessionId: Uuid.optional() })
  .strict();
export const LowAdminSession = z.object({
  id: Uuid,
  deviceLabel: z.string().max(80),
  platform: z.enum(['web', 'android']),
  client: z.string().max(24).nullable(),
  ip: z.string().max(45),
  createdAt: IsoDateTime,
  lastActiveAt: IsoDateTime,
  revokedAt: IsoDateTime.nullable()
});
export const LowAdminSessionsQuery = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20), activeOnly: z.enum(['true', 'false']).default('false') });
export const LowAdminRangeQuery = z.object({ from: IsoDate, to: IsoDate, interval: Interval.default('day') });
export const LowAdminOtpSeries = z.object({ interval: Interval, items: z.array(z.object({ bucket: IsoDate, requested: Count, verified: Count, failed: Count.optional().meta({ description: '۱.۶.۰: ارسال پیامک ناموفق' }) })) });
export const LowAdminClients = z.object({ items: z.array(z.object({ client: z.string().max(24), activeSessions: Count })) });
/** GET LOW_ADMIN.reportUsers?from&to — شمارش‌های حساب (منبع حقیقت low) */
export const LowAdminUsersReport = z.object({
  total: Count,
  registered: Count,
  byStatus: z.object({ active: Count, disabled: Count, deleted: Count }),
  withPassword: Count,
  series: z.object({ interval: Interval, items: z.array(z.object({ bucket: IsoDate, count: Count })) })
});
export const LowAdminUsersReportQuery = z.object({ from: IsoDate, to: IsoDate, interval: Interval.default('day') });

// ───────────────────────── mid (مالک جلسه) ─────────────────────────
/** GET MID_ADMIN.sessions — خروجی: لیست AdminSession با meta صفحه‌بندی. فیلترها همان AdminSessionsQuery + page/pageSize */
export const MidAdminSession = AdminSession;
/** POST MID_ADMIN.sessions — ساخت جلسه برای creatorId (draft)؛ ۱.۷.۰: سازنده owner جلسه. */
export const MidAdminCreateSession = z.object({ creatorId: Uuid, session: SessionInput }).strict();
/** PATCH MID_ADMIN.session — بدنه = SessionInput؛ فقط draft/scheduled (وگرنه 409 SESSION_LOCKED) */
export const MidAdminPatchSession = SessionInput;
/** POST MID_ADMIN.transition — بدنه = TransitionBody */
export const MidAdminTransition = TransitionBody;
/** DELETE MID_ADMIN.session — حذف نرم (deleted_at)؛ idempotent */
/** GET MID_ADMIN.members?page&pageSize&status — خروجی AdminMember بدون phone (high پر می‌کند؛ mid مقدار null می‌گذارد) */
export const MidAdminMember = AdminMember;
/** PATCH MID_ADMIN.member — { action: approve|reject } */
export const MidAdminDecide = z.object({ action: z.enum(['approve', 'reject']) }).strict();
/** DELETE MID_ADMIN.member — حذف عضو (۱.۷.۰: فقط اعضا؛ صاحب/پشتیبان از مسیرهای خودشان). پاسخ = MidAdminRemoveMemberResult */
export const MidAdminRemoveMemberResult = z.object({ userId: Uuid });
export const MidAdminAttendance = z.object({ items: z.array(AttendanceEntry), total: Count });
/** صف با نمای کامل (userId/name همهٔ ردیف‌ها پر است؛ ادمین استثنای حریم خصوصی D4 است) */
export const MidAdminQueue = QueueState;
export const MidAdminEvaluations = z.object({ items: z.array(Evaluation), total: Count });
/** GET MID_ADMIN.userSummary */
export const MidAdminUserSummary = z.object({ points: z.object({ total: Count, badges: Count }), sessions: z.object({ created: Count, memberships: Count, attended: Count }) });
export const MidAdminRangeQuery = z.object({ from: IsoDate, to: IsoDate, interval: Interval.default('day') });
export const MidAdminOverview = z.object({
  sessions: z.object({ total: Count, created: Count, byStatus: z.object({ draft: Count, scheduled: Count, started: Count, ended: Count }) }),
  participation: z.object({ attendance: Count, evaluations: Count, avgScore: z.number().min(0).max(100).nullable(), pointsAwarded: Count })
});
export const MidAdminSessionsSeries = z.object({ interval: Interval, items: z.array(z.object({ bucket: IsoDate, created: Count, held: Count, attendance: Count })) });
export const MidAdminLeaderboard = z.object({ items: z.array(z.object({ userId: Uuid, name: z.string().max(80), points: Count, badges: Count })) });
export const MidAdminLeaderboardQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });

// ───────────────────────── ۱.۶.۰ (docs-v2/30) ─────────────────────────
const Reason = z.string().trim().min(3).max(300);
/** همهٔ نوشتن‌های MID_ADMIN شناسهٔ ادمین را برای ثبت added_by/decided_by/marked_by می‌فرستند (audit اصلی در high است) */
const Actor = { actorId: Uuid };

/** low: POST LOW_INTERNAL.resolveUsers — فقط کاربران پیداشده برمی‌گردند (ترتیب ورودی حفظ نمی‌شود) */
export const LowResolveUsersBody = z.object({ phones: z.array(IranMobile).min(1).max(50) }).strict();
export const LowResolveUsersResult = z.object({
  items: z.array(z.object({ phone: IranMobile, userId: Uuid, firstName: z.string().max(40), lastName: z.string().max(40), status: UserStatus }))
});
/** low: POST LOW_ADMIN.usersBulk — ساخت گروهی (موجود ⇒ exists بدون تغییر)؛ هر ساخت ⇒ user.registered */
export const LowAdminUsersBulkBody = z
  .object({ items: z.array(z.object({ phone: IranMobile, firstName: PersonName, lastName: PersonName }).strict()).min(1).max(200) })
  .strict();
export const LowAdminUsersBulkResult = z.object({
  items: z.array(z.object({ phone: IranMobile, userId: Uuid.nullable(), outcome: z.enum(['created', 'exists', 'failed']), code: z.string().max(40).nullable() }))
});
/** low: GET LOW_ADMIN.broadcast — آمار تحویل پیام همگانی */
export const LowAdminBroadcastStats = z.object({
  status: z.enum(['queued', 'sending', 'done', 'failed']),
  targeted: Count.nullable(),
  delivered: Count,
  read: Count
});
/** low: POST LOW_ADMIN.logoutAll — بدنهٔ اختیاری (۱.۶.۰): نگه‌داشتن نشست جاری (H-07 در یک فراخوانی) */
export const LowAdminLogoutAllBody = z.object({ exceptSessionId: Uuid.optional() }).strict();

/** mid: POST MID_ADMIN.membersAdd */
export const MidAdminAddMembers = z
  .object({
    ...Actor,
    items: z
      .array(
        z
          .object({
            userId: Uuid,
            firstName: z.string().max(40).optional().meta({ description: 'برای ساخت ردیف دایرکتوری اگر رویداد user.registered هنوز نرسیده' }),
            lastName: z.string().max(40).optional()
          })
          .strict()
      )
      .min(1)
      .max(200),
    notify: z.boolean().default(true)
  })
  .strict();
export const MidAdminAddMembersResult = z.object({
  items: z.array(z.object({ userId: Uuid, outcome: AddMemberOutcome, member: AdminMember.nullable() }))
});
export const MidAdminDecideBulk = z.object({ ...Actor, memberIds: z.array(Uuid).min(1).max(200), action: z.enum(['approve', 'reject']) }).strict();
export const MidAdminDecideBulkResult = z.object({
  items: z.array(z.object({ memberId: Uuid, outcome: z.enum(['approved', 'rejected', 'skipped', 'full', 'not_found']) }))
});
/** mid: PUT MID_ADMIN.owner (۱.۷.۰؛ جایگزین manager) — بدنه = TransferOwnerBody + actorId (+ نام برای ردیف دایرکتوری) */
export const MidAdminOwner = z
  .object({
    ...Actor,
    userId: Uuid,
    previousOwner: z.enum(['supporter', 'remove']).default('supporter'),
    notify: z.boolean().default(true),
    firstName: z.string().max(40).optional(),
    lastName: z.string().max(40).optional()
  })
  .strict();
/** پاسخ PUT MID_ADMIN.owner */
export const MidAdminOwnerResult = AdminSession;
export const MidAdminOccurrence = Occurrence;
export const MidAdminMarkAttendance = z.object({ ...Actor, userIds: z.array(Uuid).min(1).max(100), occurrenceId: Uuid.optional(), reason: Reason }).strict();
export const MidAdminMarkAttendanceResult = MarkAttendanceResult;
export const MidAdminRevokeAttendance = z.object({ ...Actor, occurrenceId: Uuid.optional(), reason: Reason }).strict();
export const MidAdminRevokeAttendanceResult = RevokeAttendanceResult;
export const MidAdminQueueNext = z.object({ ...Actor, expectCurrentItemId: Uuid.nullable().optional() }).strict();
export const MidAdminQueueAct = QueueActBody.extend({ ...Actor, expectPosition: z.number().int().min(1).optional() }).strict();
export const MidAdminEvaluationPatch = z
  .object({ ...Actor, reason: Reason, scores: EvaluationScores.optional(), note: z.string().trim().max(300).optional() })
  .strict()
  .refine((v) => v.scores !== undefined || v.note !== undefined, { message: 'دست‌کم یک فیلد ارزیابی لازم است.' });
export const MidAdminEvaluationVoid = z.object({ ...Actor, reason: Reason }).strict();
export const MidAdminEvaluation = Evaluation;
/** mid: POST MID_ADMIN.notify — پیام به اعضای جلسه (mid رویداد دسته‌ای inbox.messages.created می‌سازد) */
export const MidAdminNotify = z
  .object({ ...Actor, broadcastId: Uuid, roles: z.array(SessionRole).min(1).max(3).optional().meta({ description: '۱.۷.۰: owner|supporter|member' }), title: z.string().min(2).max(120), body: z.string().min(2).max(500), ref: z.string().regex(/^(session:[A-Za-z0-9_-]{1,64}|points|badge:[A-Za-z0-9_-]{1,64}|announcement:[A-Za-z0-9_-]{1,64})$/).max(200).nullable() })
  .strict();
export const MidAdminNotifyResult = z.object({ recipients: Count });
export const MidAdminUserMembershipsQuery = UserMembershipsQuery;
export const MidAdminUserMembership = UserMembership;
export const MidAdminUserPointsQuery = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) });
export const MidAdminUserPoints = z.object({
  summary: PointsSummary,
  ledger: z.object({ items: z.array(PointsLedgerItem), page: z.number().int().min(1), pageSize: z.number().int().min(1), total: Count })
});
export const MidAdminPointsAdjust = z
  .object({ ...Actor, delta: z.number().int().min(-10000).max(10000).refine((d) => d !== 0, { message: 'مقدار نباید صفر باشد.' }), reason: Reason })
  .strict();
export const MidAdminPointsAdjustResult = z.object({ summary: PointsSummary, entry: PointsLedgerItem });
/** mid برای low: GET MID_FOR_LOW.pointsLedger?page&pageSize ⇒ لیست PointsLedgerItem با meta */
export const MidLowPointsLedgerQuery = MidAdminUserPointsQuery;

/** mid: GET MID_ADMIN.badgeHolders ⇒ تعداد دارندگان هر نشان */
export const MidAdminBadgeHolders = z.object({ items: z.array(z.object({ badgeId: Uuid, holders: Count })) });

// ───────────────────────── ۱.۷.۰ (docs-v2/31) ─────────────────────────
/** DELETEهای ۱.۷.۰ در MID_ADMIN: شناسهٔ ادمین در query */
export const MidAdminActorQuery = z.object({ actorId: Uuid });
/** GET MID_ADMIN.sessionOwners?page&pageSize ⇒ صاحبان جلسه (برای مهاجرت high: اعطای نقش teacher) */
export const MidAdminSessionOwnersQuery = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(100) });
export const MidAdminSessionOwner = z.object({ userId: Uuid, sessions: Count });
/** GET MID_ADMIN.teacherSupporters / supporters?page&pageSize ⇒ لیست TeacherSupporter / SessionSupporter با meta */
export const MidAdminSupportersQuery = SupportersQuery;
export const MidAdminTeacherSupporter = TeacherSupporter;
export const MidAdminSessionSupporter = SessionSupporter;
/** PUT MID_ADMIN.teacherSupporter / supporter — upsert؛ نام برای ردیف دایرکتوری اگر user.registered هنوز نرسیده */
export const MidAdminSupporterPut = z
  .object({ ...Actor, permissions: SupporterPermissions, firstName: z.string().max(40).optional(), lastName: z.string().max(40).optional() })
  .strict();
/** GET MID_ADMIN.galleries?occurrenceId&page&pageSize ⇒ لیست Gallery (همهٔ سطوح نمایش) */
export const MidAdminGalleriesQuery = AdminGalleriesQuery;
export const MidAdminGallery = Gallery;
/** POST MID_ADMIN.galleries */
export const MidAdminCreateGallery = AdminCreateGalleryBody.extend(Actor).strict();
/** PATCH MID_ADMIN.gallery */
export const MidAdminPatchGallery = z.intersection(UpdateGalleryBody, z.object(Actor));
/** GET MID_ADMIN.galleryItems?page&pageSize ⇒ لیست GalleryItem */
export const MidAdminGalleryItemsQuery = GalleryItemsQuery;
export const MidAdminGalleryItem = GalleryItem;
/**
 * POST MID_ADMIN.galleryItems?actorId&title — بدنهٔ **خام** stream‌شده از high (Content-Type و Content-Length اصلی؛ بدون بافر کامل).
 * قواعد نوع/حجم/سهمیه/EXIF همان M-75.
 */
export const MidAdminUploadQuery = UploadItemQuery.extend(Actor);
/** GET MID_ADMIN.galleryItemContent — پاسخ باینری؛ هدر Range از high عبور می‌کند (206)، ETag/Content-Type برمی‌گردد */
/** GET MID_ADMIN.comments?occurrenceId&queueItemId&authorId&hidden&page&pageSize ⇒ لیست Comment (شامل پنهان‌ها؛ mine=false) */
export const MidAdminCommentsQuery = AdminCommentsQuery;
export const MidAdminComment = Comment;
/** PATCH MID_ADMIN.comment */
export const MidAdminModerateComment = ModerateCommentBody.extend(Actor).strict();
