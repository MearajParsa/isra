import React from 'react';
import { useAuth } from './AuthContext';
import { hasPermission } from '@/lib/permissions';

export interface CanProps {
  perm?: string;
  role?: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function useCan(permission?: string, role?: string): boolean {
  const { actor, isDev } = useAuth();

  if (isDev) return true;
  if (!actor) return false;

  if (role && !actor.roles.includes(role)) {
    return false;
  }

  if (permission && !hasPermission(actor, permission)) {
    return false;
  }

  return true;
}

export const Can: React.FC<CanProps> = ({ perm, role, fallback = null, children }) => {
  const allowed = useCan(perm, role);
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
};
