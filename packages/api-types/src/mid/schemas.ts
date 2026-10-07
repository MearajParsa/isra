import { z } from 'zod';
import { Id, IranMobile, IsoDateTime, named, pageQuery } from '../core/primitives';
import { MidSession, Occurrence, PublicSessionStatus } from '../domain/session';

export const SessionRole = named('SessionRole', z.enum(['session_manager', 'session_supporter', 'teacher', 'quran_student']));
export const MembershipStatus = named('MembershipStatus', z.enum(['pending', 'approved', 'rejected']));
export const Permission = named(
  'SessionPermission',
  z.enum([
    'session.edit',
    'session.transition',
    'membership.approve',
    'membership.roles',
    'queue.manage',
    'eval.submit',
    'attendance.view',
    'attendance.manage',
    'occurrence.manage'
  ]),
  'مجوز درون‌جلسه؛ اجتماع مجوزهای نقش‌ها. manager به‌تنهایی eval.submit ندارد (قفل #15).'
);

/**
 * ماتریس نقش جلسه → مجوز (منبع حقیقت مشترک mid و H-48). ۱.۶.۰: attendance.manage (ثبت حضور توسط کادر) و
 * occurrence.manage (باز/بستن نوبت برگزاری) برای manager/supporter/teacher.
 */
export const SESSION_ROLE_PERMISSIONS = {
  session_manager: ['session.edit', 'session.transition', 'membership.approve', 'membership.roles', 'queue.manage', 'attendance.view', 'attendance.manage', 'occurrence.manage'],
  session_supporter: ['membership.approve', 'queue.manage', 'eval.submit', 'attendance.view', 'attendance.manage', 'occurrence.manage'],
  teacher: ['queue.manage', 'eval.submit', 'attendance.view', 'attendance.manage', 'occurrence.manage'],
  quran_student: []
} as const satisfies Record<'session_manager' | 'session_supporter' | 'teacher' | 'quran_student', readonly string[]>;

/** نقش‌هایی که کادر (یا ادمین) هنگام افزودن عضو می‌دهد؛ مدیر جلسه فقط از مسیر مخصوص (M-16/H-74/H-68) */
export const StaffAssignableRole = z.enum(['session_supporter', 'teacher', 'quran_student']);

export const MidMe = named('MidMe', z.object({ canCreateSession: z.boolean(), hasStaffRole: z.boolean() }));

export const MySessionsQuery = pageQuery(50).extend({
  scope: z.enum(['all', 'staff']).default('all'),
  status: z.enum(['draft', 'scheduled', 'started', 'ended']).optional(),
  role: z.enum(['session_manager', 'session_supporter', 'teacher', 'quran_student']).optional()
});
/** M-06 کشف/جست‌وجوی جلسات عمومی (فقط visibility=public، بدون draft) */
export const SessionsSearchQuery = pageQuery(50).extend({
  q: z.string().trim().min(2).max(60).optional().meta({ description: 'عنوان یا آدرس' }),
  status: PublicSessionStatus.optional(),
  weekday: z.coerce.number().int().min(0).max(6).optional().meta({ description: '۰=شنبه … ۶=جمعه' })
});
export const MySessionItem = named(
  'MySessionItem',
  z.object({
    session: MidSession,
    roles: z.array(SessionRole).max(4),
    membership: MembershipStatus,
    pendingCount: z.number().int().min(0).optional().meta({ description: 'فقط برای دارندگان membership.approve' })
  })
);

const EvalWeightsView = z.object({ voice: z.number().int().min(0).max(100), tone: z.number().int().min(0).max(100), tajweed: z.number().int().min(0).max(100) });

export const SessionMe = named(
  'SessionMe',
  z.object({
    session: MidSession,
    membership: z.object({ status: MembershipStatus, roles: z.array(SessionRole).max(4) }).nullable(),
    permissions: z.array(Permission),
    myAttendance: z.object({ enteredAt: IsoDateTime }).nullable().meta({ description: 'حضور من در نوبت جاری/آخر' }),
    occurrence: Occurrence.nullable().optional().meta({ description: 'نوبت باز (live) یا آخرین نوبت؛ null = هنوز برگزار نشده' }),
    evalWeights: EvalWeightsView.meta({ description: 'وزن‌های فعلی ارزیابی (از high) برای پیش‌نمایش امتیاز در فرم؛ مقدار ذخیره‌شده روی هر ارزیابی وزن لحظهٔ ثبت است' })
  })
);

export const TransitionBody = named('TransitionBody', z.object({ to: z.enum(['scheduled', 'started', 'ended']) }).strict());

export const Member = named(
  'Member',
  z.object({ id: Id, userId: Id, name: z.string().max(80), roles: z.array(SessionRole).max(4), status: MembershipStatus, requestedAt: IsoDateTime })
);
export const MembersQuery = pageQuery(100).extend({
  status: MembershipStatus.optional(),
  role: SessionRole.optional(),
  q: z.string().trim().min(1).max(40).optional().meta({ description: 'جست‌وجوی نام' })
});

// ───── افزودن مستقیم عضو (۱.۶.۰) ─────
const MemberRef = z
  .object({ userId: Id.optional(), phone: IranMobile.optional() })
  .strict()
  .refine((v) => (v.userId ? 1 : 0) + (v.phone ? 1 : 0) === 1, { message: 'دقیقاً یکی از userId یا phone لازم است.' });
export const AddMembersBody = named(
  'AddMembersBody',
  z
    .object({
      items: z
        .array(z.object({ user: MemberRef, roles: z.array(StaffAssignableRole).min(1).max(3).default(['quran_student']) }).strict())
        .min(1)
        .max(50),
      onExisting: z.enum(['skip', 'merge']).default('skip').meta({ description: 'skip: عضو تأییدشده دست نمی‌خورد؛ merge: نقش‌ها اضافه می‌شوند' }),
      notify: z.boolean().default(true)
    })
    .strict()
    .meta({ description: 'مدیر: هر نقش غیرمدیر؛ پشتیبان: فقط quran_student. phone با سقف durable per actor (۲۰/دقیقه، ۱۰۰/روز) resolve می‌شود و هرگز لاگ/ذخیره نمی‌شود.' })
);
export const AddMemberOutcome = named(
  'AddMemberOutcome',
  z.enum(['added', 'approved', 'merged', 'replaced', 'unchanged', 'created_and_added', 'not_found', 'not_active', 'full', 'failed'])
);
export const AddMembersResult = named(
  'AddMembersResult',
  z.object({
    items: z.array(z.object({ index: z.number().int().min(0), userId: Id.nullable(), outcome: AddMemberOutcome, member: Member.nullable() })),
    added: z.number().int().min(0),
    skipped: z.number().int().min(0)
  })
);
/** M-16: اعطا/سلب نقش مدیر؛ manager=true + stepDown=true ⇒ انتقال اتمیک مدیریت از خودم */
export const ManagerBody = named('ManagerBody', z.object({ manager: z.boolean(), stepDown: z.boolean().default(false) }).strict());

// ───── فهرست حاضر/غایب (roster) ─────
export const RosterQuery = pageQuery(100).extend({
  occurrenceId: Id.optional().meta({ description: 'پیش‌فرض: نوبت باز یا آخرین نوبت' }),
  present: z.enum(['true', 'false']).optional(),
  role: SessionRole.optional(),
  q: z.string().trim().min(1).max(40).optional()
});
export const RosterItem = named(
  'RosterItem',
  z.object({
    memberId: Id,
    userId: Id,
    name: z.string().max(80),
    roles: z.array(SessionRole).max(4),
    enteredAt: IsoDateTime.nullable(),
    attendanceSource: z.enum(['self', 'staff', 'admin']).nullable(),
    queueStatus: z.enum(['waiting', 'current', 'done']).nullable()
  })
);

// ───── نوبت‌ها ─────
export const OccurrencesQuery = pageQuery(50);
export { Occurrence };
export const DecideBody = named('DecideBody', z.object({ action: z.enum(['approve', 'reject']) }).strict());
export const SetRolesBody = named(
  'SetRolesBody',
  z.object({ roles: z.array(z.enum(['session_supporter', 'teacher', 'quran_student'])).max(3) }).strict().meta({ description: 'نقش مدیر از این مسیر عوض نمی‌شود؛ آرایهٔ خالی = فقط قرآن‌آموز' })
);

export const AttendanceEntry = named(
  'AttendanceEntry',
  z.object({
    userId: Id,
    name: z.string().max(80),
    enteredAt: IsoDateTime,
    source: z.enum(['self', 'staff', 'admin']).default('self'),
    occurrenceId: Id.nullable().default(null)
  })
);
export const AttendanceResult = named(
  'AttendanceResult',
  z.object({
    entry: AttendanceEntry,
    pointsAwarded: z.union([z.literal(0), z.literal(5)]).meta({ description: '+۵ فقط اولین بار در هر نوبت؛ تکرار ⇒ ۰ (قفل #12)' }),
    alreadyPresent: z.boolean()
  })
);
export const AttendanceList = named(
  'AttendanceList',
  z.object({ items: z.array(AttendanceEntry), total: z.number().int().min(0), occurrenceId: Id.nullable().default(null) })
);
export const AttendanceQuery = pageQuery(100).extend({ occurrenceId: Id.optional().meta({ description: 'پیش‌فرض: نوبت باز یا آخرین نوبت' }) });
/** M-22 ثبت حضور توسط کادر (نوبت باز) */
export const MarkAttendanceBody = named('MarkAttendanceBody', z.object({ userIds: z.array(Id).min(1).max(100) }).strict());
export const MarkAttendanceResult = named(
  'MarkAttendanceResult',
  z.object({
    occurrenceId: Id,
    items: z.array(
      z.object({
        userId: Id,
        outcome: z.enum(['marked', 'already', 'not_member']),
        pointsAwarded: z.union([z.literal(0), z.literal(5)])
      })
    )
  })
);
/** M-23 لغو حضور اشتباه: −۵ با ثبت در دفتر (attendance_reversal)؛ نشان زیر آستانه پس گرفته می‌شود */
export const RevokeAttendanceBody = named(
  'RevokeAttendanceBody',
  z.object({ occurrenceId: Id.optional(), reason: z.string().trim().min(3).max(200) }).strict()
);
export const RevokeAttendanceResult = named('RevokeAttendanceResult', z.object({ occurrenceId: Id, revoked: z.boolean(), pointsReversed: z.number().int().min(0) }));

export const QueueItem = named(
  'QueueItem',
  z.object({
    id: Id,
    userId: z.string().max(64).meta({ description: 'برای غیرکادر (غیر از خودِ کاربر) خالی است — حریم خصوصی' }),
    name: z.string().max(80).nullable(),
    status: z.enum(['waiting', 'current', 'done']),
    position: z.number().int().min(1).nullable(),
    joinedAt: IsoDateTime,
    evaluated: z.boolean(),
    isMe: z.boolean()
  })
);
export const QueueState = named(
  'QueueState',
  z.object({
    occurrenceId: Id.nullable().default(null),
    current: QueueItem.nullable(),
    waiting: z.array(QueueItem),
    done: z.array(QueueItem),
    myItem: QueueItem.nullable(),
    myPosition: z.number().int().min(1).nullable(),
    waitingCount: z.number().int().min(0)
  })
);
export const QueueActBody = named('QueueActBody', z.object({ action: z.enum(['up', 'down', 'skip', 'remove']) }).strict());
export const QueueQuery = z.object({ occurrenceId: Id.optional() });
/** M-35 قرار دادن قرآن‌آموز در صف توسط کادر (مثلاً کسی که اپ ندارد) */
export const EnqueueBody = named(
  'EnqueueBody',
  z.object({ userId: Id, markPresent: z.boolean().default(false).meta({ description: 'هم‌زمان حضور هم ثبت شود (نیازمند attendance.manage)' }) }).strict()
);

const Score = z.number().int().min(0).max(10);
export const EvaluationBody = named(
  'EvaluationBody',
  z.object({ queueItemId: Id, voice: Score, tone: Score, tajweed: Score, note: z.string().trim().max(300).optional() }).strict()
);
export const EvaluationWeights = named(
  'EvaluationWeights',
  z.object({ voice: z.number().int().min(0).max(100), tone: z.number().int().min(0).max(100), tajweed: z.number().int().min(0).max(100) })
);
export const Evaluation = named(
  'Evaluation',
  z.object({
    id: Id,
    sessionId: Id,
    queueItemId: Id,
    userId: Id,
    userName: z.string().max(80),
    evaluatorName: z.string().max(80),
    voice: Score,
    tone: Score,
    tajweed: Score,
    weights: EvaluationWeights.meta({ description: 'وزن‌های زمان ثبت (از high)' }),
    score: z.number().int().min(0).max(100).meta({ description: 'میانگین وزنی ×۱۰؛ پیش‌فرض ۴·صوت + ۳·لحن + ۳·تجوید' }),
    points: z.number().int().min(0).max(10),
    note: z.string().max(300),
    createdAt: IsoDateTime,
    occurrenceId: Id.nullable().default(null),
    status: z.enum(['active', 'void']).default('active'),
    updatedAt: IsoDateTime.nullable().default(null)
  })
);
export const EvaluationsQuery = pageQuery(100).extend({ occurrenceId: Id.optional(), includeVoid: z.enum(['true', 'false']).default('false') });
/** M-43 ویرایش ارزیابی (فقط ارزیاب اصلی، تا ۲۴ ساعت)؛ اختلاف امتیاز در دفتر (evaluation_adjust) */
export const EvaluationPatchBody = named(
  'EvaluationPatchBody',
  z
    .object({ voice: Score.optional(), tone: Score.optional(), tajweed: Score.optional(), note: z.string().trim().max(300).optional() })
    .strict()
    .refine((v) => Object.keys(v).length > 0, { message: 'دست‌کم یک فیلد لازم است.' })
);
/** M-44 باطل‌کردن ارزیابی: امتیازش کسر می‌شود (evaluation_void) */
export const VoidEvaluationBody = named('VoidEvaluationBody', z.object({ reason: z.string().trim().min(3).max(200) }).strict());

// ───── دعوت (۱.۶.۰) ─────
export const CreateInviteBody = named(
  'CreateInviteBody',
  z
    .object({
      roles: z.array(StaffAssignableRole).min(1).max(3).default(['quran_student']),
      maxUses: z.number().int().min(1).max(500).nullable().default(null),
      expiresInHours: z.number().int().min(1).max(720).default(168)
    })
    .strict()
);
export const Invite = named(
  'Invite',
  z.object({
    id: Id,
    roles: z.array(StaffAssignableRole),
    maxUses: z.number().int().min(1).nullable(),
    uses: z.number().int().min(0),
    expiresAt: IsoDateTime,
    revokedAt: IsoDateTime.nullable(),
    createdAt: IsoDateTime,
    createdBy: z.object({ id: Id, name: z.string().max(80) })
  })
);
export const CreatedInvite = named(
  'CreatedInvite',
  Invite.extend({ code: z.string().regex(/^[A-Za-z0-9_-]{22,64}$/).meta({ description: 'فقط همین یک‌بار نمایش داده می‌شود (روی سرور فقط hash ذخیره است)' }) })
);
export const AcceptInviteBody = named('AcceptInviteBody', z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{22,64}$/) }).strict());

// ───── امتیاز ─────
export const PointsLedgerQuery = pageQuery(50);

/** رویدادهای Socket.IO — فقط «سیگنال»؛ داده از REST گرفته می‌شود (D3) */
export const LiveEvent = named(
  'LiveEvent',
  z.object({
    type: z.enum(['attendance.updated', 'queue.updated', 'queue.turned', 'eval.updated', 'session.state', 'members.updated', 'session.updated', 'occurrence.updated']),
    sessionId: Id,
    payload: z.record(z.string(), z.unknown()).optional()
  })
);
export const SessionJoinMessage = named('SessionJoinMessage', z.object({ sessionId: Id }).strict());
