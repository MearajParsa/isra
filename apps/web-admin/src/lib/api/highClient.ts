import type { Http } from './http';
import type {
  AdminApi,
  AdminMember,
  AdminSession,
  AdminSessionsQuery,
  AuditEntry,
  AuditQuery,
  Grant,
  LeaderboardItem,
  MyAccount,
  OtpSeries,
  Overview,
  PermissionInfo,
  PermissionKey,
  RegistrationsSeries,
  ReportOverview,
  SessionsSeries,
  SettingsInput,
  SystemMe,
  SystemRole,
  SystemRoleKey,
  SystemSettings,
  SystemUser,
  SystemUserDetail,
  UserDeviceSession,
  UsersQuery
} from './high-types';
import type { AuthResult, OtpChallenge, Page, RefreshResult } from './types';

/**
 * نگاشت به api-high (`/s/v1`) و فقط مسیرهای auth سرویس low (`/c/v1/auth/*`) — ماتریس `04`: web-admin به مسیر غیر-auth در low نمی‌زند.
 * @param lowHttp پایه low (cookie refresh `isra_rt_admin`)، @param highHttp پایه high
 */
export function createAdminApi(lowHttp: Http, highHttp: Http): AdminApi {
  const A = '/c/v1/auth';
  const S = '/s/v1/system';
  const t = (token: string, signal?: { signal?: AbortSignal }) => ({ token, signal: signal?.signal });
  const enc = encodeURIComponent;
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
      settings: (tk) => highHttp.call<SystemSettings>(`${S}/settings`, t(tk)),
      updateSettings: (tk, input: SettingsInput, su) => highHttp.call<SystemSettings>(`${S}/settings`, { method: 'PUT', body: input, ...step(tk, su) }),
      audit: (tk, q: AuditQuery = {}, s): Promise<Page<AuditEntry>> =>
        highHttp.list<AuditEntry>(`${S}/audit`, {
          query: { action: q.action || undefined, q: q.q || undefined, actorId: q.actorId || undefined, targetType: q.targetType, targetId: q.targetId || undefined, from: q.from || undefined, to: q.to || undefined, page: q.page ?? 1, pageSize: q.pageSize ?? 20 },
          ...t(tk, s)
        }),

      account: (tk, s) => highHttp.call<MyAccount>(`${S}/me/account`, t(tk, s)),
      updateProfile: (tk, body) => highHttp.call<MyAccount>(`${S}/me/profile`, { method: 'PATCH', body, ...t(tk) }),
      setMyPassword: async (tk, body, su) => {
        await highHttp.call(`${S}/me/password`, { method: 'PUT', body, token: tk, stepUp: su });
      },
      mySessions: (tk, s) => highHttp.list<UserDeviceSession>(`${S}/me/sessions`, { query: { page: 1, pageSize: 50 }, ...t(tk, s) }),
      revokeMySession: async (tk, id) => {
        await highHttp.call(`${S}/me/sessions/${enc(id)}`, { method: 'DELETE', ...t(tk) });
      },
      revokeOtherSessions: async (tk) => {
        await highHttp.call(`${S}/me/sessions/revoke-others`, { method: 'POST', ...t(tk) });
      },

      users: (tk, q: UsersQuery = {}, s): Promise<Page<SystemUser>> =>
        highHttp.list<SystemUser>(`${S}/users`, {
          query: { q: q.q || undefined, role: q.role, grant: q.grant, status: q.status, createdFrom: q.createdFrom || undefined, createdTo: q.createdTo || undefined, sort: q.sort, page: q.page ?? 1, pageSize: q.pageSize ?? 20 },
          ...t(tk, s)
        }),
      user: (tk, id, s) => highHttp.call<SystemUserDetail>(`${S}/users/${enc(id)}`, t(tk, s)),
      createUser: (tk, body, su) => highHttp.call<SystemUserDetail>(`${S}/users`, { method: 'POST', body, idempotencyKey: true, ...step(tk, su) }),
      updateUser: (tk, id, body, su) => highHttp.call<SystemUserDetail>(`${S}/users/${enc(id)}`, { method: 'PATCH', body, ...step(tk, su) }),
      setUserStatus: (tk, id, status, su) => highHttp.call<SystemUserDetail>(`${S}/users/${enc(id)}/status`, { method: 'POST', body: { status }, ...step(tk, su) }),
      deleteUser: async (tk, id, su) => {
        await highHttp.call(`${S}/users/${enc(id)}`, { method: 'DELETE', ...step(tk, su) });
      },
      setUserPassword: async (tk, id, body, su) => {
        await highHttp.call(`${S}/users/${enc(id)}/password`, { method: 'PUT', body, ...step(tk, su) });
      },
      logoutUserEverywhere: async (tk, id, su) => {
        await highHttp.call(`${S}/users/${enc(id)}/logout-all`, { method: 'POST', ...step(tk, su) });
      },
      userSessions: (tk, id, s) => highHttp.list<UserDeviceSession>(`${S}/users/${enc(id)}/sessions`, { query: { page: 1, pageSize: 50 }, ...t(tk, s) }),
      revokeUserSession: async (tk, id, sessionId, su) => {
        await highHttp.call(`${S}/users/${enc(id)}/sessions/${enc(sessionId)}`, { method: 'DELETE', ...step(tk, su) });
      },
      setUserRoles: (tk, id, roles: SystemRoleKey[], su) => highHttp.call<SystemUser>(`${S}/users/${enc(id)}/roles`, { method: 'PUT', body: { roles }, ...step(tk, su) }),
      setUserGrants: (tk, id, grants: Grant[], su) => highHttp.call<SystemUser>(`${S}/users/${enc(id)}/grants`, { method: 'PUT', body: { grants }, ...step(tk, su) }),

      sessions: (tk, q: AdminSessionsQuery = {}, s): Promise<Page<AdminSession>> =>
        highHttp.list<AdminSession>(`${S}/sessions`, {
          query: { q: q.q || undefined, status: q.status, creatorId: q.creatorId || undefined, from: q.from || undefined, to: q.to || undefined, includeDeleted: q.includeDeleted ? 'true' : 'false', sort: q.sort, page: q.page ?? 1, pageSize: q.pageSize ?? 20 },
          ...t(tk, s)
        }),
      session: (tk, id, s) => highHttp.call<AdminSession>(`${S}/sessions/${enc(id)}`, t(tk, s)),
      createSession: (tk, body, su) => highHttp.call<AdminSession>(`${S}/sessions`, { method: 'POST', body, idempotencyKey: true, ...step(tk, su) }),
      updateSession: (tk, id, body, su) => highHttp.call<AdminSession>(`${S}/sessions/${enc(id)}`, { method: 'PATCH', body, ...step(tk, su) }),
      transitionSession: (tk, id, to, su) => highHttp.call<AdminSession>(`${S}/sessions/${enc(id)}/transition`, { method: 'POST', body: { to }, ...step(tk, su) }),
      deleteSession: async (tk, id, su) => {
        await highHttp.call(`${S}/sessions/${enc(id)}`, { method: 'DELETE', ...step(tk, su) });
      },
      sessionMembers: (tk, id, q = {}, s) => highHttp.list<AdminMember>(`${S}/sessions/${enc(id)}/members`, { query: { status: q.status, page: q.page ?? 1, pageSize: q.pageSize ?? 100 }, ...t(tk, s) }),
      decideMember: (tk, id, memberId, action, su) => highHttp.call<AdminMember>(`${S}/sessions/${enc(id)}/members/${enc(memberId)}`, { method: 'PATCH', body: { action }, ...step(tk, su) }),
      setMemberRoles: (tk, id, memberId, roles, su) => highHttp.call<AdminMember>(`${S}/sessions/${enc(id)}/members/${enc(memberId)}/roles`, { method: 'PUT', body: { roles }, ...step(tk, su) }),
      removeMember: async (tk, id, memberId, su) => {
        await highHttp.call(`${S}/sessions/${enc(id)}/members/${enc(memberId)}`, { method: 'DELETE', ...step(tk, su) });
      },
      sessionAttendance: (tk, id, s) => highHttp.call(`${S}/sessions/${enc(id)}/attendance`, t(tk, s)),
      sessionQueue: (tk, id, s) => highHttp.call(`${S}/sessions/${enc(id)}/queue`, t(tk, s)),
      sessionEvaluations: (tk, id, s) => highHttp.call(`${S}/sessions/${enc(id)}/evaluations`, t(tk, s)),

      reportOverview: (tk, r = {}, s) => highHttp.call<ReportOverview>(`${S}/reports/overview`, { query: { from: r.from, to: r.to }, ...t(tk, s) }),
      reportRegistrations: (tk, r, s) => highHttp.call<RegistrationsSeries>(`${S}/reports/registrations`, { query: { from: r.from, to: r.to, interval: r.interval ?? 'day' }, ...t(tk, s) }),
      reportSessions: (tk, r, s) => highHttp.call<SessionsSeries>(`${S}/reports/sessions`, { query: { from: r.from, to: r.to, interval: r.interval ?? 'day' }, ...t(tk, s) }),
      reportOtp: (tk, r, s) => highHttp.call<OtpSeries>(`${S}/reports/otp`, { query: { from: r.from, to: r.to, interval: r.interval ?? 'day' }, ...t(tk, s) }),
      reportLeaderboard: async (tk, limit = 20, s) => (await highHttp.call<{ items: LeaderboardItem[] }>(`${S}/reports/leaderboard`, { query: { limit }, ...t(tk, s) })).items
    }
  };
}
