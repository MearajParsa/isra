import { z } from 'zod';
import { IranMobile, IsoDateTime, PersonName, Uuid } from '../core/primitives';
import { SessionInput } from '../domain/session';
import { AttendanceEntry, Evaluation, QueueState } from '../mid/schemas';
import { AdminMember, AdminSession, AnonPhone, IsoDate, UserStatus } from '../high/schemas';
import { SetRolesBody, TransitionBody } from '../mid/schemas';

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
  reportUsers: '/admin/reports/users'
} as const;

export const MID_ADMIN = {
  sessions: '/admin/sessions',
  session: '/admin/sessions/:id',
  transition: '/admin/sessions/:id/transition',
  members: '/admin/sessions/:id/members',
  member: '/admin/sessions/:id/members/:memberId',
  memberRoles: '/admin/sessions/:id/members/:memberId/roles',
  attendance: '/admin/sessions/:id/attendance',
  queue: '/admin/sessions/:id/queue',
  evaluations: '/admin/sessions/:id/evaluations',
  userSummary: '/admin/users/:id/summary',
  reportOverview: '/admin/reports/overview',
  reportSessions: '/admin/reports/sessions',
  reportLeaderboard: '/admin/reports/leaderboard'
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
export const LowAdminOtpSeries = z.object({ interval: Interval, items: z.array(z.object({ bucket: IsoDate, requested: Count, verified: Count })) });
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
/** POST MID_ADMIN.sessions — ساخت جلسه برای creatorId (draft)؛ سازنده session_manager. */
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
/** PUT MID_ADMIN.memberRoles — بدنه = SetRolesBody */
export const MidAdminSetRoles = SetRolesBody;
/** DELETE MID_ADMIN.member — حذف عضو؛ مدیر جلسه قابل‌حذف نیست (409 CONFLICT) */
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
