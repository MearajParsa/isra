import { z } from 'zod';
import { Id, IsoDateTime, named, pageQuery } from '../core/primitives';
import { MidSession } from '../domain/session';

export const SessionRole = named('SessionRole', z.enum(['session_manager', 'session_supporter', 'teacher', 'quran_student']));
export const MembershipStatus = named('MembershipStatus', z.enum(['pending', 'approved', 'rejected']));
export const Permission = named(
  'SessionPermission',
  z.enum(['session.edit', 'session.transition', 'membership.approve', 'membership.roles', 'queue.manage', 'eval.submit', 'attendance.view']),
  'مجوز درون‌جلسه؛ اجتماع مجوزهای نقش‌ها. manager به‌تنهایی eval.submit ندارد (قفل #15).'
);

export const MidMe = named('MidMe', z.object({ canCreateSession: z.boolean(), hasStaffRole: z.boolean() }));

export const MySessionsQuery = pageQuery(50).extend({ scope: z.enum(['all', 'staff']).default('all') });
export const MySessionItem = named(
  'MySessionItem',
  z.object({
    session: MidSession,
    roles: z.array(SessionRole).max(4),
    membership: MembershipStatus,
    pendingCount: z.number().int().min(0).optional().meta({ description: 'فقط برای دارندگان membership.approve' })
  })
);

export const SessionMe = named(
  'SessionMe',
  z.object({
    session: MidSession,
    membership: z.object({ status: MembershipStatus, roles: z.array(SessionRole).max(4) }).nullable(),
    permissions: z.array(Permission),
    myAttendance: z.object({ enteredAt: IsoDateTime }).nullable()
  })
);

export const TransitionBody = named('TransitionBody', z.object({ to: z.enum(['scheduled', 'started', 'ended']) }).strict());

export const Member = named(
  'Member',
  z.object({ id: Id, userId: Id, name: z.string().max(80), roles: z.array(SessionRole).max(4), status: MembershipStatus, requestedAt: IsoDateTime })
);
export const MembersQuery = pageQuery(100).extend({ status: MembershipStatus.optional() });
export const DecideBody = named('DecideBody', z.object({ action: z.enum(['approve', 'reject']) }).strict());
export const SetRolesBody = named(
  'SetRolesBody',
  z.object({ roles: z.array(z.enum(['session_supporter', 'teacher', 'quran_student'])).max(3) }).strict().meta({ description: 'نقش مدیر از این مسیر عوض نمی‌شود؛ آرایهٔ خالی = فقط قرآن‌آموز' })
);

export const AttendanceEntry = named('AttendanceEntry', z.object({ userId: Id, name: z.string().max(80), enteredAt: IsoDateTime }));
export const AttendanceResult = named(
  'AttendanceResult',
  z.object({
    entry: AttendanceEntry,
    pointsAwarded: z.union([z.literal(0), z.literal(5)]).meta({ description: '+۵ فقط اولین بار؛ تکرار ⇒ ۰ (قفل #12)' }),
    alreadyPresent: z.boolean()
  })
);
export const AttendanceList = named('AttendanceList', z.object({ items: z.array(AttendanceEntry), total: z.number().int().min(0) }));

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
    current: QueueItem.nullable(),
    waiting: z.array(QueueItem),
    done: z.array(QueueItem),
    myItem: QueueItem.nullable(),
    myPosition: z.number().int().min(1).nullable(),
    waitingCount: z.number().int().min(0)
  })
);
export const QueueActBody = named('QueueActBody', z.object({ action: z.enum(['up', 'down', 'skip', 'remove']) }).strict());

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
    createdAt: IsoDateTime
  })
);

/** رویدادهای Socket.IO — فقط «سیگنال»؛ داده از REST گرفته می‌شود (D3) */
export const LiveEvent = named(
  'LiveEvent',
  z.object({
    type: z.enum(['attendance.updated', 'queue.updated', 'queue.turned', 'eval.updated', 'session.state']),
    sessionId: Id,
    payload: z.record(z.string(), z.unknown()).optional()
  })
);
export const SessionJoinMessage = named('SessionJoinMessage', z.object({ sessionId: Id }).strict());
