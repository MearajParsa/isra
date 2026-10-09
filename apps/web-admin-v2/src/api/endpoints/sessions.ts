/**
 * Quran Sessions Endpoints (HIGH API: /s/v1/system/sessions/...)
 */

import { httpRequest } from '../http';
import {
  AdminAttendanceList,
  AdminCreateSessionBody,
  AdminDecideBody,
  AdminEvaluations,
  AdminMember,
  AdminQueue,
  AdminSession,
  SessionInput,
  SessionState,
  TransitionBody,
} from '../types';

export interface SessionsQueryParams {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: SessionState;
  creatorId?: string;
  from?: string;
  to?: string;
  includeDeleted?: 'true' | 'false';
  sort?: 'newest' | 'oldest' | 'title' | 'nextStart';
}

export async function H60_getSessions(query?: SessionsQueryParams): Promise<{ items: AdminSession[]; total: number; page: number; pageSize: number }> {
  const res = await httpRequest<AdminSession[]>({
    target: 'HIGH',
    method: 'GET',
    path: '/s/v1/system/sessions',
    query: query as Record<string, string | number | boolean | null | undefined>,
  });
  return {
    items: res.data,
    total: res.meta?.total ?? res.data.length,
    page: res.meta?.page ?? query?.page ?? 1,
    pageSize: res.meta?.pageSize ?? query?.pageSize ?? 25,
  };
}

export async function H61_getSession(id: string): Promise<AdminSession> {
  const res = await httpRequest<AdminSession>({
    target: 'HIGH',
    method: 'GET',
    path: `/s/v1/system/sessions/${encodeURIComponent(id)}`,
  });
  return res.data;
}

export async function H62_createSession(body: AdminCreateSessionBody): Promise<AdminSession> {
  const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `session-create-${Date.now()}`;
  const res = await httpRequest<AdminSession>({
    target: 'HIGH',
    method: 'POST',
    path: '/s/v1/system/sessions',
    body,
    idempotencyKey,
  });
  return res.data;
}

export async function H63_updateSession(id: string, body: SessionInput): Promise<AdminSession> {
  const res = await httpRequest<AdminSession>({
    target: 'HIGH',
    method: 'PATCH',
    path: `/s/v1/system/sessions/${encodeURIComponent(id)}`,
    body,
  });
  return res.data;
}

export async function H64_transitionSession(id: string, body: TransitionBody): Promise<AdminSession> {
  const res = await httpRequest<AdminSession>({
    target: 'HIGH',
    method: 'POST',
    path: `/s/v1/system/sessions/${encodeURIComponent(id)}/transition`,
    body,
  });
  return res.data;
}

export async function H65_deleteSession(id: string): Promise<Record<string, never>> {
  const res = await httpRequest<Record<string, never>>({
    target: 'HIGH',
    method: 'DELETE',
    path: `/s/v1/system/sessions/${encodeURIComponent(id)}`,
  });
  return res.data;
}

export async function H66_getSessionMembers(
  id: string,
  query?: { page?: number; pageSize?: number; status?: 'pending' | 'approved' | 'rejected' }
): Promise<AdminMember[]> {
  const res = await httpRequest<AdminMember[]>({
    target: 'HIGH',
    method: 'GET',
    path: `/s/v1/system/sessions/${encodeURIComponent(id)}/members`,
    query,
  });
  return res.data;
}

export async function H67_decideMember(sessionId: string, memberId: string, body: AdminDecideBody): Promise<AdminMember> {
  const res = await httpRequest<AdminMember>({
    target: 'HIGH',
    method: 'PATCH',
    path: `/s/v1/system/sessions/${encodeURIComponent(sessionId)}/members/${encodeURIComponent(memberId)}`,
    body,
  });
  return res.data;
}

export async function H69_deleteMember(sessionId: string, memberId: string): Promise<Record<string, never>> {
  const res = await httpRequest<Record<string, never>>({
    target: 'HIGH',
    method: 'DELETE',
    path: `/s/v1/system/sessions/${encodeURIComponent(sessionId)}/members/${encodeURIComponent(memberId)}`,
  });
  return res.data;
}

export async function H70_getSessionAttendance(id: string): Promise<AdminAttendanceList> {
  const res = await httpRequest<AdminAttendanceList>({
    target: 'HIGH',
    method: 'GET',
    path: `/s/v1/system/sessions/${encodeURIComponent(id)}/attendance`,
  });
  return res.data;
}

export async function H71_getSessionQueue(id: string): Promise<AdminQueue> {
  const res = await httpRequest<AdminQueue>({
    target: 'HIGH',
    method: 'GET',
    path: `/s/v1/system/sessions/${encodeURIComponent(id)}/queue`,
  });
  return res.data;
}

export async function H72_getSessionEvaluations(id: string): Promise<AdminEvaluations> {
  const res = await httpRequest<AdminEvaluations>({
    target: 'HIGH',
    method: 'GET',
    path: `/s/v1/system/sessions/${encodeURIComponent(id)}/evaluations`,
  });
  return res.data;
}
