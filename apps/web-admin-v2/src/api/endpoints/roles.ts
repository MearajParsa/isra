/**
 * Roles & RBAC Matrix Endpoints (HIGH API: /s/v1/system/roles/...)
 */

import { httpRequest } from '../http';
import {
  CreateRoleBody,
  RbacMatrix,
  SetRoleModulesBody,
  SetRolePermissionsBody,
  SetRoleStepUpBody,
  SystemRole,
  UpdateRoleBody,
} from '../types';

export async function H10_getRoles(query?: { page?: number; pageSize?: number }): Promise<SystemRole[]> {
  const res = await httpRequest<SystemRole[]>({
    target: 'HIGH',
    method: 'GET',
    path: '/s/v1/system/roles',
    query,
  });
  return res.data;
}

export async function H12_setRolePermissions(key: string, body: SetRolePermissionsBody): Promise<SystemRole> {
  const res = await httpRequest<SystemRole>({
    target: 'HIGH',
    method: 'PUT',
    path: `/s/v1/system/roles/${encodeURIComponent(key)}/permissions`,
    body,
  });
  return res.data;
}

export async function H13_createRole(body: CreateRoleBody): Promise<SystemRole> {
  const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `role-create-${Date.now()}`;
  const res = await httpRequest<SystemRole>({
    target: 'HIGH',
    method: 'POST',
    path: '/s/v1/system/roles',
    body,
    idempotencyKey,
  });
  return res.data;
}

export async function H14_getRole(key: string): Promise<SystemRole> {
  const res = await httpRequest<SystemRole>({
    target: 'HIGH',
    method: 'GET',
    path: `/s/v1/system/roles/${encodeURIComponent(key)}`,
  });
  return res.data;
}

export async function H15_updateRole(key: string, body: UpdateRoleBody): Promise<SystemRole> {
  const res = await httpRequest<SystemRole>({
    target: 'HIGH',
    method: 'PATCH',
    path: `/s/v1/system/roles/${encodeURIComponent(key)}`,
    body,
  });
  return res.data;
}

export async function H16_deleteRole(key: string): Promise<SystemRole> {
  const res = await httpRequest<SystemRole>({
    target: 'HIGH',
    method: 'DELETE',
    path: `/s/v1/system/roles/${encodeURIComponent(key)}`,
  });
  return res.data;
}

export async function H17_setRoleModules(key: string, body: SetRoleModulesBody): Promise<SystemRole> {
  const res = await httpRequest<SystemRole>({
    target: 'HIGH',
    method: 'PUT',
    path: `/s/v1/system/roles/${encodeURIComponent(key)}/modules`,
    body,
  });
  return res.data;
}

export async function H18_setRoleStepUp(key: string, body: SetRoleStepUpBody): Promise<SystemRole> {
  const res = await httpRequest<SystemRole>({
    target: 'HIGH',
    method: 'PUT',
    path: `/s/v1/system/roles/${encodeURIComponent(key)}/step-up`,
    body,
  });
  return res.data;
}

export async function H92_getRbacMatrix(): Promise<RbacMatrix> {
  const res = await httpRequest<RbacMatrix>({
    target: 'HIGH',
    method: 'GET',
    path: '/s/v1/system/rbac/matrix',
  });
  return res.data;
}
