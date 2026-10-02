import type { Request } from 'express';
import { CLIENTS, type ClientId } from '@isra/api-types';

export interface AuthedUser {
  userId: string;
  sessionId: string;
  /** نقش‌ها و مجوزهای مؤثر از DB (نه JWT) */
  roles: string[];
  perms: string[];
}

export interface RequestContext {
  requestId: string;
  ip: string;
  client: ClientId | null;
  clientVersion: string | null;
}

export type IsraRequest = Request & {
  ctx: RequestContext;
  user?: AuthedUser;
  /** خروجی اعتبارسنجی zod طبق تعریف endpoint */
  input?: { body: unknown; query: unknown; params: unknown };
};

const CLIENT_SET = new Set<string>(CLIENTS);

export function parseClient(v: unknown): ClientId | null {
  return typeof v === 'string' && CLIENT_SET.has(v) ? (v as ClientId) : null;
}
