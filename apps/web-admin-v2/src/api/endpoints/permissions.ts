/**
 * Permissions & Modules Endpoints (HIGH API: /s/v1/system/permissions & /s/v1/system/modules)
 */

import { httpRequest } from '../http';
import {
  CreateModuleBody,
  CreatePermissionBody,
  ModuleInfo,
  PermissionInfo,
  UpdateModuleBody,
  UpdatePermissionBody,
} from '../types';

export async function H11_getPermissions(query?: { page?: number; pageSize?: number }): Promise<PermissionInfo[]> {
  const res = await httpRequest<PermissionInfo[]>({
    target: 'HIGH',
    method: 'GET',
    path: '/s/v1/system/permissions',
    query,
  });
  return res.data;
}

export async function H85_createPermission(body: CreatePermissionBody): Promise<PermissionInfo> {
  const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `perm-create-${Date.now()}`;
  const res = await httpRequest<PermissionInfo>({
    target: 'HIGH',
    method: 'POST',
    path: '/s/v1/system/permissions',
    body,
    idempotencyKey,
  });
  return res.data;
}

export async function H86_updatePermission(key: string, body: UpdatePermissionBody): Promise<PermissionInfo> {
  const res = await httpRequest<PermissionInfo>({
    target: 'HIGH',
    method: 'PATCH',
    path: `/s/v1/system/permissions/${encodeURIComponent(key)}`,
    body,
  });
  return res.data;
}

export async function H87_deletePermission(key: string): Promise<PermissionInfo> {
  const res = await httpRequest<PermissionInfo>({
    target: 'HIGH',
    method: 'DELETE',
    path: `/s/v1/system/permissions/${encodeURIComponent(key)}`,
  });
  return res.data;
}

export async function H88_getModules(query?: { page?: number; pageSize?: number }): Promise<ModuleInfo[]> {
  const res = await httpRequest<ModuleInfo[]>({
    target: 'HIGH',
    method: 'GET',
    path: '/s/v1/system/modules',
    query,
  });
  return res.data;
}

export async function H89_createModule(body: CreateModuleBody): Promise<ModuleInfo> {
  const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `mod-create-${Date.now()}`;
  const res = await httpRequest<ModuleInfo>({
    target: 'HIGH',
    method: 'POST',
    path: '/s/v1/system/modules',
    body,
    idempotencyKey,
  });
  return res.data;
}

export async function H90_updateModule(key: string, body: UpdateModuleBody): Promise<ModuleInfo> {
  const res = await httpRequest<ModuleInfo>({
    target: 'HIGH',
    method: 'PATCH',
    path: `/s/v1/system/modules/${encodeURIComponent(key)}`,
    body,
  });
  return res.data;
}

export async function H91_deleteModule(key: string): Promise<ModuleInfo> {
  const res = await httpRequest<ModuleInfo>({
    target: 'HIGH',
    method: 'DELETE',
    path: `/s/v1/system/modules/${encodeURIComponent(key)}`,
  });
  return res.data;
}
