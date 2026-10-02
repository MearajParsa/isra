/** نوع‌های کلاینت برای api-mid (قرارداد: packages/api-types؛ docs-v2/18) */
import type { Page, PublicSession, SessionSchedule } from './types';

export type SessionRole = 'session_manager' | 'session_supporter' | 'teacher' | 'quran_student';
export type MembershipStatus = 'pending' | 'approved' | 'rejected';
/** چرخهٔ حیات قفل‌شده؛ فقط رو به جلو */
export type SessionState = 'draft' | 'scheduled' | 'started' | 'ended';

export type Permission =
  | 'session.edit'
  | 'session.transition'
  | 'membership.approve'
  | 'membership.roles'
  | 'queue.manage'
  | 'eval.submit'
  | 'attendance.view';

export type MidSession = Omit<PublicSession, 'status'> & { status: SessionState };

export interface MidMe {
  canCreateSession: boolean;
  hasStaffRole: boolean;
}

export interface MySessionItem {
  session: MidSession;
  roles: SessionRole[];
  membership: MembershipStatus;
  pendingCount?: number;
}

export interface SessionMe {
  session: MidSession;
  membership: { status: MembershipStatus; roles: SessionRole[] } | null;
  permissions: Permission[];
  /** حضور من در این جلسه (یا null) */
  myAttendance: { enteredAt: string } | null;
  /** وزن‌های فعلی ارزیابی (از high) برای پیش‌نمایش امتیاز */
  evalWeights: EvaluationWeights;
}

export interface SessionInput {
  title: string;
  description: string;
  schedule: SessionSchedule;
  location: { label: string };
}

export interface Member {
  id: string;
  userId: string;
  name: string;
  roles: SessionRole[];
  status: MembershipStatus;
  requestedAt: string;
}

export interface AttendanceEntry {
  userId: string;
  name: string;
  enteredAt: string;
}
export interface AttendanceResult {
  entry: AttendanceEntry;
  pointsAwarded: number;
  alreadyPresent: boolean;
}

export type QueueItemStatus = 'waiting' | 'current' | 'done';
export interface QueueItem {
  id: string;
  userId: string;
  /** برای غیرکادر فقط نام نفر جاری و خودِ کاربر پر است */
  name: string | null;
  status: QueueItemStatus;
  position: number | null;
  joinedAt: string;
  evaluated: boolean;
  isMe: boolean;
}
export interface QueueState {
  current: QueueItem | null;
  waiting: QueueItem[];
  done: QueueItem[];
  myItem: QueueItem | null;
  myPosition: number | null;
  waitingCount: number;
}
export type QueueAction = 'up' | 'down' | 'skip' | 'remove';

export interface EvaluationInput {
  queueItemId: string;
  voice: number;
  tone: number;
  tajweed: number;
  note?: string;
}
export interface EvaluationWeights {
  voice: number;
  tone: number;
  tajweed: number;
}
export interface Evaluation {
  id: string;
  sessionId: string;
  queueItemId: string;
  userId: string;
  userName: string;
  evaluatorName: string;
  voice: number;
  tone: number;
  tajweed: number;
  weights: EvaluationWeights;
  /** ۰..۱۰۰ */
  score: number;
  points: number;
  note: string;
  createdAt: string;
}

export type LiveEventType =
  | 'attendance.updated'
  | 'queue.updated'
  | 'queue.turned'
  | 'eval.updated'
  | 'session.state';

export interface LiveEvent {
  type: LiveEventType;
  sessionId: string;
  payload?: Record<string, unknown>;
}

export type Unsubscribe = () => void;

export interface MidApi {
  me: {
    get(t: string): Promise<MidMe>;
    sessions(t: string, scope?: 'all' | 'staff'): Promise<MySessionItem[]>;
  };
  sessions: {
    me(t: string, id: string): Promise<SessionMe>;
    create(t: string, input: SessionInput): Promise<MidSession>;
    update(t: string, id: string, input: SessionInput): Promise<MidSession>;
    transition(t: string, id: string, to: Exclude<SessionState, 'draft'>): Promise<MidSession>;
  };
  members: {
    request(t: string, sessionId: string): Promise<Member>;
    list(t: string, sessionId: string, status?: MembershipStatus): Promise<Member[]>;
    decide(t: string, sessionId: string, memberId: string, action: 'approve' | 'reject'): Promise<Member>;
    setRoles(t: string, sessionId: string, memberId: string, roles: SessionRole[]): Promise<Member>;
  };
  attendance: {
    checkIn(t: string, sessionId: string): Promise<AttendanceResult>;
    list(t: string, sessionId: string): Promise<{ items: AttendanceEntry[]; total: number }>;
  };
  queue: {
    join(t: string, sessionId: string): Promise<QueueItem>;
    leave(t: string, sessionId: string): Promise<void>;
    state(t: string, sessionId: string): Promise<QueueState>;
    next(t: string, sessionId: string): Promise<QueueState>;
    act(t: string, sessionId: string, itemId: string, action: QueueAction): Promise<QueueState>;
  };
  evaluations: {
    submit(t: string, sessionId: string, input: EvaluationInput): Promise<Evaluation>;
    list(t: string, sessionId: string): Promise<Page<Evaluation>>;
  };
  live: {
    /**
     * اتصال Socket.IO با تمدید خودکار توکن و reconnect؛ رویداد فقط «سیگنال» است و داده با REST گرفته می‌شود.
     * پس از هر (باز)اتصال، رویدادهای `payload.resync` برای دریافت دوبارهٔ همهٔ داده‌ها می‌آید.
     */
    subscribe(o: { getToken: () => string | null; sessionId: string; onEvent: (e: LiveEvent) => void; onStatus: (connected: boolean) => void }): Unsubscribe;
  };
}
