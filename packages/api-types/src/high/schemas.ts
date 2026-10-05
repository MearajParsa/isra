import { z } from 'zod';
import { Id, IranMobile, IsoDateTime, PersonName, named, pageQuery } from '../core/primitives';
import { Uuid } from '../core/primitives';
import { MidSession, SessionInput, SessionState } from '../domain/session';
import { AttendanceEntry, Evaluation, Member, QueueState } from '../mid/schemas';

export const SystemRoleKey = named('SystemRoleKey', z.enum(['developer', 'super_admin']));
export const PermissionKey = named(
  'PermissionKey',
  z.enum([
    'system.users.view',
    'system.users.manage',
    'system.role.assign',
    'system.permission.edit',
    'system.settings.view',
    'system.settings.edit',
    'system.audit.view',
    'system.sessions.view',
    'system.sessions.manage',
    'system.reports.view',
    'session.create'
  ])
);

/** تاریخ تقویمی (Asia/Tehran) برای بازهٔ گزارش/فیلتر: YYYY-MM-DD */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاریخ YYYY-MM-DD').meta({ example: '2026-10-05' });
export const UserStatus = named('UserStatus', z.enum(['active', 'disabled', 'deleted']), 'active=فعال؛ disabled=غیرفعال (ورود/نشست مسدود)؛ deleted=حذف نرم و ناشناس‌شده');
/** شمارهٔ ناشناسِ کاربر حذف‌شده: `d` + ۱۰ هگز از شناسه (CHAR(11)؛ یکتا؛ غیر موبایل) */
export const AnonPhone = z.string().regex(/^d[0-9a-f]{10}$/, 'شمارهٔ ناشناس').meta({ description: 'شمارهٔ ناشناس کاربر حذف‌شده' });
const Password = z.string().min(8).max(128).meta({ description: 'حداقل ۸ نویسه؛ هرگز لاگ/audit نمی‌شود' });
export const Grant = named('Grant', z.enum(['session.create']), 'مجوز مستقیم per user (D1)');

export const PermissionInfo = named('PermissionInfo', z.object({ key: PermissionKey, title: z.string().max(120), group: z.enum(['system', 'session']) }));

export const SystemRole = named(
  'SystemRole',
  z.object({
    key: SystemRoleKey,
    title: z.string().max(60),
    description: z.string().max(300),
    undeletable: z.literal(true).meta({ description: 'نقش‌های سیستم حذف نمی‌شوند (قفل #28)' }),
    permissions: z.array(PermissionKey),
    lockedPermissions: z.array(PermissionKey),
    holders: z.number().int().min(0)
  })
);
export const SetRolePermissionsBody = named('SetRolePermissionsBody', z.object({ permissions: z.array(PermissionKey).max(20) }).strict());

export const SystemMe = named(
  'SystemMe',
  z.object({
    user: z.object({ id: Id, name: z.string().max(80), phone: IranMobile }),
    roles: z.array(SystemRoleKey),
    permissions: z.array(PermissionKey)
  })
);

export const SystemUser = named(
  'SystemUser',
  z.object({ id: Id, name: z.string().max(80), phone: IranMobile.or(AnonPhone), status: UserStatus, roles: z.array(SystemRoleKey), grants: z.array(Grant), createdAt: IsoDateTime })
);

export const SystemUserDetail = named(
  'SystemUserDetail',
  SystemUser.extend({
    firstName: z.string().max(40),
    lastName: z.string().max(40),
    hasPassword: z.boolean(),
    mustChangePassword: z.boolean(),
    lastActiveAt: IsoDateTime.nullable(),
    activeSessions: z.number().int().min(0),
    sessionsByClient: z.record(z.string(), z.number().int().min(0)).meta({ description: 'نشست‌های فعال به تفکیک کلاینت/پنل (web-main، web-admin، android-*)' }),
    points: z.object({ total: z.number().int().min(0), badges: z.number().int().min(0) }),
    sessions: z.object({ created: z.number().int().min(0), memberships: z.number().int().min(0), attended: z.number().int().min(0) })
  })
);
export const UsersQuery = z.object({
  q: z.string().trim().max(60).optional().meta({ description: 'جست‌وجو روی نام یا شماره (حداکثر ۶۰ نویسه)' }),
  role: z.union([SystemRoleKey, z.literal('none')]).optional(),
  grant: z.union([Grant, z.literal('none')]).optional().meta({ description: 'فیلتر مجوز مستقیم (none = بدون مجوز مستقیم)' }),
  status: UserStatus.optional(),
  createdFrom: IsoDate.optional(),
  createdTo: IsoDate.optional(),
  sort: z.enum(['newest', 'oldest', 'name']).default('newest')
});
export const SetUserRolesBody = named('SetUserRolesBody', z.object({ roles: z.array(SystemRoleKey).max(2) }).strict());
export const SetUserGrantsBody = named('SetUserGrantsBody', z.object({ grants: z.array(Grant).max(1) }).strict());
export const CreateUserBody = named(
  'CreateUserBody',
  z
    .object({
      phone: IranMobile,
      firstName: PersonName,
      lastName: PersonName,
      password: Password.optional().meta({ description: 'رمز موقت؛ اگر نیاید کاربر فقط با OTP وارد می‌شود. با رمز، کاربر در اولین ورود باید رمز را عوض کند' }),
      roles: z.array(SystemRoleKey).max(2).optional(),
      grants: z.array(Grant).max(1).optional()
    })
    .strict()
);
export const UpdateUserBody = named(
  'UpdateUserBody',
  z
    .object({ firstName: PersonName.optional(), lastName: PersonName.optional(), phone: IranMobile.optional() })
    .strict()
    .refine((v) => Object.keys(v).length > 0, { message: 'دست‌کم یک فیلد لازم است.' })
);
export const SetUserStatusBody = named('SetUserStatusBody', z.object({ status: z.enum(['active', 'disabled']) }).strict());
export const UserPasswordBody = named(
  'UserPasswordBody',
  z.discriminatedUnion('action', [
    z.object({ action: z.literal('set'), password: Password }).strict().meta({ description: 'رمز موقت؛ کاربر باید در اولین ورود عوضش کند' }),
    z.object({ action: z.literal('clear') }).strict().meta({ description: 'حذف رمز؛ کاربر فقط با OTP وارد می‌شود' })
  ])
);
export const UserDeviceSession = named(
  'UserDeviceSession',
  z.object({
    id: Id,
    deviceLabel: z.string().max(80),
    platform: z.enum(['web', 'android']),
    client: z.string().max(24).nullable(),
    ipMasked: z.string().max(45).meta({ description: 'IP با ماسک (دو بخش آخر پنهان)' }),
    createdAt: IsoDateTime,
    lastActiveAt: IsoDateTime,
    revokedAt: IsoDateTime.nullable(),
    current: z.boolean().meta({ description: 'فقط در «نشست‌های من»' })
  })
);

/** «حساب من» — خودخدمتی ادمین (قفل #8: همهٔ اقدام‌ها از /s/v1؛ فقط auth به low) */
export const MyAccount = named(
  'MyAccount',
  z.object({ id: Id, phone: IranMobile, firstName: z.string().max(40), lastName: z.string().max(40), hasPassword: z.boolean(), mustChangePassword: z.boolean() })
);
export const UpdateMyProfileBody = named(
  'UpdateMyProfileBody',
  z
    .object({ firstName: PersonName.optional(), lastName: PersonName.optional() })
    .strict()
    .refine((v) => Object.keys(v).length > 0, { message: 'دست‌کم یک فیلد لازم است.' })
);
export const SetMyPasswordBody = named(
  'SetMyPasswordBody',
  z.object({ newPassword: Password, currentPassword: z.string().min(1).max(128).optional().meta({ description: 'فقط وقتی `mustChangePassword` است (به‌جای step-up)' }) }).strict()
);

// ───────── مدیریت جلسه‌ها (داده در mid؛ high واسطهٔ مجاز است) ─────────
export const AdminSession = named(
  'AdminSession',
  MidSession.extend({
    createdBy: z.object({ id: Id, name: z.string().max(80) }),
    counts: z.object({ members: z.number().int().min(0), pending: z.number().int().min(0), attendance: z.number().int().min(0), evaluations: z.number().int().min(0) }),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    deletedAt: IsoDateTime.nullable()
  })
);
export const AdminSessionsQuery = z.object({
  q: z.string().trim().max(60).optional().meta({ description: 'عنوان یا آدرس' }),
  status: SessionState.optional(),
  creatorId: Id.optional(),
  from: IsoDate.optional().meta({ description: 'شروع بعدی (nextStartsAt) از' }),
  to: IsoDate.optional(),
  includeDeleted: z.enum(['true', 'false']).default('false'),
  sort: z.enum(['newest', 'oldest', 'title', 'nextStart']).default('newest')
});
export const AdminCreateSessionBody = named(
  'AdminCreateSessionBody',
  z.object({ creatorId: Id.optional().meta({ description: 'سازندهٔ جلسه (پیش‌فرض: خود ادمین)؛ سازنده session_manager می‌شود' }), session: SessionInput }).strict()
);
export const AdminMember = named('AdminMember', Member.extend({ phone: IranMobile.nullable(), decidedAt: IsoDateTime.nullable() }));
export const AdminMembersQuery = pageQuery(100).extend({ status: z.enum(['pending', 'approved', 'rejected']).optional() });
export const AdminDecideBody = named('AdminDecideBody', z.object({ action: z.enum(['approve', 'reject']) }).strict());
export const AdminAttendanceList = named('AdminAttendanceList', z.object({ items: z.array(AttendanceEntry), total: z.number().int().min(0) }));
export const AdminQueue = named('AdminQueue', QueueState);
export const AdminEvaluations = named('AdminEvaluations', z.object({ items: z.array(Evaluation), total: z.number().int().min(0) }));

// ───────── گزارش‌ها ─────────
export const ReportRangeQuery = z.object({
  from: IsoDate.optional().meta({ description: 'پیش‌فرض: ۳۰ روز قبل' }),
  to: IsoDate.optional().meta({ description: 'پیش‌فرض: امروز؛ بازهٔ بیشینه ۳۶۶ روز' })
});
export const ReportSeriesQuery = ReportRangeQuery.extend({ interval: z.enum(['day', 'week', 'month']).default('day') });
const Count = z.number().int().min(0);
export const ReportOverview = named(
  'ReportOverview',
  z.object({
    range: z.object({ from: IsoDate, to: IsoDate }),
    users: z.object({
      total: Count,
      registered: Count.meta({ description: 'ثبت‌نام در بازه' }),
      byStatus: z.object({ active: Count, disabled: Count, deleted: Count }),
      byRole: z.object({ developer: Count, super_admin: Count, none: Count }),
      withPassword: Count.nullable().meta({ description: 'null اگر low در دسترس نباشد' })
    }),
    sessions: z.object({
      total: Count,
      created: Count,
      byStatus: z.object({ draft: Count, scheduled: Count, started: Count, ended: Count })
    }),
    participation: z.object({ attendance: Count, evaluations: Count, avgScore: z.number().min(0).max(100).nullable(), pointsAwarded: Count }),
    messaging: z.object({ otpRequested: Count, otpVerified: Count }).nullable(),
    clients: z.array(z.object({ client: z.string().max(24), activeSessions: Count })).meta({ description: 'نشست‌های فعال به تفکیک پنل/کلاینت' })
  })
);
const Interval = z.enum(['day', 'week', 'month']);
export const RegistrationsSeries = named('RegistrationsSeries', z.object({ interval: Interval, items: z.array(z.object({ bucket: IsoDate, count: Count })) }));
export const SessionsSeries = named(
  'SessionsSeries',
  z.object({ interval: Interval, items: z.array(z.object({ bucket: IsoDate, created: Count, held: Count, attendance: Count })) })
);
export const OtpSeries = named('OtpSeries', z.object({ interval: Interval, items: z.array(z.object({ bucket: IsoDate, requested: Count, verified: Count })) }));
export const LeaderboardQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });
export const LeaderboardItem = named('LeaderboardItem', z.object({ userId: Id, name: z.string().max(80), points: Count, badges: Count }));


export const EvalWeights = named(
  'SystemEvalWeights',
  z
    .object({ voice: z.number().int().min(0).max(100), tone: z.number().int().min(0).max(100), tajweed: z.number().int().min(0).max(100) })
    .strict()
    .refine((w) => w.voice + w.tone + w.tajweed === 100, { message: 'مجموع وزن‌ها باید دقیقاً ۱۰۰ باشد.' })
);
const Thresholds = z
  .tuple([z.number().int().positive(), z.number().int().positive(), z.number().int().positive(), z.number().int().positive()])
  .refine((t) => t.every((x, i) => i === 0 || x > (t[i - 1] ?? 0)), { message: 'آستانه‌ها باید اکیداً صعودی باشند.' })
  .meta({ description: 'نشان‌های ۵۰/۱۵۰/۳۰۰/۵۰۰ (پیش‌فرض)؛ افت امتیاز نشان را باطل نمی‌کند' });
export const Flags = z.object({ maintenance_mode: z.boolean(), registration_open: z.boolean() }).strict();

export const SystemSettings = named(
  'SystemSettings',
  z.object({
    version: z.number().int().min(1).meta({ description: 'نسخهٔ خوش‌بینانه (optimistic concurrency)' }),
    evalWeights: EvalWeights,
    badgeThresholds: Thresholds,
    flags: Flags,
    updatedAt: IsoDateTime,
    updatedBy: z.string().max(80)
  })
);
export const UpdateSettingsBody = named(
  'UpdateSettingsBody',
  z.object({ version: z.number().int().min(1), evalWeights: EvalWeights, badgeThresholds: Thresholds, flags: Flags }).strict()
);

export const AuditEntry = named(
  'AuditEntry',
  z.object({
    id: Id,
    at: IsoDateTime,
    actor: z.object({ id: Id, name: z.string().max(80) }),
    action: z.string().regex(/^[a-z_]+(\.[a-z_]+)+$/).max(64),
    target: z.object({ type: z.enum(['user', 'role', 'settings', 'session']), id: Id, label: z.string().max(120) }).optional(),
    summary: z.string().max(300),
    meta: z.record(z.string(), z.unknown()).meta({ description: 'جزئیات فنی بدون PII حساس (OTP/توکن/رمز هرگز)' })
  })
);
export const AuditQuery = z.object({
  action: z.string().max(64).optional().meta({ description: 'نوع دقیق اقدام یا پیشوند (مثلاً `user.`)' }),
  q: z.string().trim().max(60).optional(),
  actorId: Id.optional(),
  targetType: z.enum(['user', 'role', 'settings', 'session']).optional(),
  targetId: Id.optional(),
  from: IsoDate.optional(),
  to: IsoDate.optional()
});

export const Overview = named(
  'Overview',
  z.object({
    users: z.object({ total: z.number().int().min(0), admins: z.number().int().min(0) }),
    sessions: z.object({ draft: z.number().int().min(0), scheduled: z.number().int().min(0), started: z.number().int().min(0), ended: z.number().int().min(0) }),
    lastAudit: z.array(AuditEntry).max(5)
  })
);
export { Uuid };
export const LeaderboardResponse = named('LeaderboardResponse', z.object({ items: z.array(LeaderboardItem) }));
