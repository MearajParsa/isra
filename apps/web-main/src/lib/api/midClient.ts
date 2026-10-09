import { io, type Socket } from 'socket.io-client';
import type { Http } from './http';
import type { ActiveCriteria, AttendanceEntry, AttendanceResult, Evaluation, EvaluationInput, LiveEvent, Member, MembershipStatus, MidApi, MidMe, MidSession, MySessionItem, QueueItem, QueueState, SessionInput, SessionMe } from './mid-types';
import type { Page } from './types';

const LIVE_TYPES = new Set(['attendance.updated', 'queue.updated', 'queue.turned', 'eval.updated', 'session.state']);

/** نگاشت به api-mid (`/o/v1`؛ docs-v2/18) + realtime با Socket.IO (فقط سیگنال؛ داده از REST) */
export function createMidApi(http: Http, opts: { baseUrl: string; socketPath?: string }): MidApi {
  const B = '/o/v1';
  const a = (token: string) => ({ token });
  const s = (id: string) => `${B}/sessions/${encodeURIComponent(id)}`;

  return {
    me: {
      get: (t) => http.call<MidMe>(`${B}/me`, a(t)),
      sessions: (t, scope = 'all') => http.listAll<MySessionItem>(`${B}/me/sessions`, { query: { scope }, ...a(t) })
    },
    sessions: {
      me: (t, id) => http.call<SessionMe>(`${s(id)}/me`, a(t)),
      create: (t, input: SessionInput) => http.call<MidSession>(`${B}/sessions`, { method: 'POST', body: input, idempotencyKey: true, ...a(t) }),
      update: (t, id, input) => http.call<MidSession>(s(id), { method: 'PATCH', body: input, ...a(t) }),
      transition: (t, id, to) => http.call<MidSession>(`${s(id)}/transition`, { method: 'POST', body: { to }, idempotencyKey: true, ...a(t) })
    },
    members: {
      request: (t, id) => http.call<Member>(`${s(id)}/members`, { method: 'POST', ...a(t) }),
      list: (t, id, status?: MembershipStatus) => http.listAll<Member>(`${s(id)}/members`, { query: { status }, ...a(t) }, 100),
      decide: (t, id, memberId, action) => http.call<Member>(`${s(id)}/members/${encodeURIComponent(memberId)}`, { method: 'PATCH', body: { action }, ...a(t) })
    },
    attendance: {
      checkIn: (t, id) => http.call<AttendanceResult>(`${s(id)}/attendance`, { method: 'POST', ...a(t) }),
      list: (t, id) => http.call<{ items: AttendanceEntry[]; total: number }>(`${s(id)}/attendance`, a(t))
    },
    queue: {
      join: (t, id) => http.call<QueueItem>(`${s(id)}/queue`, { method: 'POST', ...a(t) }),
      leave: async (t, id) => {
        await http.call(`${s(id)}/queue/me`, { method: 'DELETE', ...a(t) });
      },
      state: (t, id) => http.call<QueueState>(`${s(id)}/queue`, a(t)),
      next: (t, id) => http.call<QueueState>(`${s(id)}/queue/next`, { method: 'POST', ...a(t) }),
      act: (t, id, itemId, action) => http.call<QueueState>(`${s(id)}/queue/${encodeURIComponent(itemId)}`, { method: 'PATCH', body: { action }, ...a(t) })
    },
    evaluations: {
      criteria: (t) => http.call<ActiveCriteria>(`${B}/evaluation-criteria`, a(t)),
      submit: (t, id, input: EvaluationInput) => http.call<Evaluation>(`${s(id)}/evaluations`, { method: 'POST', body: input, idempotencyKey: true, ...a(t) }),
      list: (t, id): Promise<Page<Evaluation>> => http.list<Evaluation>(`${s(id)}/evaluations`, { query: { pageSize: 100 }, ...a(t) })
    },
    live: {
      subscribe({ getToken, sessionId, onEvent, onStatus }) {
        let socket: Socket | null = null;
        let stopped = false;
        let retry: ReturnType<typeof setTimeout> | null = null;
        let attempt = 0;

        const connect = () => {
          const token = getToken();
          if (stopped || !token) return;
          socket = io(opts.baseUrl, { path: opts.socketPath ?? '/o/v1/socket.io', auth: { token }, transports: ['websocket', 'polling'], reconnection: false, forceNew: true });
          socket.on('connect', () => {
            socket!.emit('session.join', { sessionId }, (r: { ok: boolean } | undefined) => {
              if (stopped) return;
              if (r?.ok) {
                attempt = 0;
                onStatus(true);
                // (باز)اتصال: ممکن است رویدادی از دست رفته باشد ⇒ همهٔ داده‌ها دوباره از REST
                for (const type of ['attendance.updated', 'queue.updated', 'eval.updated', 'session.state'] as const) onEvent({ type, sessionId, payload: { resync: true } });
              } else {
                onStatus(false);
              }
            });
          });
          socket.on('live', (e: LiveEvent) => {
            if (e && LIVE_TYPES.has(e.type) && e.sessionId === sessionId) onEvent(e);
          });
          const lost = () => {
            onStatus(false);
            socket?.removeAllListeners();
            socket?.close();
            socket = null;
            if (stopped) return;
            // انقضای access (سرور قطع می‌کند) یا قطع شبکه: با backoff و توکن تازه دوباره وصل شو
            const delay = Math.min(15_000, 500 * 2 ** attempt++) + Math.random() * 300;
            retry = setTimeout(connect, delay);
          };
          socket.on('disconnect', lost);
          socket.on('connect_error', lost);
        };

        connect();
        return () => {
          stopped = true;
          if (retry) clearTimeout(retry);
          socket?.removeAllListeners();
          socket?.close();
          onStatus(false);
        };
      }
    }
  };
}
