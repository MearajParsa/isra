/**
 * آینهٔ نوع‌های قرارداد high (`packages/api-types/src/high`، نسخهٔ 1.4.0) برای مرورگر.
 * (کد runtime از api-types در bundle نمی‌آید؛ فقط نوع‌ها اینجا بازتعریف شده‌اند و تست قرارداد مسیرها را با ENDPOINTS تطبیق می‌دهد.)
 */
import type { DeviceInfo, AuthResult, OtpChallenge, Page, RefreshResult } from './types';

export type SystemRoleKey = 'developer' | 'super_admin';
export const SYSTEM_ROLES: SystemRoleKey[] = ['developer', 'super_admin'];

export type PermissionKey =
  | 'system.users.view'
  | 'system.users.manage'
  | 'system.role.assign'
  | 'system.permission.edit'
  | 'system.settings.view'
  | 'system.settings.edit'
  | 'system.audit.view'
  | 'system.sessions.view'
  | 'system.sessions.manage'
  | 'system.reports.view'
  | 'session.create';

export type Grant = 'session.create';
export type UserStatus = 'active' | 'disabled' | 'deleted';
/** تاریخ تقویمی Asia/Tehran: YYYY-MM-DD */
export type IsoDate = string;

export interface PermissionInfo {
  key: PermissionKey;
  title: string;
  group: 'system' | 'session';
}

export interface SystemRole {
  key: SystemRoleKey;
  title: string;
  description: string;
  undeletable: true;
  permissions: PermissionKey[];
  lockedPermissions: PermissionKey[];
  holders: number;
}

export interface SystemMe {
  user: { id: string; name: string; phone: string };
  roles: SystemRoleKey[];
  permissions: PermissionKey[];
}

export interface SystemUser {
  id: string;
  name: string;
  /** شمارهٔ موبایل یا (برای حذف‌شده) شمارهٔ ناشناس `d` + ۱۰ هگز */
  phone: string;
  status: UserStatus;
  roles: SystemRoleKey[];
  grants: Grant[];
  createdAt: string;
}

export interface SystemUserDetail extends SystemUser {
  firstName: string;
  lastName: string;
  hasPassword: boolean;
  mustChangePassword: boolean;
  lastActiveAt: string | null;
  activeSessions: number;
  sessionsByClient: Record<string, number>;
  points: { total: number; badges: number };
  sessions: { created: number; memberships: number; attended: number };
}

export type UserSort = 'newest' | 'oldest' | 'name';
export interface UsersQuery {
  q?: string;
  role?: SystemRoleKey | 'none';
  grant?: Grant | 'none';
  status?: UserStatus;
  createdFrom?: IsoDate;
  createdTo?: IsoDate;
  sort?: UserSort;
  page?: number;
  pageSize?: number;
}

export interface CreateUserInput {
  phone: string;
  firstName: string;
  lastName: string;
  password?: string;
  roles?: SystemRoleKey[];
  grants?: Grant[];
}
export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
}
export type UserPasswordInput = { action: 'set'; password: string } | { action: 'clear' };

export interface UserDeviceSession {
  id: string;
  deviceLabel: string;
  platform: 'web' | 'android';
  client: string | null;
  ipMasked: string;
  createdAt: string;
  lastActiveAt: string;
  revokedAt: string | null;
  /** فقط در «نشست‌های من» معنا دارد */
  current: boolean;
}

export interface MyAccount {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  hasPassword: boolean;
  mustChangePassword: boolean;
}
export interface SetMyPasswordInput {
  newPassword: string;
  /** فقط وقتی mustChangePassword است (به‌جای step-up) */
  currentPassword?: string;
}

// ───────── جلسه‌ها ─────────
export type SessionState = 'draft' | 'scheduled' | 'started' | 'ended';
/** ۱.۷.۰ (docs-v2/31 §۲) */
export type SessionRole = 'owner' | 'supporter' | 'member';
export type MembershipStatus = 'pending' | 'approved' | 'rejected';

export type SessionSchedule =
  | { type: 'once'; startsAt: string; endsAt: string }
  | { type: 'recurring'; weekdays: number[]; timeOfDay: string; durationMin: number }
  | { type: 'range'; rangeFrom: string; rangeTo: string; weekdays: number[]; timeOfDay: string; durationMin: number };

export interface SessionLocation {
  label: string;
  routeUrl?: string | null;
}
export interface SessionInput {
  title: string;
  description: string;
  schedule: SessionSchedule;
  location: SessionLocation;
}

export interface AdminSession {
  id: string;
  title: string;
  description: string;
  schedule: SessionSchedule;
  nextStartsAt: string | null;
  location: SessionLocation;
  status: SessionState;
  createdBy: { id: string; name: string };
  /** ۱.۷.۰: استاد صاحب جلسه */
  owner: { id: string; name: string };
  counts: { members: number; pending: number; attendance: number; evaluations: number; supporters?: number; occurrences?: number };
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export type AdminSessionSort = 'newest' | 'oldest' | 'title' | 'nextStart';
export interface AdminSessionsQuery {
  q?: string;
  status?: SessionState;
  creatorId?: string;
  from?: IsoDate;
  to?: IsoDate;
  includeDeleted?: boolean;
  sort?: AdminSessionSort;
  page?: number;
  pageSize?: number;
}
export interface AdminCreateSessionInput {
  creatorId?: string;
  session: SessionInput;
}
export interface AdminMember {
  id: string;
  userId: string;
  name: string;
  status: MembershipStatus;
  requestedAt: string;
  phone: string | null;
  decidedAt: string | null;
}
export interface AttendanceEntry {
  userId: string;
  name: string;
  enteredAt: string;
}
export interface QueueItem {
  id: string;
  userId: string;
  name: string | null;
  status: 'waiting' | 'current' | 'done';
  position: number | null;
  joinedAt: string;
  evaluated: boolean;
  isMe: boolean;
}
export interface AdminQueue {
  current: QueueItem | null;
  waiting: QueueItem[];
  done: QueueItem[];
  myItem: QueueItem | null;
  myPosition: number | null;
  waitingCount: number;
}
export interface EvaluationCriterionScore {
  criterionId: string;
  key: string;
  title: string;
  weight: number;
  maxScore: number;
  score: number;
}
export interface Evaluation {
  id: string;
  sessionId: string;
  queueItemId: string;
  userId: string;
  userName: string;
  evaluatorName: string;
  /** ۱.۷.۰: snapshot معیارهای پویا در لحظهٔ ثبت */
  criteria: EvaluationCriterionScore[];
  score: number;
  points: number;
  note: string;
  createdAt: string;
}

// ───────── گزارش‌ها ─────────
export type ReportInterval = 'day' | 'week' | 'month';
export interface ReportRange {
  from?: IsoDate;
  to?: IsoDate;
}
export interface ReportOverview {
  range: { from: IsoDate; to: IsoDate };
  users: {
    total: number;
    registered: number;
    byStatus: { active: number; disabled: number; deleted: number };
    byRole: { developer: number; super_admin: number; none: number };
    withPassword: number | null;
  };
  sessions: { total: number; created: number; byStatus: { draft: number; scheduled: number; started: number; ended: number } };
  participation: { attendance: number; evaluations: number; avgScore: number | null; pointsAwarded: number };
  messaging: { otpRequested: number; otpVerified: number } | null;
  clients: { client: string; activeSessions: number }[];
}
export interface RegistrationsSeries {
  interval: ReportInterval;
  items: { bucket: IsoDate; count: number }[];
}
export interface SessionsSeries {
  interval: ReportInterval;
  items: { bucket: IsoDate; created: number; held: number; attendance: number }[];
}
export interface OtpSeries {
  interval: ReportInterval;
  items: { bucket: IsoDate; requested: number; verified: number }[];
}
export interface LeaderboardItem {
  userId: string;
  name: string;
  points: number;
  badges: number;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: { id: string; name: string };
  action: string;
  target?: { type: AuditTargetType; id: string; label: string };
  summary: string;
  meta: Record<string, unknown>;
}
export type AuditTargetType = 'user' | 'role' | 'settings' | 'session';
export interface AuditQuery {
  action?: string;
  q?: string;
  actorId?: string;
  targetType?: AuditTargetType;
  targetId?: string;
  from?: IsoDate;
  to?: IsoDate;
  page?: number;
  pageSize?: number;
}

export type FlagKey = 'maintenance_mode' | 'registration_open';
export interface SystemSettings {
  version: number;
  flags: Record<FlagKey, boolean>;
  updatedAt: string;
  updatedBy: string;
}
/** ۱.۷.۰: evalWeights/badgeThresholds حذف شدند */
export type SettingsInput = Pick<SystemSettings, 'version' | 'flags'>;

export interface Overview {
  users: { total: number; admins: number };
  sessions: { draft: number; scheduled: number; started: number; ended: number };
  lastAudit: AuditEntry[];
}

/** توکن step-up؛ برای writeها الزامی (هدر X-Step-Up-Token) */
export type StepUp = string;
export interface Sig {
  signal?: AbortSignal;
}

export interface AdminApi {
  auth: {
    requestOtp(phone: string): Promise<OtpChallenge>;
    verifyOtp(input: { challengeId: string; code: string } & DeviceInfo): Promise<AuthResult>;
    loginPassword(input: { phone: string; password: string } & DeviceInfo): Promise<AuthResult>;
    refresh(): Promise<RefreshResult>;
    logout(): Promise<void>;
    stepUpRequest(accessToken: string): Promise<OtpChallenge>;
    stepUpVerify(accessToken: string, input: { challengeId: string; code: string }): Promise<{ stepUpToken: string; expiresInSec: number }>;
  };
  system: {
    me(t: string): Promise<SystemMe>;
    overview(t: string): Promise<Overview>;
    roles(t: string): Promise<SystemRole[]>;
    permissions(t: string): Promise<PermissionInfo[]>;
    setRolePermissions(t: string, key: SystemRoleKey, permissions: PermissionKey[], su: StepUp): Promise<SystemRole>;
    settings(t: string): Promise<SystemSettings>;
    updateSettings(t: string, input: SettingsInput, su: StepUp): Promise<SystemSettings>;
    audit(t: string, q?: AuditQuery, s?: Sig): Promise<Page<AuditEntry>>;

    // حساب من
    account(t: string, s?: Sig): Promise<MyAccount>;
    updateProfile(t: string, input: { firstName?: string; lastName?: string }): Promise<MyAccount>;
    setMyPassword(t: string, input: SetMyPasswordInput, su?: StepUp): Promise<void>;
    mySessions(t: string, s?: Sig): Promise<Page<UserDeviceSession>>;
    revokeMySession(t: string, id: string): Promise<void>;
    revokeOtherSessions(t: string): Promise<void>;

    // کاربران
    users(t: string, q?: UsersQuery, s?: Sig): Promise<Page<SystemUser>>;
    user(t: string, id: string, s?: Sig): Promise<SystemUserDetail>;
    createUser(t: string, input: CreateUserInput, su: StepUp): Promise<SystemUserDetail>;
    updateUser(t: string, id: string, input: UpdateUserInput, su: StepUp): Promise<SystemUserDetail>;
    setUserStatus(t: string, id: string, status: 'active' | 'disabled', su: StepUp): Promise<SystemUserDetail>;
    deleteUser(t: string, id: string, su: StepUp): Promise<void>;
    setUserPassword(t: string, id: string, input: UserPasswordInput, su: StepUp): Promise<void>;
    logoutUserEverywhere(t: string, id: string, su: StepUp): Promise<void>;
    userSessions(t: string, id: string, s?: Sig): Promise<Page<UserDeviceSession>>;
    revokeUserSession(t: string, id: string, sessionId: string, su: StepUp): Promise<void>;
    setUserRoles(t: string, id: string, roles: SystemRoleKey[], su: StepUp): Promise<SystemUser>;
    setUserGrants(t: string, id: string, grants: Grant[], su: StepUp): Promise<SystemUser>;

    // جلسه‌ها
    sessions(t: string, q?: AdminSessionsQuery, s?: Sig): Promise<Page<AdminSession>>;
    session(t: string, id: string, s?: Sig): Promise<AdminSession>;
    createSession(t: string, input: AdminCreateSessionInput, su: StepUp): Promise<AdminSession>;
    updateSession(t: string, id: string, input: SessionInput, su: StepUp): Promise<AdminSession>;
    transitionSession(t: string, id: string, to: Exclude<SessionState, 'draft'>, su: StepUp): Promise<AdminSession>;
    deleteSession(t: string, id: string, su: StepUp): Promise<void>;
    sessionMembers(t: string, id: string, q?: { status?: MembershipStatus; page?: number; pageSize?: number }, s?: Sig): Promise<Page<AdminMember>>;
    decideMember(t: string, id: string, memberId: string, action: 'approve' | 'reject', su: StepUp): Promise<AdminMember>;
    removeMember(t: string, id: string, memberId: string, su: StepUp): Promise<void>;
    sessionAttendance(t: string, id: string, s?: Sig): Promise<{ items: AttendanceEntry[]; total: number }>;
    sessionQueue(t: string, id: string, s?: Sig): Promise<AdminQueue>;
    sessionEvaluations(t: string, id: string, s?: Sig): Promise<{ items: Evaluation[]; total: number }>;

    // گزارش‌ها
    reportOverview(t: string, r?: ReportRange, s?: Sig): Promise<ReportOverview>;
    reportRegistrations(t: string, r: ReportRange & { interval?: ReportInterval }, s?: Sig): Promise<RegistrationsSeries>;
    reportSessions(t: string, r: ReportRange & { interval?: ReportInterval }, s?: Sig): Promise<SessionsSeries>;
    reportOtp(t: string, r: ReportRange & { interval?: ReportInterval }, s?: Sig): Promise<OtpSeries>;
    reportLeaderboard(t: string, limit?: number, s?: Sig): Promise<LeaderboardItem[]>;
  };
}
