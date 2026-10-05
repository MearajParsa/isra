/**
 * In-Memory Authentication State & Token Lifecycle Management
 * Security strict: Access token and Step-up token are NEVER stored in persistent storage.
 */

import { AuthUser } from './types';

const SESSION_HINT_KEY = 'isra.admin.session';

// In-Memory state
let inMemoryAccessToken: string | null = null;
let tokenExpiresAtTimestamp: number | null = null;
let inMemoryCurrentUser: AuthUser | null = null;
let inMemoryStepUpToken: string | null = null;
let stepUpExpiresAtTimestamp: number | null = null;

let refreshTimerId: ReturnType<typeof setTimeout> | null = null;
let broadcastChannel: BroadcastChannel | null = null;

// Listeners for auth state changes
type AuthChangeListener = (isAuthenticated: boolean) => void;
const listeners = new Set<AuthChangeListener>();

// Initialize multi-tab broadcast channel
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel('isra-admin-auth');
    broadcastChannel.onmessage = (event) => {
      const { type } = event.data || {};
      if (type === 'LOGOUT') {
        clearAuthMemory(false);
      } else if (type === 'LOGIN' || type === 'REFRESH') {
        notifyListeners();
      }
    };
  } catch {
    // Channel not supported or blocked in environment
  }
}

/**
 * Access token getter (memory only)
 */
export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

/**
 * Current user getter
 */
export function getCurrentUser(): AuthUser | null {
  return inMemoryCurrentUser;
}

/**
 * Returns non-sensitive session hint from localStorage
 */
export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Sets session hint in localStorage
 */
export function setSessionHint(exists: boolean): void {
  try {
    if (exists) {
      localStorage.setItem(SESSION_HINT_KEY, '1');
    } else {
      localStorage.removeItem(SESSION_HINT_KEY);
    }
  } catch {
    // Storage might be restricted
  }
}

/**
 * Sets authentication in memory and schedules proactive token rotation
 */
export function setAuthSession(accessToken: string, expiresInSec: number, user?: AuthUser): void {
  inMemoryAccessToken = accessToken;
  tokenExpiresAtTimestamp = Date.now() + expiresInSec * 1000;
  if (user) {
    inMemoryCurrentUser = user;
  }
  setSessionHint(true);

  // Broadcast to other tabs
  broadcastChannel?.postMessage({ type: 'LOGIN' });

  // Schedule proactive refresh 60 seconds before expiration
  scheduleProactiveRefresh(expiresInSec);
  notifyListeners();
}

/**
 * Updates access token during silent refresh
 */
export function updateAccessToken(accessToken: string, expiresInSec: number): void {
  inMemoryAccessToken = accessToken;
  tokenExpiresAtTimestamp = Date.now() + expiresInSec * 1000;
  setSessionHint(true);
  broadcastChannel?.postMessage({ type: 'REFRESH' });
  scheduleProactiveRefresh(expiresInSec);
  notifyListeners();
}

/**
 * Step-up token management (in-memory only, 5 min validity)
 */
export function getStepUpToken(): string | null {
  if (!inMemoryStepUpToken || !stepUpExpiresAtTimestamp) return null;
  // Consider expired 10 seconds before actual expiry
  if (Date.now() >= stepUpExpiresAtTimestamp - 10000) {
    inMemoryStepUpToken = null;
    stepUpExpiresAtTimestamp = null;
    return null;
  }
  return inMemoryStepUpToken;
}

export function setStepUpToken(token: string, expiresInSec: number): void {
  inMemoryStepUpToken = token;
  stepUpExpiresAtTimestamp = Date.now() + expiresInSec * 1000;
}

export function clearStepUpToken(): void {
  inMemoryStepUpToken = null;
  stepUpExpiresAtTimestamp = null;
}

/**
 * Clears all authentication state from memory
 */
export function clearAuthMemory(broadcast = true): void {
  inMemoryAccessToken = null;
  tokenExpiresAtTimestamp = null;
  inMemoryCurrentUser = null;
  inMemoryStepUpToken = null;
  stepUpExpiresAtTimestamp = null;

  if (refreshTimerId) {
    clearTimeout(refreshTimerId);
    refreshTimerId = null;
  }

  setSessionHint(false);

  if (broadcast) {
    broadcastChannel?.postMessage({ type: 'LOGOUT' });
  }

  notifyListeners();
}

/**
 * Subscribes to auth state changes
 */
export function onAuthChange(listener: AuthChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(): void {
  const isAuth = Boolean(inMemoryAccessToken);
  listeners.forEach((l) => l(isAuth));
}

// Proactive refresh callback ref to avoid circular dependency
let proactiveRefreshHandler: (() => Promise<void>) | null = null;

export function registerProactiveRefreshHandler(handler: () => Promise<void>): void {
  proactiveRefreshHandler = handler;
}

function scheduleProactiveRefresh(expiresInSec: number): void {
  if (refreshTimerId) {
    clearTimeout(refreshTimerId);
  }

  // Refresh 60 seconds before expiration, or halfway if token is very short
  const delaySec = Math.max(10, expiresInSec - 60);
  refreshTimerId = setTimeout(async () => {
    if (proactiveRefreshHandler && inMemoryAccessToken) {
      try {
        await proactiveRefreshHandler();
      } catch {
        // Handled by refresh handler
      }
    }
  }, delaySec * 1000);
}

// Window focus listener: refresh if close to expiry
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    if (inMemoryAccessToken && tokenExpiresAtTimestamp) {
      const remainingSec = Math.floor((tokenExpiresAtTimestamp - Date.now()) / 1000);
      if (remainingSec < 60 && proactiveRefreshHandler) {
        proactiveRefreshHandler().catch(() => {});
      }
    }
  });
}
