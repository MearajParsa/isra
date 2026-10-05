/**
 * System & Audit Endpoints (HIGH API: /s/v1/system/...)
 */

import { httpRequest } from '../http';
import {
  AuditEntry,
  Overview,
  SystemMe,
  SystemSettings,
  UpdateSettingsBody,
} from '../types';

export async function H00_getSystemMe(): Promise<SystemMe> {
  const res = await httpRequest<SystemMe>({
    target: 'HIGH',
    method: 'GET',
    path: '/s/v1/system/me',
  });
  return res.data;
}

export async function H01_getOverview(): Promise<Overview> {
  const res = await httpRequest<Overview>({
    target: 'HIGH',
    method: 'GET',
    path: '/s/v1/system/overview',
  });
  return res.data;
}

export async function H30_getSettings(): Promise<SystemSettings> {
  const res = await httpRequest<SystemSettings>({
    target: 'HIGH',
    method: 'GET',
    path: '/s/v1/system/settings',
  });
  return res.data;
}

export async function H31_updateSettings(body: UpdateSettingsBody): Promise<SystemSettings> {
  const res = await httpRequest<SystemSettings>({
    target: 'HIGH',
    method: 'PUT',
    path: '/s/v1/system/settings',
    body,
  });
  return res.data;
}

export interface AuditQueryParams {
  page?: number;
  pageSize?: number;
  action?: string;
  q?: string;
  actorId?: string;
  targetType?: 'user' | 'role' | 'settings' | 'session';
  targetId?: string;
  from?: string;
  to?: string;
}

export async function H40_getAudit(query?: AuditQueryParams): Promise<{ items: AuditEntry[]; total: number }> {
  const res = await httpRequest<AuditEntry[]>({
    target: 'HIGH',
    method: 'GET',
    path: '/s/v1/system/audit',
    query: query as Record<string, string | number | boolean | null | undefined>,
  });
  return {
    items: res.data,
    total: res.meta?.total ?? res.data.length,
  };
}
