/**
 * نوع‌های قرارداد پیش‌نویس high (docs-v2/20-api-high-web-admin-draft.md).
 * ⚠ قفل مشروط؛ پس از آماده‌شدن api-high به packages/api-types منتقل می‌شود.
 */
import type { DeviceInfo, AuthResult, OtpChallenge, Page, RefreshResult } from './types';

export type SystemRoleKey = 'developer' | 'super_admin';
export const SYSTEM_ROLES: SystemRoleKey[] = ['developer', 'super_admin'];

export type PermissionKey =
  | 'system.users.view'
  | 'system.role.assign'
  | 'system.permission.edit'
  | 'system.settings.view'
  | 'system.settings.edit'
  | 'system.audit.view'
  | 'session.create';

export type Grant = 'session.create';

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
  phone: string;
  roles: SystemRoleKey[];
  grants: Grant[];
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: { id: string; name: string };
  action: string;
  target?: { type: 'user' | 'role' | 'settings'; id: string; label: string };
  summary: string;
  meta: Record<string, unknown>;
}

export interface EvalWeights {
  voice: number;
  tone: number;
  tajweed: number;
}
export type FlagKey = 'maintenance_mode' | 'registration_open';
export interface SystemSettings {
  version: number;
  evalWeights: EvalWeights;
  /** ۴ عدد اکیداً صعودی */
  badgeThresholds: [number, number, number, number];
  flags: Record<FlagKey, boolean>;
  updatedAt: string;
  updatedBy: string;
}
export type SettingsInput = Pick<SystemSettings, 'version' | 'evalWeights' | 'badgeThresholds' | 'flags'>;

export interface Overview {
  users: { total: number; admins: number };
  sessions: { draft: number; scheduled: number; started: number; ended: number };
  lastAudit: AuditEntry[];
}

export interface UsersQuery {
  q?: string;
  role?: SystemRoleKey | 'none';
  page?: number;
  pageSize?: number;
}
export interface AuditQuery {
  action?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

/** توکن step-up؛ برای writeها الزامی (هدر X-Step-Up-Token) */
export type StepUp = string;

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
    users(t: string, q?: UsersQuery): Promise<Page<SystemUser>>;
    user(t: string, id: string): Promise<SystemUser>;
    setUserRoles(t: string, id: string, roles: SystemRoleKey[], su: StepUp): Promise<SystemUser>;
    setUserGrants(t: string, id: string, grants: Grant[], su: StepUp): Promise<SystemUser>;
    settings(t: string): Promise<SystemSettings>;
    updateSettings(t: string, input: SettingsInput, su: StepUp): Promise<SystemSettings>;
    audit(t: string, q?: AuditQuery): Promise<Page<AuditEntry>>;
  };
}
