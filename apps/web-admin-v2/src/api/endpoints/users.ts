/**
 * Users & User Sessions Endpoints (HIGH API: /s/v1/system/users/...)
 */

import { httpRequest } from '../http';
import {
  CreateUserBody,
  EffectiveAccess,
  Grant,
  SetUserGrantsBody,
  SetUserRolesBody,
  SetUserStatusBody,
  SystemRoleKey,
  SystemUser,
  SystemUserDetail,
  UpdateUserBody,
  UserDeviceSession,
  UserPasswordBody,
  UserStatus,
} from '../types';

export interface UsersQueryParams {
  page?: number;
  pageSize?: number;
  q?: string;
  role?: SystemRoleKey | 'none';
  grant?: Grant | 'none';
  status?: UserStatus;
  createdFrom?: string;
  createdTo?: string;
  sort?: 'newest' | 'oldest' | 'name';
}

export async function H20_getUsers(query?: UsersQueryParams): Promise<{ items: SystemUser[]; total: number; page: number; pageSize: number }> {
  const res = await httpRequest<SystemUser[]>({
    target: 'HIGH',
    method: 'GET',
    path: '/s/v1/system/users',
    query: query as Record<string, string | number | boolean | null | undefined>,
  });
  return {
    items: res.data,
    total: res.meta?.total ?? res.data.length,
    page: res.meta?.page ?? query?.page ?? 1,
    pageSize: res.meta?.pageSize ?? query?.pageSize ?? 25,
  };
}

export async function H21_getUser(id: string): Promise<SystemUserDetail> {
  const res = await httpRequest<SystemUserDetail>({
    target: 'HIGH',
    method: 'GET',
    path: `/s/v1/system/users/${encodeURIComponent(id)}`,
  });
  return res.data;
}

export async function H22_setUserRoles(id: string, body: SetUserRolesBody): Promise<SystemUser> {
  const res = await httpRequest<SystemUser>({
    target: 'HIGH',
    method: 'PUT',
    path: `/s/v1/system/users/${encodeURIComponent(id)}/roles`,
    body,
  });
  return res.data;
}

export async function H23_setUserGrants(id: string, body: SetUserGrantsBody): Promise<SystemUser> {
  const res = await httpRequest<SystemUser>({
    target: 'HIGH',
    method: 'PUT',
    path: `/s/v1/system/users/${encodeURIComponent(id)}/grants`,
    body,
  });
  return res.data;
}

export async function H24_createUser(body: CreateUserBody): Promise<SystemUserDetail> {
  const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `user-create-${Date.now()}`;
  const res = await httpRequest<SystemUserDetail>({
    target: 'HIGH',
    method: 'POST',
    path: '/s/v1/system/users',
    body,
    idempotencyKey,
  });
  return res.data;
}

export async function H25_updateUser(id: string, body: UpdateUserBody): Promise<SystemUserDetail> {
  const res = await httpRequest<SystemUserDetail>({
    target: 'HIGH',
    method: 'PATCH',
    path: `/s/v1/system/users/${encodeURIComponent(id)}`,
    body,
  });
  return res.data;
}

export async function H26_setUserStatus(id: string, body: SetUserStatusBody): Promise<SystemUserDetail> {
  const res = await httpRequest<SystemUserDetail>({
    target: 'HIGH',
    method: 'POST',
    path: `/s/v1/system/users/${encodeURIComponent(id)}/status`,
    body,
  });
  return res.data;
}

export async function H27_deleteUser(id: string): Promise<Record<string, never>> {
  const res = await httpRequest<Record<string, never>>({
    target: 'HIGH',
    method: 'DELETE',
    path: `/s/v1/system/users/${encodeURIComponent(id)}`,
  });
  return res.data;
}

export async function H28_setUserPassword(id: string, body: UserPasswordBody): Promise<Record<string, never>> {
  const res = await httpRequest<Record<string, never>>({
    target: 'HIGH',
    method: 'PUT',
    path: `/s/v1/system/users/${encodeURIComponent(id)}/password`,
    body,
  });
  return res.data;
}

export async function H29_logoutAllUserSessions(id: string): Promise<Record<string, never>> {
  const res = await httpRequest<Record<string, never>>({
    target: 'HIGH',
    method: 'POST',
    path: `/s/v1/system/users/${encodeURIComponent(id)}/logout-all`,
  });
  return res.data;
}

export async function H50_getUserSessions(id: string, query?: { page?: number; pageSize?: number }): Promise<UserDeviceSession[]> {
  const res = await httpRequest<UserDeviceSession[]>({
    target: 'HIGH',
    method: 'GET',
    path: `/s/v1/system/users/${encodeURIComponent(id)}/sessions`,
    query,
  });
  return res.data;
}

export async function H51_deleteUserSession(userId: string, sessionId: string): Promise<Record<string, never>> {
  const res = await httpRequest<Record<string, never>>({
    target: 'HIGH',
    method: 'DELETE',
    path: `/s/v1/system/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}`,
  });
  return res.data;
}

export async function H93_getEffectiveAccess(id: string): Promise<EffectiveAccess> {
  const res = await httpRequest<EffectiveAccess>({
    target: 'HIGH',
    method: 'GET',
    path: `/s/v1/system/rbac/effective/${encodeURIComponent(id)}`,
  });
  return res.data;
}
