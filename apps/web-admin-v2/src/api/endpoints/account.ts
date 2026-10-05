/**
 * My Account & Sessions Endpoints (HIGH API: /s/v1/system/me/...)
 */

import { httpRequest } from '../http';
import {
  EffectiveAccess,
  MyAccount,
  SetMyPasswordBody,
  UpdateMyProfileBody,
  UserDeviceSession,
} from '../types';

export async function H02_getMyAccount(): Promise<MyAccount> {
  const res = await httpRequest<MyAccount>({
    target: 'HIGH',
    method: 'GET',
    path: '/s/v1/system/me/account',
  });
  return res.data;
}

export async function H03_updateMyProfile(body: UpdateMyProfileBody): Promise<MyAccount> {
  const res = await httpRequest<MyAccount>({
    target: 'HIGH',
    method: 'PATCH',
    path: '/s/v1/system/me/profile',
    body,
  });
  return res.data;
}

export async function H04_setMyPassword(body: SetMyPasswordBody): Promise<Record<string, never>> {
  const res = await httpRequest<Record<string, never>>({
    target: 'HIGH',
    method: 'PUT',
    path: '/s/v1/system/me/password',
    body,
  });
  return res.data;
}

export async function H05_getMySessions(query?: { page?: number; pageSize?: number }): Promise<UserDeviceSession[]> {
  const res = await httpRequest<UserDeviceSession[]>({
    target: 'HIGH',
    method: 'GET',
    path: '/s/v1/system/me/sessions',
    query,
  });
  return res.data;
}

export async function H06_deleteMySession(id: string): Promise<Record<string, never>> {
  const res = await httpRequest<Record<string, never>>({
    target: 'HIGH',
    method: 'DELETE',
    path: `/s/v1/system/me/sessions/${encodeURIComponent(id)}`,
  });
  return res.data;
}

export async function H07_revokeOtherSessions(): Promise<Record<string, never>> {
  const res = await httpRequest<Record<string, never>>({
    target: 'HIGH',
    method: 'POST',
    path: '/s/v1/system/me/sessions/revoke-others',
  });
  return res.data;
}

export async function H94_getMyAccess(): Promise<EffectiveAccess> {
  const res = await httpRequest<EffectiveAccess>({
    target: 'HIGH',
    method: 'GET',
    path: '/s/v1/system/me/access',
  });
  return res.data;
}
