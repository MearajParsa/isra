import { z } from 'zod';
import { Id, IranMobile, IsoDateTime, PersonName, named, pageQuery } from '../core/primitives';
import { Uuid } from '../core/primitives';
import { MidSession, Occurrence, SessionInput, SessionState } from '../domain/session';
import { BadgeKey, PointsLedgerItem, PointsSummary } from '../domain/points';
import {
  AddMemberOutcome,
  AttendanceEntry,
  AttendanceQuery,
  CommentsQuery,
  CriterionKey,
  Evaluation,
  EvaluationScores,
  EvaluationsQuery,
  GalleriesQuery,
  CreateGalleryBody,
  Member,
  MembershipStatus,
  QueueActBody,
  QueueState,
  SessionRole
} from '../mid/schemas';

/**
 * ۱.۷.۰ (docs-v2/31 §۱): سطح کاربری نقش/ماژول. high = پنل (developer، super_admin، …)؛ mid = استاد/پشتیبان (teacher، …)؛
 * low = مهمان/قرآن‌آموز/کاربر عادی (guest، quran_student، …).
 */
export const Tier = named('Tier', z.enum(['high', 'mid', 'low']));
/** کلید نقش: انگلیسی کوچک/underscore (نقش‌های ثابت `developer`، `super_admin`، `teacher`، `guest`، `quran_student` حذف‌نشدنی‌اند؛ بقیه پویا) */
export const SystemRoleKey = named('SystemRoleKey', z.string().regex(/^[a-z][a-z0-9_]{2,31}$/, 'کلید نقش: حروف کوچک انگلیسی/عدد/_ (۳ تا ۳۲)').meta({ example: 'content_editor' }));
/** کلید مجوز `module.action` (۲ تا ۴ بخش با نقطه): مثل `system.users.view` */
export const PermissionKey = named('PermissionKey', z.string().max(64).regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$/, 'کلید مجوز: بخش‌های حروف کوچک انگلیسی با نقطه').meta({ example: 'system.users.view' }));
export const ModuleKey = named('ModuleKey', z.string().regex(/^[a-z][a-z0-9_]{1,31}$/, 'کلید ماژول: حروف کوچک انگلیسی/عدد/_').meta({ example: 'users' }));
export const StepUpMode = named('StepUpMode', z.enum(['required', 'none']), 'required = برای این مجوز تأیید هویت دوباره (OTP) لازم است؛ none = لازم نیست');
export const StepUpRuleMode = z.enum(['required', 'none', 'inherit']).meta({ description: 'inherit = پیش‌فرض خود مجوز' });

/** تاریخ تقویمی (Asia/Tehran) برای بازهٔ گزارش/فیلتر: YYYY-MM-DD */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاریخ YYYY-MM-DD').meta({ example: '2026-10-05' });
export const UserStatus = named('UserStatus', z.enum(['active', 'disabled', 'deleted']), 'active=فعال؛ disabled=غیرفعال (ورود/نشست مسدود)؛ deleted=حذف نرم و ناشناس‌شده');
/** شمارهٔ ناشناسِ کاربر حذف‌شده: `d` + ۱۰ هگز از شناسه (CHAR(11)؛ یکتا؛ غیر موبایل) */
export const AnonPhone = z.string().regex(/^d[0-9a-f]{10}$/, 'شمارهٔ ناشناس').meta({ description: 'شمارهٔ ناشناس کاربر حذف‌شده' });
const Password = z.string().min(8).max(128).meta({ description: 'حداقل ۸ نویسه؛ هرگز لاگ/audit نمی‌شود' });
export const Grant = named('Grant', PermissionKey, 'مجوز مستقیم per user: هر مجوزِ `grantable` (مثل `session.create`)');

export const ModuleInfo = named(
  'ModuleInfo',
  z.object({
    key: ModuleKey,
    title: z.string().max(60),
    description: z.string().max(300),
    tier: Tier.default('high').meta({ description: '۱.۷.۰: سطح ماژول (teaching=mid، learning=low، بقیه high)' }),
    isSystem: z.boolean().meta({ description: 'ماژول‌های سیستمی حذف نمی‌شوند' }),
    sortOrder: z.number().int().min(0).max(1000),
    permissionCount: z.number().int().min(0)
  })
);

export const PermissionInfo = named(
  'PermissionInfo',
  z.object({
    key: PermissionKey,
    title: z.string().max(120),
    description: z.string().max(300),
    moduleKey: ModuleKey,
    isSystem: z.boolean().meta({ description: 'مجوز سیستمی: کلید و ماژول ثابت؛ حذف‌نشدنی' }),
    grantable: z.boolean().meta({ description: 'می‌تواند مستقیم به کاربر داده شود (بدون نقش)' }),
    stepUp: StepUpMode.meta({ description: 'پیش‌فرض step-up برای این مجوز (قابل override per نقش)؛ توسعه‌دهنده همیشه معاف است' })
  })
);

export const SystemRole = named(
  'SystemRole',
  z.object({
    key: SystemRoleKey,
    title: z.string().max(60),
    description: z.string().max(300),
    tier: Tier.default('high').meta({ description: '۱.۷.۰: سطح نقش؛ ویرایش نقش mid ⇒ system.roles.mid.manage، low ⇒ system.roles.low.manage' }),
    undeletable: z.boolean().meta({ description: 'نقش‌های ثابت (developer، super_admin، teacher، guest، quran_student) حذف نمی‌شوند (قفل #28)' }),
    implicit: z.boolean().default(false).meta({ description: 'عضویت ضمنی: quran_student = هر کاربر ثبت‌نام‌کرده؛ guest = درخواست بی‌توکن (نه قابل اختصاص؛ holders معنا ندارد)' }),
    permissions: z.array(PermissionKey).meta({ description: 'مجوزهای صریح نقش' }),
    modules: z.array(ModuleKey).meta({ description: 'ماژول‌های کامل داده‌شده به نقش (همهٔ مجوزهای حال و آیندهٔ ماژول)' }),
    effectivePermissions: z.array(PermissionKey).meta({ description: 'مجوزهای صریح ∪ مجوزهای ماژول‌ها' }),
    lockedPermissions: z.array(PermissionKey),
    stepUpRules: z.record(PermissionKey, StepUpMode).meta({ description: 'override step-up این نقش per مجوز (غایب = پیش‌فرض مجوز)' }),
    holders: z.number().int().min(0)
  })
);
export const SetRolePermissionsBody = named('SetRolePermissionsBody', z.object({ permissions: z.array(PermissionKey).max(200) }).strict());
export const CreateRoleBody = named(
  'CreateRoleBody',
  z
    .object({
      key: SystemRoleKey,
      title: z.string().trim().min(2).max(60),
      description: z.string().trim().max(300).default(''),
      tier: Tier.default('high').meta({ description: '۱.۷.۰: پس از ساخت ثابت است' }),
      permissions: z.array(PermissionKey).max(200).default([]),
      modules: z.array(ModuleKey).max(50).default([])
    })
    .strict()
);
export const UpdateRoleBody = named(
  'UpdateRoleBody',
  z
    .object({ title: z.string().trim().min(2).max(60).optional(), description: z.string().trim().max(300).optional() })
    .strict()
    .refine((v) => Object.keys(v).length > 0, { message: 'دست‌کم یک فیلد لازم است.' })
);
export const SetRoleModulesBody = named('SetRoleModulesBody', z.object({ modules: z.array(ModuleKey).max(50) }).strict());
export const SetRoleStepUpBody = named(
  'SetRoleStepUpBody',
  z.object({ rules: z.array(z.object({ permission: PermissionKey, mode: StepUpRuleMode }).strict()).max(200) }).strict().meta({ description: 'فقط مجوزهای ذکرشده تغییر می‌کنند؛ inherit = حذف override' })
);
export const CreatePermissionBody = named(
  'CreatePermissionBody',
  z
    .object({
      key: PermissionKey,
      title: z.string().trim().min(2).max(120),
      description: z.string().trim().max(300).default(''),
      moduleKey: ModuleKey,
      grantable: z.boolean().default(false),
      stepUp: StepUpMode.default('required')
    })
    .strict()
);
export const UpdatePermissionBody = named(
  'UpdatePermissionBody',
  z
    .object({
      title: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().max(300).optional(),
      moduleKey: ModuleKey.optional().meta({ description: 'فقط مجوز غیرسیستمی' }),
      grantable: z.boolean().optional(),
      stepUp: StepUpMode.optional()
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, { message: 'دست‌کم یک فیلد لازم است.' })
);
export const CreateModuleBody = named(
  'CreateModuleBody',
  z
    .object({
      key: ModuleKey,
      title: z.string().trim().min(2).max(60),
      description: z.string().trim().max(300).default(''),
      tier: Tier.default('high').meta({ description: '۱.۷.۰: پس از ساخت ثابت است' }),
      sortOrder: z.number().int().min(0).max(1000).default(100)
    })
    .strict()
);
export const UpdateModuleBody = named(
  'UpdateModuleBody',
  z
    .object({ title: z.string().trim().min(2).max(60).optional(), description: z.string().trim().max(300).optional(), sortOrder: z.number().int().min(0).max(1000).optional() })
    .strict()
    .refine((v) => Object.keys(v).length > 0, { message: 'دست‌کم یک فیلد لازم است.' })
);
export const RbacMatrix = named(
  'RbacMatrix',
  z.object({
    version: z.number().int().min(1).meta({ description: 'شمارندهٔ تغییر ماتریس؛ برای کش/ETag' }),
    modules: z.array(ModuleInfo),
    permissions: z.array(PermissionInfo),
    roles: z.array(SystemRole)
  })
);
const AccessSource = z.object({
  type: z.enum(['role', 'module', 'grant', 'baseline']).meta({ description: '۱.۷.۰: baseline = عضویت ضمنی quran_student (ref = quran_student)' }),
  ref: z.string().max(64),
  stepUp: StepUpMode
});
export const EffectiveAccess = named(
  'EffectiveAccess',
  z.object({
    userId: Id,
    roles: z.array(SystemRoleKey),
    tiers: z.array(Tier).meta({ description: '۱.۷.۰: سطوح نقش‌های کاربر (low همیشه به‌خاطر quran_student ضمنی)' }),
    grants: z.array(Grant),
    stepUpExempt: z.boolean().meta({ description: 'توسعه‌دهنده برای هیچ اقدامی step-up ندارد' }),
    permissions: z.array(z.object({ key: PermissionKey, stepUp: StepUpMode.meta({ description: 'نتیجهٔ نهایی برای این کاربر (توسعه‌دهنده ⇒ همیشه none)' }), sources: z.array(AccessSource) }))
  })
);

export const SystemMe = named(
  'SystemMe',
  z.object({
    user: z.object({ id: Id, name: z.string().max(80), phone: IranMobile }),
    roles: z.array(SystemRoleKey),
    tiers: z.array(Tier).meta({ description: '۱.۷.۰: سطوح نقش‌های من؛ ورود به پنل = نقش tier=high یا دست‌کم یک مجوز `system.*`' }),
    permissions: z.array(PermissionKey),
    stepUpExempt: z.boolean().meta({ description: 'نقش developer ⇒ هیچ اقدامی step-up ندارد (جز تغییر رمز خودش H-04)' }),
    stepUp: z.record(PermissionKey, StepUpMode).meta({ description: 'برای هر مجوزِ مؤثر: آیا اقدام‌های آن نیازمند step-up است (پس از اعمال override نقش‌ها؛ developer ⇒ همه none)' })
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
export const SetUserRolesBody = named('SetUserRolesBody', z.object({ roles: z.array(SystemRoleKey).max(10) }).strict());
export const SetUserGrantsBody = named('SetUserGrantsBody', z.object({ grants: z.array(Grant).max(50) }).strict());
export const CreateUserBody = named(
  'CreateUserBody',
  z
    .object({
      phone: IranMobile,
      firstName: PersonName,
      lastName: PersonName,
      password: Password.optional().meta({ description: 'رمز موقت؛ اگر نیاید کاربر فقط با OTP وارد می‌شود. با رمز، کاربر در اولین ورود باید رمز را عوض کند' }),
      roles: z.array(SystemRoleKey).max(10).optional(),
      grants: z.array(Grant).max(50).optional()
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
    owner: z.object({ id: Id, name: z.string().max(80) }).meta({ description: '۱.۷.۰: استاد صاحب جلسه (تغییر با H-74)' }),
    counts: z.object({
      members: z.number().int().min(0),
      pending: z.number().int().min(0),
      attendance: z.number().int().min(0),
      evaluations: z.number().int().min(0),
      supporters: z.number().int().min(0).default(0).meta({ description: '۱.۷.۰: پشتیبان‌های مؤثر (ثابت استاد ∪ per جلسه)' }),
      occurrences: z.number().int().min(0).default(0)
    }),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    deletedAt: IsoDateTime.nullable()
  })
);
export const AdminSessionsQuery = z.object({
  q: z.string().trim().max(60).optional().meta({ description: 'عنوان یا آدرس' }),
  status: SessionState.optional(),
  creatorId: Id.optional(),
  ownerId: Id.optional().meta({ description: '۱.۷.۰: استاد صاحب' }),
  from: IsoDate.optional().meta({ description: 'شروع بعدی (nextStartsAt) از' }),
  to: IsoDate.optional(),
  includeDeleted: z.enum(['true', 'false']).default('false'),
  sort: z.enum(['newest', 'oldest', 'title', 'nextStart']).default('newest')
});
export const AdminCreateSessionBody = named(
  'AdminCreateSessionBody',
  z.object({ creatorId: Id.optional().meta({ description: 'سازنده و صاحب جلسه (پیش‌فرض: خود ادمین)؛ ۱.۷.۰: owner می‌شود' }), session: SessionInput }).strict()
);
export const AdminMember = named('AdminMember', Member.extend({ phone: IranMobile.nullable(), decidedAt: IsoDateTime.nullable() }));
export const AdminMembersQuery = pageQuery(100).extend({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  q: z.string().trim().min(1).max(40).optional().meta({ description: 'نام یا شماره (شماره در high به userId تبدیل می‌شود)' }),
  userId: Id.optional()
});

// ───── افزودن مستقیم اعضا (H-73) ─────
const AdminMemberRef = z
  .object({ userId: Id.optional(), phone: IranMobile.optional() })
  .strict()
  .refine((v) => (v.userId ? 1 : 0) + (v.phone ? 1 : 0) === 1, { message: 'دقیقاً یکی از userId یا phone لازم است.' });
export const AdminAddMembersBody = named(
  'AdminAddMembersBody',
  z
    .object({
      items: z
        .array(
          z
            .object({
              user: AdminMemberRef,
              firstName: PersonName.optional().meta({ description: 'فقط با createMissing برای شمارهٔ ثبت‌نام‌نکرده' }),
              lastName: PersonName.optional()
            })
            .strict()
        )
        .min(1)
        .max(200),
      createMissing: z.boolean().default(false).meta({ description: 'شمارهٔ ثبت‌نام‌نکرده ⇒ ساخت کاربر (نیازمند system.users.manage هم)' }),
      notify: z.boolean().default(true)
    })
    .strict()
    .meta({ description: '۱.۷.۰: فقط عضو (بدون نقش؛ پشتیبان از H-108). عضو تأییدشده ⇒ unchanged؛ pending/rejected ⇒ approved.' })
);
export const AdminAddMembersResult = named(
  'AdminAddMembersResult',
  z.object({
    items: z.array(
      z.object({
        index: z.number().int().min(0),
        userId: Id.nullable(),
        outcome: AddMemberOutcome,
        code: z.string().max(40).nullable().meta({ description: 'کد خطای آیتم ناموفق (مثلاً PHONE_TAKEN)' }),
        member: AdminMember.nullable()
      })
    ),
    counts: z.record(AddMemberOutcome, z.number().int().min(0))
  })
);
/** H-74 (۱.۷.۰): تغییر استاد صاحب جلسه */
export const TransferOwnerBody = named(
  'TransferOwnerBody',
  z
    .object({
      userId: Id,
      previousOwner: z.enum(['supporter', 'remove']).default('supporter').meta({ description: 'supporter: صاحب قبلی پشتیبان per جلسه با همهٔ مجوزها می‌شود؛ remove: هیچ نقشی در جلسه نمی‌ماند' }),
      notify: z.boolean().default(true)
    })
    .strict()
);
/** H-53 تأیید/رد گروهی درخواست‌ها */
export const AdminDecideBulkBody = named('AdminDecideBulkBody', z.object({ memberIds: z.array(Id).min(1).max(200), action: z.enum(['approve', 'reject']) }).strict());
export const AdminDecideBulkResult = named(
  'AdminDecideBulkResult',
  z.object({ items: z.array(z.object({ memberId: Id, outcome: z.enum(['approved', 'rejected', 'skipped', 'full', 'not_found']) })) })
);

// ───── اصلاحات حضور/صف/ارزیابی توسط ادمین ─────
const Reason = z.string().trim().min(3).max(300);
export const AdminOccurrence = named('AdminOccurrence', Occurrence);
export const AdminAttendanceQuery = AttendanceQuery;
export const AdminEvaluationsQuery = EvaluationsQuery;
export const AdminMarkAttendanceBody = named(
  'AdminMarkAttendanceBody',
  z.object({ userIds: z.array(Id).min(1).max(100), occurrenceId: Id.optional().meta({ description: 'پیش‌فرض: نوبت باز؛ ادمین روی نوبت بسته هم (اصلاح) مجاز است' }), reason: Reason }).strict()
);
export const AdminRevokeAttendanceBody = named('AdminRevokeAttendanceBody', z.object({ occurrenceId: Id.optional(), reason: Reason }).strict());
export const AdminQueueNextBody = named(
  'AdminQueueNextBody',
  z.object({ expectCurrentItemId: Id.nullable().optional().meta({ description: 'شرط هم‌زمانی؛ ناهمخوان ⇒ CONFLICT(QUEUE_STATE_CHANGED)' }) }).strict()
);
export const AdminQueueActBody = named('AdminQueueActBody', QueueActBody.extend({ expectPosition: z.number().int().min(1).optional() }).strict());
export const AdminVoidEvaluationBody = named('AdminVoidEvaluationBody', z.object({ reason: Reason }).strict());
export const AdminEvaluationPatchBody = named(
  'AdminEvaluationPatchBody',
  z
    .object({ scores: EvaluationScores.optional().meta({ description: 'فقط معیارهای snapshot همان ارزیابی' }), note: z.string().trim().max(300).optional(), reason: Reason })
    .strict()
    .refine((v) => v.scores !== undefined || v.note !== undefined, { message: 'دست‌کم یک فیلد ارزیابی لازم است.' })
);

// ───── تاریخچهٔ عضویت و امتیاز کاربر ─────
export const UserMembershipsQuery = pageQuery(50).extend({
  status: MembershipStatus.optional(),
  role: SessionRole.optional(),
  includeDeleted: z.enum(['true', 'false']).default('false')
});
export const UserMembership = named(
  'UserMembership',
  z.object({
    session: z.object({ id: Id, title: z.string().max(80), status: SessionState, nextStartsAt: IsoDateTime.nullable(), deletedAt: IsoDateTime.nullable() }),
    memberId: Id.nullable().meta({ description: 'null برای صاحب/پشتیبانِ غیرعضو' }),
    role: SessionRole.meta({ description: '۱.۷.۰: owner | supporter | member' }),
    status: MembershipStatus.nullable().meta({ description: 'فقط برای member' }),
    requestedAt: IsoDateTime.nullable(),
    decidedAt: IsoDateTime.nullable(),
    attendanceCount: z.number().int().min(0),
    evaluations: z.object({ count: z.number().int().min(0), avgScore: z.number().min(0).max(100).nullable() }),
    points: z.number().int()
  })
);
export const AdminUserPointsQuery = pageQuery(50);
export const AdminUserPoints = named(
  'AdminUserPoints',
  z.object({
    summary: PointsSummary,
    ledger: z.object({ items: z.array(PointsLedgerItem), page: z.number().int().min(1), pageSize: z.number().int().min(1), total: z.number().int().min(0) })
  })
);
export const PointsAdjustBody = named(
  'PointsAdjustBody',
  z
    .object({ delta: z.number().int().min(-10000).max(10000).refine((d) => d !== 0, { message: 'مقدار نباید صفر باشد.' }), reason: Reason })
    .strict()
);
export const PointsAdjustResult = named('PointsAdjustResult', z.object({ summary: PointsSummary, entry: PointsLedgerItem }));

// ───── نشان‌ها (پویا؛ تصمیم مالک ۱۴۰۵/۰۷/۱۵) ─────
export const BadgeImageType = z.enum(['image/png', 'image/webp', 'image/jpeg']);
export const AdminBadge = named(
  'AdminBadge',
  z.object({
    id: Id,
    key: BadgeKey,
    title: z.string().max(60),
    description: z.string().max(300),
    threshold: z.number().int().min(1),
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(1000),
    image: z.object({ hash: z.string().regex(/^[a-f0-9]{16,64}$/), contentType: BadgeImageType, bytes: z.number().int().min(1), width: z.number().int().min(1), height: z.number().int().min(1) }).nullable(),
    holders: z.number().int().min(0),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime
  })
);
export const CreateBadgeBody = named(
  'CreateBadgeBody',
  z
    .object({
      key: BadgeKey,
      title: z.string().trim().min(2).max(60),
      description: z.string().trim().max(300).default(''),
      threshold: z.number().int().min(1).max(1_000_000),
      active: z.boolean().default(true),
      sortOrder: z.number().int().min(0).max(1000).default(100)
    })
    .strict()
);
export const UpdateBadgeBody = named(
  'UpdateBadgeBody',
  z
    .object({
      title: z.string().trim().min(2).max(60).optional(),
      description: z.string().trim().max(300).optional(),
      threshold: z.number().int().min(1).max(1_000_000).optional(),
      active: z.boolean().optional(),
      sortOrder: z.number().int().min(0).max(1000).optional()
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, { message: 'دست‌کم یک فیلد لازم است.' })
);
/** H-36: تصویر به‌صورت base64 (≤ ۲۰۰KB خام؛ ابعاد ≤ ۱۰۲۴px؛ SVG ممنوع؛ نوع با magic bytes بررسی می‌شود) */
export const BadgeImageBody = named(
  'BadgeImageBody',
  z.object({ contentType: BadgeImageType, dataBase64: z.string().min(16).max(280_000).regex(/^[A-Za-z0-9+/]+={0,2}$/) }).strict()
);

// ───── پیام همگانی (inbox؛ فقط درون‌برنامه — بدون پیامک/پوش) ─────
export const AnnouncementAudience = named(
  'AnnouncementAudience',
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('all') }).strict(),
    z.object({ type: z.literal('users'), userIds: z.array(Id).min(1).max(1000) }).strict(),
    z.object({ type: z.literal('role'), role: SystemRoleKey }).strict(),
    z.object({ type: z.literal('session'), sessionId: Id, roles: z.array(SessionRole).min(1).max(4).optional() }).strict()
  ])
);
export const CreateAnnouncementBody = named(
  'CreateAnnouncementBody',
  z
    .object({
      audience: AnnouncementAudience,
      title: z.string().trim().min(2).max(120),
      body: z.string().trim().min(2).max(500),
      ref: z.string().regex(/^(session:[A-Za-z0-9_-]{1,64}|points|badge:[A-Za-z0-9_-]{1,64})$/).optional()
    })
    .strict()
);
export const Announcement = named(
  'Announcement',
  z.object({
    id: Id,
    audience: AnnouncementAudience,
    title: z.string().max(120),
    body: z.string().max(500),
    ref: z.string().max(200).nullable(),
    status: z.enum(['queued', 'sending', 'done', 'failed']),
    recipients: z.number().int().min(0).nullable(),
    delivered: z.number().int().min(0).nullable(),
    read: z.number().int().min(0).nullable(),
    createdBy: z.object({ id: Id, name: z.string().max(80) }),
    createdAt: IsoDateTime
  })
);

// ───── خروجی CSV (سمت سرور؛ BOM UTF-8؛ خنثی‌سازی فرمول) ─────
export const SessionExportQuery = z.object({
  kind: z.enum(['members', 'attendance', 'evaluations']).default('members'),
  occurrenceId: Id.optional()
});

export const AdminDecideBody = named('AdminDecideBody', z.object({ action: z.enum(['approve', 'reject']) }).strict());
export const AdminAttendanceList = named('AdminAttendanceList', z.object({ items: z.array(AttendanceEntry), total: z.number().int().min(0), occurrenceId: Id.nullable().default(null) }));
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


export const Flags = z.object({ maintenance_mode: z.boolean(), registration_open: z.boolean() }).strict();

export const SystemSettings = named(
  'SystemSettings',
  z.object({
    version: z.number().int().min(1).meta({ description: 'نسخهٔ خوش‌بینانه (optimistic concurrency)' }),
    flags: Flags,
    updatedAt: IsoDateTime,
    updatedBy: z.string().max(80)
  })
);
export const UpdateSettingsBody = named(
  'UpdateSettingsBody',
  z
    .object({ version: z.number().int().min(1), flags: Flags })
    .strict()
    .meta({ description: '۱.۷.۰: evalWeights (⇒ معیارهای ارزیابی H-100..H-103) و badgeThresholds (⇒ نشان‌ها H-32..H-37) حذف شدند' })
);

export const AuditTargetType = named('AuditTargetType', z.enum(['user', 'role', 'settings', 'session', 'permission', 'module', 'badge', 'announcement', 'criterion', 'supporter', 'gallery', 'comment']));
export const AuditEntry = named(
  'AuditEntry',
  z.object({
    id: Id,
    at: IsoDateTime,
    actor: z.object({ id: Id, name: z.string().max(80) }),
    action: z.string().regex(/^[a-z_]+(\.[a-z_]+)+$/).max(64),
    target: z
      .object({ type: AuditTargetType, id: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/).meta({ description: 'شناسه یا کلید (کلید مجوز نقطه‌دار مجاز)' }), label: z.string().max(120) })
      .optional(),
    summary: z.string().max(300),
    meta: z.record(z.string(), z.unknown()).meta({ description: 'جزئیات فنی بدون PII حساس (OTP/توکن/رمز هرگز)' })
  })
);
export const AuditQuery = z.object({
  action: z.string().max(64).optional().meta({ description: 'نوع دقیق اقدام یا پیشوند (مثلاً `user.`)' }),
  q: z.string().trim().max(60).optional(),
  actorId: Id.optional(),
  targetType: AuditTargetType.optional(),
  targetId: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/).optional(),
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
// ───────── ۱.۷.۰ (docs-v2/31): سطح، معیار ارزیابی، گالری، کامنت ─────────
export const RolesQuery = pageQuery(10).extend({ tier: Tier.optional() });
export const ModulesQuery = pageQuery(50).extend({ tier: Tier.optional() });

/** معیار ارزیابی (high منبع حقیقت؛ کش mid با evaluation.criteria.changed) */
export const EvaluationCriterion = named(
  'EvaluationCriterion',
  z.object({
    id: Id,
    key: CriterionKey,
    title: z.string().max(60),
    description: z.string().max(300),
    weight: z.number().int().min(1).max(100),
    maxScore: z.number().int().min(1).max(100),
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(1000),
    used: z.boolean().meta({ description: 'در دست‌کم یک ارزیابی استفاده شده ⇒ حذف ممنوع (فقط غیرفعال)' }),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime
  })
);
export const EvaluationCriteriaList = named(
  'EvaluationCriteriaList',
  z.object({ version: z.number().int().min(1), items: z.array(EvaluationCriterion).max(15) }),
  'همهٔ معیارها (فعال و غیرفعال) به ترتیب sortOrder؛ حداکثر ۱۵'
);
const CriterionTitle = z.string().trim().min(2).max(60);
export const CreateCriterionBody = named(
  'CreateCriterionBody',
  z
    .object({
      key: CriterionKey,
      title: CriterionTitle,
      description: z.string().trim().max(300).default(''),
      weight: z.number().int().min(1).max(100),
      maxScore: z.number().int().min(1).max(100).default(10),
      active: z.boolean().default(true),
      sortOrder: z.number().int().min(0).max(1000).default(100)
    })
    .strict()
);
export const UpdateCriterionBody = named(
  'UpdateCriterionBody',
  z
    .object({
      title: CriterionTitle.optional(),
      description: z.string().trim().max(300).optional(),
      weight: z.number().int().min(1).max(100).optional(),
      maxScore: z.number().int().min(1).max(100).optional(),
      active: z.boolean().optional(),
      sortOrder: z.number().int().min(0).max(1000).optional()
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, { message: 'دست‌کم یک فیلد لازم است.' })
    .meta({ description: 'کلید معیار ثابت است (snapshot ارزیابی‌ها)' })
);

export const AdminGalleriesQuery = GalleriesQuery.extend({ occurrenceId: Id.optional() });
export const AdminCreateGalleryBody = named('AdminCreateGalleryBody', CreateGalleryBody.extend({ occurrenceId: Id }).strict());
export const AdminCommentsQuery = CommentsQuery.extend({
  occurrenceId: Id.optional(),
  authorId: Id.optional(),
  hidden: z.enum(['true', 'false']).optional().meta({ description: 'نبود = همه' })
});

export { Uuid };
export const LeaderboardResponse = named('LeaderboardResponse', z.object({ items: z.array(LeaderboardItem) }));
