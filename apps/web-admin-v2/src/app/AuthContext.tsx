import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getAccessToken, getCurrentUser, hasSessionHint, clearAuthMemory, onAuthChange } from '@/api/auth';
import { performSilentRefresh } from '@/api/http';
import { H00_getSystemMe } from '@/api/endpoints/system';
import { L05_logout } from '@/api/endpoints/auth';
import { AuthUser, SystemMe } from '@/api/types';
import { isDeveloper } from '@/lib/permissions';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  actor: SystemMe | null;
  isDev: boolean;
  mustChangePassword: boolean;
  isAccountDisabled: boolean;
  setMustChangePassword: (val: boolean) => void;
  logout: () => Promise<void>;
  refetchActor: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(Boolean(getAccessToken()));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [user, setUser] = useState<AuthUser | null>(getCurrentUser());
  const [actor, setActor] = useState<SystemMe | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  const [isAccountDisabled, setIsAccountDisabled] = useState<boolean>(false);

  // Sync actor (permissions, roles, stepUp)
  const fetchActorInfo = useCallback(async () => {
    try {
      const data = await H00_getSystemMe();
      setActor(data);
    } catch (err: unknown) {
      const apiErr = err as { code?: string };
      if (apiErr.code === 'AUTH_FORBIDDEN') {
        // User is logged in but has no system roles assigned
        setActor(null);
      }
    }
  }, []);

  // Boot: try silent refresh if non-sensitive session hint exists
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      if (hasSessionHint() && !getAccessToken()) {
        try {
          await performSilentRefresh();
          if (isMounted) {
            setIsAuthenticated(true);
            setUser(getCurrentUser());
            await fetchActorInfo();
          }
        } catch {
          if (isMounted) {
            setIsAuthenticated(false);
          }
        }
      } else if (getAccessToken()) {
        if (isMounted) {
          setIsAuthenticated(true);
          await fetchActorInfo();
        }
      }

      if (isMounted) {
        setIsLoading(false);
      }
    }

    initAuth();

    // Listen to token changes across tabs or refreshes
    const unsubscribe = onAuthChange((authenticated) => {
      setIsAuthenticated(authenticated);
      setUser(getCurrentUser());
      if (authenticated) {
        fetchActorInfo();
      } else {
        setActor(null);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [fetchActorInfo]);

  const logout = useCallback(async () => {
    try {
      await L05_logout();
    } catch {
      // Ignore network error on logout
    } finally {
      clearAuthMemory(true);
      setIsAuthenticated(false);
      setUser(null);
      setActor(null);
    }
  }, []);

  const isDev = Boolean(actor?.roles && isDeveloper(actor.roles));

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        actor,
        isDev,
        mustChangePassword,
        isAccountDisabled,
        setMustChangePassword,
        logout,
        refetchActor: fetchActorInfo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
