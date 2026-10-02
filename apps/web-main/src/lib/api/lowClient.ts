import type { Http } from './http';
import type { AuthResult, DeviceSession, InboxItem, LowApi, Me, OtpChallenge, Page, PointsSummary, Profile, PublicSession, RefreshResult } from './types';

/** نگاشت یک‌به‌یک به endpointهای api-low (`/c/v1`؛ docs-v2/15، قرارداد: packages/api-types) */
export function createLowApi(http: Http): LowApi {
  const B = '/c/v1';
  const authed = (token: string) => ({ token });

  return {
    auth: {
      requestOtp: (phone) => http.call<OtpChallenge>(`${B}/auth/otp/request`, { method: 'POST', body: { phone } }),
      verifyOtp: (input) => http.call<AuthResult>(`${B}/auth/otp/verify`, { method: 'POST', body: input, credentials: true }),
      loginPassword: (input) => http.call<AuthResult>(`${B}/auth/login/password`, { method: 'POST', body: input, credentials: true }),
      refresh: () => http.call<RefreshResult>(`${B}/auth/refresh`, { method: 'POST', body: {}, credentials: true }),
      logout: async () => {
        await http.call(`${B}/auth/logout`, { method: 'POST', credentials: true });
      },
      stepUpRequest: (token) => http.call<OtpChallenge>(`${B}/auth/step-up/otp/request`, { method: 'POST', ...authed(token) }),
      stepUpVerify: (token, input) => http.call<{ stepUpToken: string; expiresInSec: number }>(`${B}/auth/step-up/otp/verify`, { method: 'POST', body: input, ...authed(token) })
    },
    me: {
      get: (t) => http.call<Me>(`${B}/me`, authed(t)),
      updateProfile: (t, patch) => http.call<Profile>(`${B}/me/profile`, { method: 'PATCH', body: patch, ...authed(t) }),
      setPassword: async (t, input) => {
        await http.call(`${B}/me/password`, { method: 'PUT', body: { newPassword: input.newPassword }, stepUp: input.stepUpToken, ...authed(t) });
      },
      listSessions: (t) => http.listAll<DeviceSession>(`${B}/me/sessions`, authed(t)),
      revokeSession: async (t, id) => {
        await http.call(`${B}/me/sessions/${encodeURIComponent(id)}`, { method: 'DELETE', ...authed(t) });
      },
      revokeOthers: async (t) => {
        await http.call(`${B}/me/sessions/revoke-others`, { method: 'POST', ...authed(t) });
      },
      inbox: (t, q = {}): Promise<Page<InboxItem>> => http.list<InboxItem>(`${B}/me/inbox`, { query: { page: q.page ?? 1, pageSize: q.pageSize ?? 20, unreadOnly: q.unreadOnly ? true : undefined }, ...authed(t) }),
      unreadCount: async (t) => (await http.call<{ count: number }>(`${B}/me/inbox/unread-count`, authed(t))).count,
      markRead: async (t, id) => {
        await http.call(`${B}/me/inbox/${encodeURIComponent(id)}/read`, { method: 'POST', ...authed(t) });
      },
      markAllRead: async (t) => {
        await http.call(`${B}/me/inbox/read-all`, { method: 'POST', ...authed(t) });
      },
      points: (t) => http.call<PointsSummary>(`${B}/me/points`, authed(t))
    },
    publicContent: {
      listSessions: (q = {}): Promise<Page<PublicSession>> => http.list<PublicSession>(`${B}/public/sessions`, { query: { page: q.page ?? 1, pageSize: q.pageSize ?? 20, status: q.status } }),
      getSession: (id) => http.call<PublicSession>(`${B}/public/sessions/${encodeURIComponent(id)}`)
    }
  };
}
