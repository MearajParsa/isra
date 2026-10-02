import type { Server as HttpServer } from 'node:http';
import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Server, type Socket } from 'socket.io';
import { mid } from '@isra/api-types';
import { JwtVerifier } from '../auth/jwt-verifier';
import { ENV, type Env } from '../config/env';
import { MembersAccess } from '../domain/access.service';

export type LiveType = 'attendance.updated' | 'queue.updated' | 'queue.turned' | 'eval.updated' | 'session.state';

const room = (sessionId: string) => `s:${sessionId}`;

/**
 * Socket.IO روی api-mid (قفل): توکن در handshake با JWKS اعتبارسنجی می‌شود؛ `session.join` فقط برای عضو تأییدشده.
 * رویدادها فقط «سیگنال» هستند (D3) و پس از commit دیتابیس منتشر می‌شوند؛ کلاینت داده را با REST می‌گیرد.
 * محدودیت (بدون Redis/broker): فقط socketهای متصل به همین instance اطلاع می‌گیرند ⇒ برای realtime یک instance
 * (یا sticky) کافی است؛ کلاینت پس از reconnect حتماً REST را دوباره می‌خواند.
 */
@Injectable()
export class LiveService implements OnApplicationShutdown {
  private readonly log = new Logger('Live');
  private io?: Server;

  constructor(
    private readonly host: HttpAdapterHost,
    private readonly jwt: JwtVerifier,
    private readonly access: MembersAccess,
    @Inject(ENV) private readonly env: Env
  ) {}

  /** بعد از listen/init صدا زده می‌شود (bootstrap) */
  attach(): void {
    if (!this.env.SOCKET_ENABLED || this.io) return;
    const http = this.host.httpAdapter.getHttpServer() as HttpServer;
    this.io = new Server(http, {
      path: this.env.SOCKET_PATH,
      serveClient: false,
      maxHttpBufferSize: 4096,
      pingInterval: 25_000,
      pingTimeout: 20_000,
      cors: { origin: this.env.CORS_ORIGINS, credentials: true },
      transports: ['websocket', 'polling']
    });

    this.io.use((socket, next) => {
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
      if (typeof token !== 'string') return next(new Error('AUTH_REQUIRED'));
      this.jwt
        .verify(token)
        .then((p) => {
          socket.data.userId = p.userId;
          // انقضای access ⇒ قطع؛ کلاینت تمدید می‌کند و دوباره وصل می‌شود
          const t = setTimeout(() => socket.disconnect(true), Math.max(1000, p.expiresAt - Date.now()));
          t.unref();
          socket.once('disconnect', () => clearTimeout(t));
          next();
        })
        .catch(() => next(new Error('AUTH_TOKEN_INVALID')));
    });

    this.io.on('connection', (socket) => this.onConnection(socket));
  }

  private onConnection(socket: Socket) {
    let joins = 0;
    const windowTimer = setInterval(() => (joins = 0), 60_000);
    windowTimer.unref();
    socket.once('disconnect', () => clearInterval(windowTimer));

    socket.on('session.join', (raw: unknown, ack?: (r: { ok: boolean; error?: string }) => void) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      const parsed = mid.SessionJoinMessage.safeParse(raw);
      if (!parsed.success || ++joins > 30) return reply({ ok: false, error: 'VALIDATION_FAILED' });
      this.access
        .isApprovedMember(parsed.data.sessionId, socket.data.userId as string)
        .then(async (ok) => {
          if (!ok) return reply({ ok: false, error: 'AUTH_FORBIDDEN' });
          await socket.join(room(parsed.data.sessionId));
          reply({ ok: true });
        })
        .catch(() => reply({ ok: false, error: 'INTERNAL_ERROR' }));
    });
    socket.on('session.leave', (raw: unknown) => {
      const p = mid.SessionJoinMessage.safeParse(raw);
      if (p.success) void socket.leave(room(p.data.sessionId));
    });
  }

  /** پس از commit فراخوانی شود. بدون socket (تست/غیرفعال) بی‌اثر است */
  emit(sessionId: string, type: LiveType, payload?: Record<string, unknown>): void {
    this.io?.to(room(sessionId)).emit('live', { type, sessionId, ...(payload ? { payload } : {}) });
  }

  async onApplicationShutdown() {
    await new Promise<void>((r) => (this.io ? this.io.close(() => r()) : r()));
    this.log.log('socket closed');
  }
}
