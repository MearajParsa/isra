import type { Http } from './http';
import type { AdminApi, AuditEntry, AuditQuery, Grant, Overview, PermissionInfo, PermissionKey, SettingsInput, SystemMe, SystemRole, SystemRoleKey, SystemSettings, SystemUser, UsersQuery } from './high-types';
import type { AuthResult, OtpChallenge, Page, RefreshResult } from './types';

/**
 * نگاشت به api-high (`/s/v1`) و فقط مسیرهای auth سرویس low (`/c/v1/auth/*`) — ماتریس `04`: web-admin به مسیر غیر-auth در low نمی‌زند.
 * @param lowHttp پایه low (cookie refresh `isra_rt_admin`)، @param highHttp پایه high
 */
export function createAdminApi(lowHttp: Http, highHttp: Http): AdminApi {
  const A = '/c/v1/auth';
  const S = '/s/v1/system';
  const t = (token: string) => ({ token });
  const step = (token: string, su: string) => ({ token, stepUp: su });

  return {
    auth: {
      requestOtp: (phone) => lowHttp.call<OtpChallenge>(`${A}/otp/request`, { method: 'POST', body: { phone } }),
      verifyOtp: (input) => lowHttp.call<AuthResult>(`${A}/otp/verify`, { method: 'POST', body: input, credentials: true }),
      loginPassword: (input) => lowHttp.call<AuthResult>(`${A}/login/password`, { method: 'POST', body: input, credentials: true }),
      refresh: () => lowHttp.call<RefreshResult>(`${A}/refresh`, { method: 'POST', body: {}, credentials: true }),
      logout: async () => {
        await lowHttp.call(`${A}/logout`, { method: 'POST', credentials: true });
      },
      stepUpRequest: (token) => lowHttp.call<OtpChallenge>(`${A}/step-up/otp/request`, { method: 'POST', ...t(token) }),
      stepUpVerify: (token, input) => lowHttp.call<{ stepUpToken: string; expiresInSec: number }>(`${A}/step-up/otp/verify`, { method: 'POST', body: input, ...t(token) })
    },
    system: {
      me: (tk) => highHttp.call<SystemMe>(`${S}/me`, t(tk)),
      overview: (tk) => highHttp.call<Overview>(`${S}/overview`, t(tk)),
      roles: (tk) => highHttp.listAll<SystemRole>(`${S}/roles`, t(tk), 10, 2),
      permissions: (tk) => highHttp.listAll<PermissionInfo>(`${S}/permissions`, t(tk), 50, 2),
      setRolePermissions: (tk, key: SystemRoleKey, permissions: PermissionKey[], su) => highHttp.call<SystemRole>(`${S}/roles/${encodeURIComponent(key)}/permissions`, { method: 'PUT', body: { permissions }, ...step(tk, su) }),
      users: (tk, q: UsersQuery = {}): Promise<Page<SystemUser>> => highHttp.list<SystemUser>(`${S}/users`, { query: { q: q.q || undefined, role: q.role, page: q.page ?? 1, pageSize: q.pageSize ?? 20 }, ...t(tk) }),
      user: (tk, id) => highHttp.call<SystemUser>(`${S}/users/${encodeURIComponent(id)}`, t(tk)),
      setUserRoles: (tk, id, roles: SystemRoleKey[], su) => highHttp.call<SystemUser>(`${S}/users/${encodeURIComponent(id)}/roles`, { method: 'PUT', body: { roles }, ...step(tk, su) }),
      setUserGrants: (tk, id, grants: Grant[], su) => highHttp.call<SystemUser>(`${S}/users/${encodeURIComponent(id)}/grants`, { method: 'PUT', body: { grants }, ...step(tk, su) }),
      settings: (tk) => highHttp.call<SystemSettings>(`${S}/settings`, t(tk)),
      updateSettings: (tk, input: SettingsInput, su) => highHttp.call<SystemSettings>(`${S}/settings`, { method: 'PUT', body: input, ...step(tk, su) }),
      audit: (tk, q: AuditQuery = {}): Promise<Page<AuditEntry>> => highHttp.list<AuditEntry>(`${S}/audit`, { query: { action: q.action || undefined, q: q.q || undefined, page: q.page ?? 1, pageSize: q.pageSize ?? 20 }, ...t(tk) })
    }
  };
}
