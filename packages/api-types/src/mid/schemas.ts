import { z } from 'zod';
import { Id, IranMobile, IsoDateTime, SafeText, named, pageQuery } from '../core/primitives';
import { CommentVisibility, MidSession, Occurrence, PublicSessionStatus } from '../domain/session';

/**
 * ۱.۷.۰ (docs-v2/31 §۲): نقش درون جلسه. owner = استاد صاحب جلسه (همهٔ مجوزها)؛ supporter = پشتیبان (ثابتِ استاد یا per جلسه)
 * با مجوزهای واگذارشده؛ member = عضو (قرآن‌آموز). جایگزین session_manager/session_supporter/teacher/quran_student.
 */
export const SessionRole = named('SessionRole', z.enum(['owner', 'supporter', 'member']));
export const MembershipStatus = named('MembershipStatus', z.enum(['pending', 'approved', 'rejected']));

/**
 * کاتالوگ مجوزهای درون‌جلسه که صاحب (یا ادمین) به پشتیبان واگذار می‌کند (منبع حقیقت مشترک mid، M-68 و H-48).
 * صاحب جلسه همه را دارد؛ عضو عادی هیچ‌کدام. قفل #15: ارزیاب = صاحب، پشتیبانِ دارای eval.submit، یا ادمین.
 */
export const SESSION_DELEGABLE_PERMISSIONS = [
  { key: 'membership.approve', title: 'تأیید/رد درخواست عضویت' },
  { key: 'membership.manage', title: 'افزودن و حذف عضو، فهرست اعضا و دعوت' },
  { key: 'attendance.manage', title: 'کنترل ورود/خروج و ثبت/لغو حضور' },
  { key: 'queue.manage', title: 'مدیریت صف تلاوت' },
  { key: 'eval.submit', title: 'ثبت و ویرایش ارزیابی' },
  { key: 'gallery.manage', title: 'مدیریت گالری‌ها و بارگذاری فایل' },
  { key: 'comment.moderate', title: 'پنهان/حذف کامنت‌ها' },
  { key: 'occurrence.manage', title: 'باز و بستن نوبت برگزاری' },
  { key: 'session.edit', title: 'ویرایش و تغییر وضعیت جلسه' }
] as const;
export type SessionPermissionKey = (typeof SESSION_DELEGABLE_PERMISSIONS)[number]['key'];
const PERMISSION_KEYS = SESSION_DELEGABLE_PERMISSIONS.map((p) => p.key) as [SessionPermissionKey, ...SessionPermissionKey[]];

export const Permission = named(
  'SessionPermission',
  z.enum(PERMISSION_KEYS),
  'مجوز درون‌جلسه (۱.۷.۰). صاحب جلسه همه را دارد؛ پشتیبان = اجتماع مجوزهای ثابت (استاد) و per جلسه.'
);
/** فهرست مجوزهای پشتیبان: یکتا، ۱ تا ۹ */
export const SupporterPermissions = z
  .array(Permission)
  .min(1)
  .max(PERMISSION_KEYS.length)
  .refine((a) => new Set(a).size === a.length, { message: 'مجوز تکراری است.' });

/** M-68 / H-48: کاتالوگ مجوزهای قابل‌واگذاری با عنوان فارسی */
export const SessionPermissionCatalog = named(
  'SessionPermissionCatalog',
  z.object({ permissions: z.array(z.object({ key: Permission, title: z.string().max(80) })) })
);

export const MidMe = named(
  'MidMe',
  z.object({
    canCreateSession: z.boolean().meta({ description: 'مجوز مؤثر session.create (نقش teacher یا grant)' }),
    hasStaffRole: z.boolean().meta({ description: '۱.۷.۰: صاحب یا پشتیبان دست‌کم یک جلسه (یا پشتیبان ثابت یک استاد)' })
  })
);

export const MySessionsQuery = pageQuery(50).extend({
  scope: z.enum(['all', 'staff']).default('all').meta({ description: 'staff = جلسه‌هایی که صاحب یا پشتیبانم (شامل draft)' }),
  status: z.enum(['draft', 'scheduled', 'started', 'ended']).optional(),
  role: SessionRole.optional()
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
    role: SessionRole.meta({ description: '۱.۷.۰: بالاترین نقش من در جلسه (owner > supporter > member)' }),
    membership: MembershipStatus.nullable().meta({ description: 'وضعیت عضویت (فقط برای member؛ صاحب/پشتیبان ⇒ null)' }),
    pendingCount: z.number().int().min(0).optional().meta({ description: 'فقط برای دارندگان membership.approve' })
  })
);

export const SessionMe = named(
  'SessionMe',
  z.object({
    session: MidSession,
    role: SessionRole.nullable().meta({ description: '۱.۷.۰: owner | supporter | member (عضو تأییدشده) | null' }),
    membership: z.object({ status: MembershipStatus }).nullable().meta({ description: 'ردیف عضویت من (درخواست/عضو)؛ صاحب/پشتیبانِ غیرعضو ⇒ null' }),
    permissions: z.array(Permission).meta({ description: 'صاحب ⇒ همه؛ پشتیبان ⇒ اجتماع ثابت و per جلسه؛ عضو ⇒ []' }),
    myAttendance: z.object({ enteredAt: IsoDateTime }).nullable().meta({ description: 'حضور من در نوبت جاری/آخر' }),
    occurrence: Occurrence.nullable().optional().meta({ description: 'نوبت باز (live) یا آخرین نوبت؛ null = هنوز برگزار نشده' })
  }),
  '۱.۷.۰: evalWeights حذف شد — معیارهای فعال از M-45'
);

export const TransitionBody = named('TransitionBody', z.object({ to: z.enum(['scheduled', 'started', 'ended']) }).strict());

export const Member = named(
  'Member',
  z.object({ id: Id, userId: Id, name: z.string().max(80), status: MembershipStatus, requestedAt: IsoDateTime }),
  '۱.۷.۰: فقط اعضا (قرآن‌آموز)؛ صاحب و پشتیبان‌ها جدا (M-64)'
);
export const MembersQuery = pageQuery(100).extend({
  status: MembershipStatus.optional(),
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
        .array(z.object({ user: MemberRef }).strict())
        .min(1)
        .max(50),
      notify: z.boolean().default(true)
    })
    .strict()
    .meta({ description: '۱.۷.۰: فقط عضو (بدون نقش؛ پشتیبان از M-65). عضو تأییدشده ⇒ unchanged؛ pending/rejected ⇒ approved. phone با سقف durable per actor (۲۰/دقیقه، ۱۰۰/روز) resolve می‌شود و هرگز لاگ/ذخیره نمی‌شود.' })
);
export const AddMemberOutcome = named(
  'AddMemberOutcome',
  z.enum(['added', 'approved', 'unchanged', 'created_and_added', 'not_found', 'not_active', 'full', 'failed'])
);
export const AddMembersResult = named(
  'AddMembersResult',
  z.object({
    items: z.array(z.object({ index: z.number().int().min(0), userId: Id.nullable(), outcome: AddMemberOutcome, member: Member.nullable() })),
    added: z.number().int().min(0),
    skipped: z.number().int().min(0)
  })
);

// ───── فهرست حاضر/غایب (roster) ─────
export const RosterQuery = pageQuery(100).extend({
  occurrenceId: Id.optional().meta({ description: 'پیش‌فرض: نوبت باز یا آخرین نوبت' }),
  present: z.enum(['true', 'false']).optional(),
  q: z.string().trim().min(1).max(40).optional()
});
export const RosterItem = named(
  'RosterItem',
  z.object({
    memberId: Id,
    userId: Id,
    name: z.string().max(80),
    enteredAt: IsoDateTime.nullable(),
    attendanceSource: z.enum(['self', 'staff', 'admin']).nullable(),
    queueStatus: z.enum(['waiting', 'current', 'done']).nullable()
  })
);

// ───── نوبت‌ها ─────
export const OccurrencesQuery = pageQuery(50);
export { Occurrence };
export const DecideBody = named('DecideBody', z.object({ action: z.enum(['approve', 'reject']) }).strict());

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

// ───── ارزیابی با معیارهای پویا (۱.۷.۰؛ docs-v2/31 §۳) ─────
/** کلید پایدار معیار (در snapshot ذخیره می‌شود) */
export const CriterionKey = z.string().regex(/^[a-z][a-z0-9_]{1,31}$/, 'کلید معیار: حروف کوچک انگلیسی/عدد/_').meta({ example: 'tajweed' });
const CriterionScore = z.number().int().min(0).max(100).meta({ description: 'نمرهٔ معیار: ۰ تا maxScore همان معیار (بررسی سمت سرور)' });
const Note = z.string().trim().max(300);
/** نمره‌ها: یکتا per معیار؛ حداکثر ۱۵ معیار */
export const EvaluationScores = z
  .array(z.object({ criterionId: Id, score: CriterionScore }).strict())
  .min(1)
  .max(15)
  .refine((a) => new Set(a.map((x) => x.criterionId)).size === a.length, { message: 'معیار تکراری است.' });

/** M-45: معیارهای فعال فعلی (برای فرم ارزیابی و پیش‌نمایش امتیاز) */
export const ActiveCriterion = named(
  'ActiveCriterion',
  z.object({ id: Id, key: CriterionKey, title: z.string().max(60), description: z.string().max(300), weight: z.number().int().min(1).max(100), maxScore: z.number().int().min(1).max(100), sortOrder: z.number().int().min(0).max(1000) })
);
export const ActiveCriteria = named(
  'ActiveCriteria',
  z.object({ version: z.number().int().min(1).meta({ description: 'نسخهٔ کاتالوگ معیارها (رویداد evaluation.criteria.changed)' }), items: z.array(ActiveCriterion).min(1).max(15) })
);
/** snapshot معیار روی هر ارزیابی: تغییر/حذف بعدی معیار روی ارزیابی ثبت‌شده اثر ندارد */
export const EvaluationCriterionScore = named(
  'EvaluationCriterionScore',
  z.object({ criterionId: Id, key: CriterionKey, title: z.string().max(60), weight: z.number().int().min(1).max(100), maxScore: z.number().int().min(1).max(100), score: CriterionScore })
);

export const EvaluationBody = named(
  'EvaluationBody',
  z
    .object({ queueItemId: Id, scores: EvaluationScores, note: Note.optional() })
    .strict()
    .meta({ description: '`scores` باید دقیقاً همهٔ معیارهای فعال فعلی را پوشش دهد (کم/زیاد/غیرفعال ⇒ VALIDATION_FAILED با fields.scores)؛ score ≤ maxScore.' })
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
    criteria: z.array(EvaluationCriterionScore).min(1).max(15).meta({ description: 'snapshot معیارها و نمره‌ها در لحظهٔ ثبت (ارزیابی‌های قدیمی: صوت/لحن/تجوید با وزن‌های زمان ثبت)' }),
    score: z.number().int().min(0).max(100).meta({ description: 'round(Σ(score/maxScore × weight) / Σweight × ۱۰۰)' }),
    points: z.number().int().min(0).max(10).meta({ description: 'round(score/10)' }),
    note: z.string().max(300),
    createdAt: IsoDateTime,
    occurrenceId: Id.nullable().default(null),
    status: z.enum(['active', 'void']).default('active'),
    updatedAt: IsoDateTime.nullable().default(null)
  })
);
export const EvaluationsQuery = pageQuery(100).extend({ occurrenceId: Id.optional(), includeVoid: z.enum(['true', 'false']).default('false') });
/** M-43 ویرایش ارزیابی (ارزیاب اصلی یا صاحب، تا ۲۴ ساعت)؛ فقط معیارهای همان snapshot؛ اختلاف امتیاز در دفتر (evaluation_adjust) */
export const EvaluationPatchBody = named(
  'EvaluationPatchBody',
  z
    .object({ scores: EvaluationScores.optional().meta({ description: 'فقط معیارهای موجود در snapshot همان ارزیابی؛ معیارِ نیامده بدون تغییر' }), note: Note.optional() })
    .strict()
    .refine((v) => v.scores !== undefined || v.note !== undefined, { message: 'دست‌کم یک فیلد لازم است.' })
);
/** M-44 باطل‌کردن ارزیابی: امتیازش کسر می‌شود (evaluation_void) */
export const VoidEvaluationBody = named('VoidEvaluationBody', z.object({ reason: z.string().trim().min(3).max(200) }).strict());

// ───── دعوت (۱.۶.۰) ─────
export const CreateInviteBody = named(
  'CreateInviteBody',
  z
    .object({
      maxUses: z.number().int().min(1).max(500).nullable().default(null),
      expiresInHours: z.number().int().min(1).max(720).default(168)
    })
    .strict()
);
export const Invite = named(
  'Invite',
  z.object({
    id: Id,
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

// ───── پشتیبان (۱.۷.۰؛ docs-v2/31 §۲) ─────
const UserRef = z
  .object({ userId: Id.optional(), phone: IranMobile.optional() })
  .strict()
  .refine((v) => (v.userId ? 1 : 0) + (v.phone ? 1 : 0) === 1, { message: 'دقیقاً یکی از userId یا phone لازم است.' });
/** پشتیبان ثابت استاد (در همهٔ جلسه‌های حال و آیندهٔ او) */
export const TeacherSupporter = named(
  'TeacherSupporter',
  z.object({ userId: Id, name: z.string().max(80), permissions: z.array(Permission), createdAt: IsoDateTime })
);
/** پشتیبان مؤثر یک جلسه: مجوز مؤثر = اجتماع ثابت (teacher) و per جلسه (session) */
export const SessionSupporter = named(
  'SessionSupporter',
  z.object({
    userId: Id,
    name: z.string().max(80),
    permissions: z.array(Permission).meta({ description: 'اجتماع teacher ∪ session' }),
    sources: z.object({
      teacher: z.array(Permission).nullable().meta({ description: 'مجوزهای پشتیبان ثابت استاد صاحب (null = پشتیبان ثابت نیست)' }),
      session: z.array(Permission).nullable().meta({ description: 'مجوزهای per جلسه (null = ردیف per جلسه ندارد)' })
    }),
    createdAt: IsoDateTime
  })
);
export const SupportersQuery = pageQuery(100);
/** M-61 / M-65: افزودن پشتیبان با userId یا شماره (resolve از low؛ سقف durable مثل M-14؛ شماره لاگ نمی‌شود) */
export const AddSupporterBody = named('AddSupporterBody', z.object({ user: UserRef, permissions: SupporterPermissions }).strict());
/** M-62 / M-66 / H-105 / H-108: تعیین (جایگزینی کامل) مجوزهای پشتیبان */
export const SupporterPermissionsBody = named('SupporterPermissionsBody', z.object({ permissions: SupporterPermissions }).strict());

// ───── گالری (۱.۷.۰؛ docs-v2/31 §۴) ─────
export const GalleryKind = named('GalleryKind', z.enum(['image', 'audio']));
export const GalleryVisibility = named(
  'GalleryVisibility',
  z.enum(['public', 'members', 'staff']),
  'public = هر کس با gallery.view (شامل مهمان؛ جلسهٔ unlisted فقط با شناسهٔ مستقیم)؛ members = اعضای تأییدشده + کادر؛ staff = صاحب/پشتیبان/ادمین'
);
export const GALLERY_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const GALLERY_AUDIO_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/aac'] as const;
export const GALLERY_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const GALLERY_AUDIO_MAX_BYTES = 50 * 1024 * 1024;
export const GalleryMime = z.enum([...GALLERY_IMAGE_TYPES, ...GALLERY_AUDIO_TYPES]);
const GalleryTitle = SafeText(2, 80);

export const Gallery = named(
  'Gallery',
  z.object({
    id: Id,
    sessionId: Id,
    occurrenceId: Id,
    title: z.string().max(80),
    kind: GalleryKind,
    visibility: GalleryVisibility,
    sortOrder: z.number().int().min(0).max(1000),
    itemCount: z.number().int().min(0),
    totalBytes: z.number().int().min(0),
    createdBy: z.object({ id: Id, name: z.string().max(80) }),
    createdAt: IsoDateTime
  })
);
export const GalleryItem = named(
  'GalleryItem',
  z.object({
    id: Id,
    galleryId: Id,
    mime: GalleryMime,
    bytes: z.number().int().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/).meta({ description: 'همان ETag محتوا' }),
    width: z.number().int().min(1).nullable(),
    height: z.number().int().min(1).nullable(),
    durationSec: z.number().int().min(0).nullable(),
    title: z.string().max(120),
    uploadedBy: z.object({ id: Id, name: z.string().max(80) }),
    createdAt: IsoDateTime,
    url: z.string().max(512).meta({ description: 'مسیر نسبی امضاشدهٔ محتوا (M-77 یا H-117 بسته به سرویس پاسخ‌دهنده) با `exp`/`u`/`sig`؛ ۱۰ دقیقه اعتبار — مستقیم در `<img src>`/`<audio src>` روی origin همان API' })
  }),
  'محتوا: M-77 (یا M-79 برای گالری public؛ H-117 در پنل). JPEG بدون EXIF/APP1 ذخیره می‌شود.'
);
export const GalleriesQuery = pageQuery(50);
export const GalleryItemsQuery = pageQuery(100);
export const CreateGalleryBody = named(
  'CreateGalleryBody',
  z
    .object({
      title: GalleryTitle,
      kind: GalleryKind,
      visibility: GalleryVisibility.default('members'),
      sortOrder: z.number().int().min(0).max(1000).default(100)
    })
    .strict()
);
export const UpdateGalleryBody = named(
  'UpdateGalleryBody',
  z
    .object({ title: GalleryTitle.optional(), visibility: GalleryVisibility.optional(), sortOrder: z.number().int().min(0).max(1000).optional() })
    .strict()
    .refine((v) => Object.keys(v).length > 0, { message: 'دست‌کم یک فیلد لازم است.' })
    .meta({ description: 'نوع (kind) گالری پس از ساخت عوض نمی‌شود' })
);
/** M-75 / H-115: بدنه = بایت‌های خام فایل؛ عنوان در query */
export const UploadItemQuery = z.object({ title: SafeText(1, 120).optional().meta({ description: 'نبود ⇒ عنوان خالی' }) });
/** گالری public برای مهمان (M-78)؛ آیتم‌ها درون‌خطی (≤ ۱۰۰ per گالری) */
export const PublicGalleryItem = named(
  'PublicGalleryItem',
  z.object({
    id: Id,
    mime: GalleryMime,
    bytes: z.number().int().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    width: z.number().int().min(1).nullable(),
    height: z.number().int().min(1).nullable(),
    durationSec: z.number().int().min(0).nullable(),
    title: z.string().max(120)
  })
);
export const PublicGallery = named(
  'PublicGallery',
  z.object({
    id: Id,
    occurrence: z.object({ id: Id, seq: z.number().int().min(1), openedAt: IsoDateTime }),
    title: z.string().max(80),
    kind: GalleryKind,
    itemCount: z.number().int().min(0),
    items: z.array(PublicGalleryItem).max(100).meta({ description: 'حداکثر ۱۰۰ آیتم اول به ترتیب ساخت' })
  })
);
export const PublicGalleriesQuery = pageQuery(20).extend({ occurrenceId: Id.optional() });

// ───── کامنت (۱.۷.۰؛ docs-v2/31 §۵) ─────
export { CommentVisibility };
export const Comment = named(
  'Comment',
  z.object({
    id: Id,
    sessionId: Id,
    occurrenceId: Id,
    queueItemId: Id.nullable().meta({ description: 'null = کامنت عمومی نوبت؛ وگرنه حین تلاوت همان آیتم صف' }),
    reciter: z.object({ id: Id, name: z.string().max(80) }).nullable(),
    author: z.object({ id: Id, name: z.string().max(80) }),
    body: z.string().max(500),
    atSec: z.number().int().min(0).nullable().meta({ description: 'ثانیه از شروع تلاوت (queue_items.started_at) — محاسبهٔ سرور' }),
    hidden: z.boolean().meta({ description: 'پنهان‌شده توسط کادر: فقط کادر می‌بیند' }),
    mine: z.boolean(),
    createdAt: IsoDateTime
  }),
  'دیدن: commentVisibility=public ⇒ همهٔ کسانی که جلسه را می‌بینند؛ reciter_only ⇒ کامنت تلاوت فقط برای نویسنده، خواننده و کادر و کامنت عمومی نوبت برای اعضا و کادر. پنهان‌شده فقط برای کادر.'
);
export const CommentsQuery = pageQuery(100).extend({
  queueItemId: Id.optional().meta({ description: 'فقط کامنت‌های تلاوت یک آیتم صف' }),
  scope: z.enum(['all', 'general', 'recitation']).default('all').meta({ description: 'general = کامنت عمومی نوبت؛ recitation = حین تلاوت' })
});
export const CreateCommentBody = named(
  'CreateCommentBody',
  z
    .object({
      body: SafeText(1, 500),
      queueItemId: Id.optional().meta({ description: 'فقط وقتی آن آیتم current است (وگرنه CONFLICT(NOT_RECITING))؛ atSec را سرور حساب می‌کند' })
    })
    .strict()
);
export const ModerateCommentBody = named('ModerateCommentBody', z.object({ hidden: z.boolean() }).strict());

// ───── امتیاز ─────
export const PointsLedgerQuery = pageQuery(50);

/** رویدادهای Socket.IO — فقط «سیگنال»؛ داده از REST گرفته می‌شود (D3) */
export const LiveEvent = named(
  'LiveEvent',
  z.object({
    type: z.enum([
      'attendance.updated',
      'queue.updated',
      'queue.turned',
      'eval.updated',
      'session.state',
      'members.updated',
      'session.updated',
      'occurrence.updated',
      // ۱.۷.۰
      'supporters.updated',
      'gallery.updated',
      'comment.created',
      'comment.updated'
    ]),
    sessionId: Id,
    payload: z.record(z.string(), z.unknown()).optional()
  })
);
export const SessionJoinMessage = named('SessionJoinMessage', z.object({ sessionId: Id }).strict());
