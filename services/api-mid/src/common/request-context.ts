import type { Request } from 'express';
import type { Peer } from '../internal/internal-auth';
import { CLIENTS, type ClientId } from '@isra/api-types';

export interface AuthedUser {
  userId: string;
  roles: string[];
  perms: string[];
  /** ۱.۷.۰: احراز با URL امضاشدهٔ رسانه (نه JWT) */
  signed?: boolean;
}

export interface RequestContext {
  requestId: string;
  ip: string;
  client: ClientId | null;
  clientVersion: string | null;
}

export type IsraRequest = Request & {
  /** فرستندهٔ احرازشدهٔ internal (فقط پس از InternalGuard) */
  internalCaller?: Peer;
  ctx: RequestContext;
  user?: AuthedUser;
  /** خروجی اعتبارسنجی zod طبق تعریف endpoint */
  input?: { body: unknown; query: unknown; params: unknown };
};

const CLIENT_SET = new Set<string>(CLIENTS);

export function parseClient(v: unknown): ClientId | null {
  return typeof v === 'string' && CLIENT_SET.has(v) ? (v as ClientId) : null;
}
