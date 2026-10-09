/**
 * Complete API Types for Isra Admin Dashboard
 * Generated strictly from the Isra API Contract
 */

export type UserStatus = 'active' | 'disabled' | 'deleted';
export type StepUpMode = 'required' | 'none';
export type SessionState = 'draft' | 'scheduled' | 'started' | 'ended';
export type MembershipStatus = 'pending' | 'approved' | 'rejected';
/** ۱.۷.۰ (docs-v2/31 §۲) */
export type SessionRole = 'owner' | 'supporter' | 'member';

export type SystemRoleKey = string;
export type PermissionKey = string;
export type ModuleKey = string;
export type Grant = PermissionKey;

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta: {
    requestId: string;
    page?: number;
    pageSize?: number;
    total?: number;
    [key: string]: unknown;
  };
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: {
    fields?: Record<string, string>;
    reason?: string;
    retryAfterSec?: number;
    attemptsLeft?: number;
    [key: string]: unknown;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
  meta?: {
    requestId?: string;
  };
}

/** ۱.۷.۰: snapshot معیار پویا روی ارزیابی ثبت‌شده */
export interface EvaluationCriterionScore {
  criterionId: string;
  key: string;
  title: string;
  weight: number;
  maxScore: number;
  score: number;
}

export interface AuthUser {
  id: string;
  phone: string;
  isNewUser: boolean;
  profileComplete: boolean;
  hasPassword: boolean;
}

export interface AuthResult {
  accessToken: string;
  tokenType: 'Bearer';
  accessExpiresIn: number;
  refreshToken?: string;
  sessionId: string;
  user: AuthUser;
}

export interface RefreshResult {
  accessToken: string;
  tokenType: 'Bearer';
  accessExpiresIn: number;
  refreshToken?: string;
}

export interface OtpChallenge {
  challengeId: string;
  expiresInSec: number;
  resendAfterSec: number;
}

export interface OtpRequestBody {
  phone: string;
}

export interface OtpVerifyBody {
  challengeId: string;
  code: string;
  deviceId: string;
  deviceLabel: string;
}

export interface PasswordLoginBody {
  phone: string;
  password: string;
  deviceId: string;
  deviceLabel: string;
}

export interface RefreshBody {
  refreshToken?: string;
}

export interface StepUpVerifyBody {
  challengeId: string;
  code: string;
}

export interface StepUpResult {
  stepUpToken: string;
  expiresInSec: number;
}

export interface SystemMe {
  user: {
    id: string;
    name: string;
    phone: string;
  };
  roles: SystemRoleKey[];
  permissions: PermissionKey[];
  stepUpExempt: boolean;
  stepUp: Record<string, StepUpMode>;
}

export interface MyAccount {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  hasPassword: boolean;
  mustChangePassword: boolean;
}

export interface UpdateMyProfileBody {
  firstName?: string;
  lastName?: string;
}

export interface SetMyPasswordBody {
  newPassword: string;
  currentPassword?: string;
}

export interface UserDeviceSession {
  id: string;
  deviceLabel: string;
  platform: 'web' | 'android';
  client: string | null;
  ipMasked: string;
  createdAt: string; // ISO datetime
  lastActiveAt: string; // ISO datetime
  revokedAt: string | null; // ISO datetime
  current: boolean;
}

export interface SystemUser {
  id: string;
  name: string;
  phone: string;
  status: UserStatus;
  roles: SystemRoleKey[];
  grants: Grant[];
  createdAt: string; // ISO datetime
}

export interface SystemUserDetail {
  id: string;
  name: string;
  phone: string;
  status: UserStatus;
  roles: SystemRoleKey[];
  grants: Grant[];
  createdAt: string; // ISO datetime
  firstName: string;
  lastName: string;
  hasPassword: boolean;
  mustChangePassword: boolean;
  lastActiveAt: string | null;
  activeSessions: number;
  sessionsByClient: Record<string, number>;
  points: {
    total: number;
    badges: number;
  };
  sessions: {
    created: number;
    memberships: number;
    attended: number;
  };
}

export interface CreateUserBody {
  phone: string;
  firstName: string;
  lastName: string;
  password?: string;
  roles?: SystemRoleKey[];
  grants?: Grant[];
}

export interface UpdateUserBody {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface SetUserRolesBody {
  roles: SystemRoleKey[];
}

export interface SetUserGrantsBody {
  grants: Grant[];
}

export interface SetUserStatusBody {
  status: 'active' | 'disabled';
}

export type UserPasswordBody = { action: 'set'; password: string } | { action: 'clear' };

export interface SystemRole {
  key: SystemRoleKey;
  title: string;
  description: string;
  undeletable: boolean;
  permissions: PermissionKey[];
  modules: ModuleKey[];
  effectivePermissions: PermissionKey[];
  lockedPermissions: PermissionKey[];
  stepUpRules: Record<string, StepUpMode>;
  holders: number;
}

export interface CreateRoleBody {
  key: SystemRoleKey;
  title: string;
  description?: string;
  permissions?: PermissionKey[];
  modules?: ModuleKey[];
}

export interface UpdateRoleBody {
  title?: string;
  description?: string;
}

export interface SetRolePermissionsBody {
  permissions: PermissionKey[];
}

export interface SetRoleModulesBody {
  modules: ModuleKey[];
}

export interface SetRoleStepUpBody {
  rules: {
    permission: PermissionKey;
    mode: 'required' | 'none' | 'inherit';
  }[];
}

export interface PermissionInfo {
  key: PermissionKey;
  title: string;
  description: string;
  moduleKey: ModuleKey;
  isSystem: boolean;
  grantable: boolean;
  stepUp: StepUpMode;
}

export interface CreatePermissionBody {
  key: PermissionKey;
  title: string;
  description?: string;
  moduleKey: ModuleKey;
  grantable?: boolean;
  stepUp?: StepUpMode;
}

export interface UpdatePermissionBody {
  title?: string;
  description?: string;
  moduleKey?: ModuleKey;
  grantable?: boolean;
  stepUp?: StepUpMode;
}

export interface ModuleInfo {
  key: ModuleKey;
  title: string;
  description: string;
  isSystem: boolean;
  sortOrder: number;
  permissionCount: number;
}

export interface CreateModuleBody {
  key: ModuleKey;
  title: string;
  description?: string;
  sortOrder?: number;
}

export interface UpdateModuleBody {
  title?: string;
  description?: string;
  sortOrder?: number;
}

export interface RbacMatrix {
  version: number;
  modules: ModuleInfo[];
  permissions: PermissionInfo[];
  roles: SystemRole[];
}

export interface EffectiveAccessSource {
  type: 'role' | 'module' | 'grant';
  ref: string;
  stepUp: StepUpMode;
}

export interface EffectiveAccessPermission {
  key: PermissionKey;
  stepUp: StepUpMode;
  sources: EffectiveAccessSource[];
}

export interface EffectiveAccess {
  userId: string;
  roles: SystemRoleKey[];
  grants: Grant[];
  stepUpExempt: boolean;
  permissions: EffectiveAccessPermission[];
}

export type SessionSchedule =
  | { type: 'once'; startsAt: string; endsAt: string }
  | { type: 'recurring'; weekdays: number[]; timeOfDay: string; durationMin: number }
  | { type: 'range'; rangeFrom: string; rangeTo: string; weekdays: number[]; timeOfDay: string; durationMin: number };

export interface SessionInput {
  title: string;
  description: string;
  schedule: SessionSchedule;
  location: {
    label: string;
    routeUrl?: string | null;
  };
}

export interface AdminCreateSessionBody {
  creatorId?: string;
  session: SessionInput;
}

export interface AdminSession {
  id: string;
  title: string;
  description: string;
  schedule: SessionSchedule;
  nextStartsAt: string | null;
  location: {
    label: string;
    routeUrl?: string | null;
  };
  status: SessionState;
  createdBy: {
    id: string;
    name: string;
  };
  /** ۱.۷.۰: استاد صاحب جلسه */
  owner: {
    id: string;
    name: string;
  };
  counts: {
    members: number;
    pending: number;
    attendance: number;
    evaluations: number;
    supporters?: number;
    occurrences?: number;
  };
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TransitionBody {
  to: 'scheduled' | 'started' | 'ended';
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

export interface AdminDecideBody {
  action: 'approve' | 'reject';
}

export interface AttendanceEntry {
  userId: string;
  name: string;
  enteredAt: string;
}

export interface AdminAttendanceList {
  items: AttendanceEntry[];
  total: number;
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

export interface QueueState {
  current: QueueItem | null;
  waiting: QueueItem[];
  done: QueueItem[];
  myItem: QueueItem | null;
  myPosition: number | null;
  waitingCount: number;
}

export type AdminQueue = QueueState;

export interface Evaluation {
  id: string;
  sessionId: string;
  queueItemId: string;
  userId: string;
  userName: string;
  evaluatorName: string;
  criteria: EvaluationCriterionScore[];
  score: number;
  points: number;
  note: string;
  createdAt: string;
}

export interface AdminEvaluations {
  items: Evaluation[];
  total: number;
}

export interface SystemSettings {
  version: number;
  flags: {
    maintenance_mode: boolean;
    registration_open: boolean;
  };
  updatedAt: string;
  updatedBy: string;
}

export interface UpdateSettingsBody {
  version: number;
  flags: {
    maintenance_mode: boolean;
    registration_open: boolean;
  };
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: {
    id: string;
    name: string;
  };
  action: string;
  target?: {
    type: 'user' | 'role' | 'settings' | 'session';
    id: string;
    label: string;
  };
  summary: string;
  meta: Record<string, unknown>;
}

export interface Overview {
  users: {
    total: number;
    admins: number;
  };
  sessions: {
    draft: number;
    scheduled: number;
    started: number;
    ended: number;
  };
  lastAudit: AuditEntry[];
}

export interface ReportOverview {
  range: {
    from: string;
    to: string;
  };
  users: {
    total: number;
    registered: number;
    byStatus: {
      active: number;
      disabled: number;
      deleted: number;
    };
    byRole: {
      developer: number;
      super_admin: number;
      none: number;
    };
    withPassword: number | null;
  };
  sessions: {
    total: number;
    created: number;
    byStatus: {
      draft: number;
      scheduled: number;
      started: number;
      ended: number;
    };
  };
  participation: {
    attendance: number;
    evaluations: number;
    avgScore: number | null;
    pointsAwarded: number;
  };
  messaging: {
    otpRequested: number;
    otpVerified: number;
  } | null;
  clients: {
    client: string;
    activeSessions: number;
  }[];
}

export interface RegistrationsSeries {
  interval: 'day' | 'week' | 'month';
  items: {
    bucket: string;
    count: number;
  }[];
}

export interface SessionsSeries {
  interval: 'day' | 'week' | 'month';
  items: {
    bucket: string;
    created: number;
    held: number;
    attendance: number;
  }[];
}

export interface OtpSeries {
  interval: 'day' | 'week' | 'month';
  items: {
    bucket: string;
    requested: number;
    verified: number;
  }[];
}

export interface LeaderboardItem {
  userId: string;
  name: string;
  points: number;
  badges: number;
}

export interface LeaderboardResponse {
  items: LeaderboardItem[];
}
