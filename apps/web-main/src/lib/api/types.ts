/** نوع‌های کلاینت برای api-low (قرارداد: packages/api-types؛ docs-v2/15) */

export type ApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_TOKEN_INVALID'
  | 'AUTH_STEP_UP_REQUIRED'
  | 'AUTH_FORBIDDEN'
  | 'AUTH_PASSWORD_CHANGE_REQUIRED'
  | 'AUTH_ACCOUNT_DISABLED'
  | 'AUTH_PERM_STALE'
  | 'AUTH_OTP_INVALID'
  | 'AUTH_OTP_EXPIRED'
  | 'AUTH_OTP_EXHAUSTED'
  | 'AUTH_OTP_SEND_FAILED'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_REFRESH_INVALID'
  | 'VALIDATION_FAILED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'SESSION_INVALID_TRANSITION'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  /** فقط سمت کلاینت: قطع شبکه */
  | 'NETWORK_ERROR';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  get retryAfterSec(): number | undefined {
    const v = this.details.retryAfterSec;
    return typeof v === 'number' ? v : undefined;
  }
  get attemptsLeft(): number | undefined {
    const v = this.details.attemptsLeft;
    return typeof v === 'number' ? v : undefined;
  }
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface OtpChallenge {
  challengeId: string;
  expiresInSec: number;
  resendAfterSec: number;
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
  sessionId: string;
  user: AuthUser;
}

export interface RefreshResult {
  accessToken: string;
  tokenType: 'Bearer';
  accessExpiresIn: number;
}

export interface DeviceInfo {
  deviceId: string;
  deviceLabel: string;
}

export interface Profile {
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
}

export interface Me {
  id: string;
  phone: string;
  hasPassword: boolean;
  /** رمز موقتِ تعیین‌شده توسط مدیر؛ تا تغییر رمز فقط مسیرهای تغییر رمز/خروج مجازند */
  mustChangePassword?: boolean;
  profile: Profile;
}

export interface DeviceSession {
  id: string;
  deviceLabel: string;
  platform: 'web' | 'android';
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
}

export type InboxKind = 'membership' | 'turn' | 'evaluation' | 'system';

export interface InboxItem {
  id: string;
  kind: InboxKind;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  ref: string | null;
}

export interface InboxQuery {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
}

export type BadgeKey = 'badge_50' | 'badge_150' | 'badge_300' | 'badge_500';
export interface PointsSummary {
  total: number;
  badges: { key: BadgeKey; threshold: number; awardedAt: string | null }[];
}

export type SessionStatus = 'scheduled' | 'started' | 'ended';

export type SessionSchedule =
  | { type: 'once'; startsAt: string; endsAt: string }
  | {
      type: 'recurring';
      /** ۰=شنبه … ۶=جمعه */
      weekdays: number[];
      timeOfDay: string;
      durationMin: number;
    }
  | {
      type: 'range';
      rangeFrom: string;
      rangeTo: string;
      weekdays: number[];
      timeOfDay: string;
      durationMin: number;
    };

export interface PublicSession {
  id: string;
  title: string;
  description: string;
  status: SessionStatus;
  schedule: SessionSchedule;
  nextStartsAt: string | null;
  location: { label: string; routeUrl?: string | null };
}

export interface PublicSessionsQuery {
  page?: number;
  pageSize?: number;
  status?: SessionStatus;
}

export interface LowApi {
  auth: {
    requestOtp(phone: string): Promise<OtpChallenge>;
    verifyOtp(input: { challengeId: string; code: string } & DeviceInfo): Promise<AuthResult>;
    loginPassword(input: { phone: string; password: string } & DeviceInfo): Promise<AuthResult>;
    refresh(): Promise<RefreshResult>;
    logout(): Promise<void>;
    stepUpRequest(accessToken: string): Promise<OtpChallenge>;
    stepUpVerify(
      accessToken: string,
      input: { challengeId: string; code: string }
    ): Promise<{ stepUpToken: string; expiresInSec: number }>;
  };
  me: {
    get(accessToken: string): Promise<Me>;
    updateProfile(accessToken: string, patch: Partial<Pick<Profile, 'firstName' | 'lastName'>>): Promise<Profile>;
    setPassword(
      accessToken: string,
      input: { newPassword: string; stepUpToken?: string; currentPassword?: string }
    ): Promise<void>;
    listSessions(accessToken: string): Promise<DeviceSession[]>;
    revokeSession(accessToken: string, id: string): Promise<void>;
    revokeOthers(accessToken: string): Promise<void>;
    inbox(accessToken: string, q?: InboxQuery): Promise<Page<InboxItem>>;
    unreadCount(accessToken: string): Promise<number>;
    markRead(accessToken: string, id: string): Promise<void>;
    markAllRead(accessToken: string): Promise<void>;
    points(accessToken: string): Promise<PointsSummary>;
  };
  publicContent: {
    listSessions(q?: PublicSessionsQuery): Promise<Page<PublicSession>>;
    getSession(id: string): Promise<PublicSession>;
  };
}
