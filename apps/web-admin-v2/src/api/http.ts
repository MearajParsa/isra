/**
 * Unified Typed HTTP Client for Isra Admin Panel
 * Connects to LOW (${VITE_API_LOW_URL}) and HIGH (${VITE_API_HIGH_URL}) backends
 */

import { getAccessToken, updateAccessToken, clearAuthMemory, hasSessionHint, getStepUpToken, clearStepUpToken, onAuthChange } from './auth';
import { ApiError, normalizeApiError } from './errors';
import { ensureStepUpToken } from './stepUp';
import { ApiResponse, ApiErrorResponse, RefreshResult } from './types';

const APP_VERSION = '1.0.0';

// ETag in-memory cache for 304 Not Modified support
const etagCache = new Map<string, { etag: string; data: unknown }>();

// پاک‌سازی کش ETag با خروج/انقضای نشست (داده‌های یک حساب هرگز به حساب بعدی نشت نکند)
onAuthChange((authed) => {
  if (!authed) etagCache.clear();
});

// Single-flight refresh promise to prevent refresh races across concurrent requests
let singleFlightRefreshPromise: Promise<string> | null = null;

// Callbacks for global system auth states
let onPasswordChangeRequired: (() => void) | null = null;
let onAccountDisabled: (() => void) | null = null;
let onSessionExpired: (() => void) | null = null;

export function registerAuthHooks(hooks: {
  onPasswordChangeRequired?: () => void;
  onAccountDisabled?: () => void;
  onSessionExpired?: () => void;
}) {
  if (hooks.onPasswordChangeRequired) onPasswordChangeRequired = hooks.onPasswordChangeRequired;
  if (hooks.onAccountDisabled) onAccountDisabled = hooks.onAccountDisabled;
  if (hooks.onSessionExpired) onSessionExpired = hooks.onSessionExpired;
}

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  target: 'LOW' | 'HIGH';
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  idempotencyKey?: string;
  stepUpToken?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  isRetry?: boolean;
  /** بازتلاش پس از refresh توکن (جدا از isRetry تا step-up بعد از refresh هم بتواند بازپخش شود) */
  refreshed?: boolean;
  /** بازتلاش پس از گرفتن step-up */
  steppedUp?: boolean;
}

/**
 * Returns origin for target backend without trailing slash
 */
export function getBackendOrigin(target: 'LOW' | 'HIGH'): string {
  if (target === 'LOW') {
    return (import.meta.env.VITE_API_LOW_URL || 'https://capi.israapp.ir').replace(/\/+$/, '');
  }
  return (import.meta.env.VITE_API_HIGH_URL || 'https://sapi.israapp.ir').replace(/\/+$/, '');
}

/**
 * Performs single-flight token refresh with rotation cookie isra_rt
 */
export async function performSilentRefresh(): Promise<string> {
  if (singleFlightRefreshPromise) {
    return singleFlightRefreshPromise;
  }

  singleFlightRefreshPromise = (async () => {
    try {
      const lowOrigin = getBackendOrigin('LOW');
      const requestId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}`;

      const res = await fetch(`${lowOrigin}/c/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Isra-Client': 'web-admin',
          'X-Isra-Client-Version': APP_VERSION,
          'X-Request-Id': requestId,
        },
        credentials: 'include', // sends isra_rt cookie
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        clearAuthMemory();
        onSessionExpired?.();
        throw new ApiError('AUTH_REFRESH_FAILED', 'نشست شما منقضی شده است. لطفاً مجدداً وارد شوید.', res.status);
      }

      const json = (await res.json()) as ApiResponse<RefreshResult>;
      if (!json.success || !json.data?.accessToken) {
        clearAuthMemory();
        onSessionExpired?.();
        throw new ApiError('AUTH_REFRESH_INVALID', 'پاسخ تمدید نشست نامعتبر است', 401);
      }

      updateAccessToken(json.data.accessToken, json.data.accessExpiresIn || 900);
      return json.data.accessToken;
    } finally {
      singleFlightRefreshPromise = null;
    }
  })();

  return singleFlightRefreshPromise;
}

/**
 * Primary HTTP Request dispatcher
 */
export async function httpRequest<T>(options: HttpRequestOptions): Promise<{ data: T; meta: ApiResponse<T>['meta'] }> {
  const {
    method = 'GET',
    target,
    path,
    query,
    body,
    idempotencyKey,
    stepUpToken,
    timeoutMs = 15000,
    signal,
    isRetry = false,
    refreshed = false,
    steppedUp = false,
  } = options;

  const origin = getBackendOrigin(target);
  let url = `${origin}${path}`;

  if (query) {
    const searchParams = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        searchParams.append(k, String(v));
      }
    });
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const requestId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}`;

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'X-Isra-Client': 'web-admin',
    'X-Isra-Client-Version': APP_VERSION,
    'X-Request-Id': requestId,
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  // Authorization header (except public auth paths)
  const isPublicAuthPath =
    path === '/c/v1/auth/otp/request' ||
    path === '/c/v1/auth/otp/verify' ||
    path === '/c/v1/auth/login/password' ||
    path === '/c/v1/auth/refresh';

  if (!isPublicAuthPath) {
    const token = getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  // Step-up header
  // توکن step-up معتبرِ حافظه به‌صورت پیش‌دستانه برای نوشتن‌ها فرستاده می‌شود (یک رفت‌وبرگشت کمتر)
  const stepToken = stepUpToken ?? (method !== 'GET' ? getStepUpToken() : null);
  if (stepToken) {
    headers['X-Step-Up-Token'] = stepToken;
  }

  // Idempotency-Key
  if (idempotencyKey && method !== 'GET') {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  // ETag cache support for GET
  if (method === 'GET') {
    const cached = etagCache.get(url);
    if (cached?.etag) {
      headers['If-None-Match'] = cached.etag;
    }
  }

  // Timeout controller
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const combinedSignal = signal
    ? createCombinedSignal(signal, controller.signal)
    : controller.signal;

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: target === 'LOW' ? 'include' : 'same-origin',
      signal: combinedSignal,
    });

    clearTimeout(timer);

    // ETag 304 Not Modified
    if (response.status === 304 && method === 'GET') {
      const cached = etagCache.get(url);
      if (cached) {
        return { data: cached.data as T, meta: { requestId } };
      }
    }

    const responseEtag = response.headers.get('ETag');

    // Parse Response
    let responseJson: ApiResponse<T> | ApiErrorResponse;
    try {
      responseJson = await response.json();
    } catch {
      if (response.status >= 500) {
        throw new ApiError(
          'SERVICE_UNAVAILABLE',
          'سرویس موقتاً در دسترس نیست؛ چند لحظه بعد دوباره تلاش کنید.',
          response.status,
          undefined,
          requestId
        );
      }
      throw new ApiError(
        'INVALID_RESPONSE',
        'پاسخ دریافتی از سرور معتبر نمی‌باشد',
        response.status,
        undefined,
        requestId
      );
    }

    if (response.ok && responseJson.success) {
      if (method === 'GET' && responseEtag) {
        etagCache.set(url, { etag: responseEtag, data: responseJson.data });
      }
      return { data: responseJson.data, meta: responseJson.meta };
    }

    // Handle Api Error payload
    const errorPayload = (responseJson as ApiErrorResponse).error || {
      code: `HTTP_${response.status}`,
      message: 'خطای نامشخص در درخواست',
    };

    const apiError = new ApiError(
      errorPayload.code,
      errorPayload.message,
      response.status,
      errorPayload.details,
      (responseJson as ApiErrorResponse).meta?.requestId || requestId
    );

    // Exhaustive handling of system error codes
    switch (apiError.code) {
      case 'AUTH_REQUIRED':
      case 'AUTH_TOKEN_EXPIRED':
      case 'AUTH_TOKEN_INVALID':
      case 'AUTH_PERM_STALE': {
        // Attempt ONE silent refresh if not already retrying
        if (!refreshed && hasSessionHint()) {
          try {
            await performSilentRefresh();
            return await httpRequest<T>({ ...options, refreshed: true });
          } catch (refreshErr) {
            clearAuthMemory();
            onSessionExpired?.();
            throw refreshErr;
          }
        }
        clearAuthMemory();
        onSessionExpired?.();
        throw apiError;
      }

      case 'AUTH_STEP_UP_REQUIRED': {
        // Request Step-Up OTP, obtain stepUpToken, replay request ONCE
        if (!steppedUp) {
          try {
            // سرور توکن فعلی را نپذیرفت (منقضی/نامعتبر) ⇒ کش را دور بریز و OTP تازه بگیر
            if (stepToken) clearStepUpToken();
            const freshStepUpToken = await ensureStepUpToken();
            return await httpRequest<T>({
              ...options,
              stepUpToken: freshStepUpToken,
              steppedUp: true,
            });
          } catch (stepUpErr) {
            throw normalizeApiError(stepUpErr);
          }
        }
        throw apiError;
      }

      case 'AUTH_PASSWORD_CHANGE_REQUIRED': {
        onPasswordChangeRequired?.();
        throw apiError;
      }

      case 'AUTH_ACCOUNT_DISABLED': {
        onAccountDisabled?.();
        throw apiError;
      }

      case 'RATE_LIMITED': {
        const retryAfter = errorPayload.details?.retryAfterSec;
        if (retryAfter && !isRetry && method === 'GET') {
          // Delay and retry once for GET
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          return await httpRequest<T>({ ...options, isRetry: true });
        }
        throw apiError;
      }

      default:
        throw apiError;
    }
  } catch (err: unknown) {
    clearTimeout(timer);

    if (err instanceof ApiError) {
      throw err;
    }

    // Auto-retry idempotent GETs up to 2 times on network errors / 502 / 503 / 504
    if (!isRetry && method === 'GET') {
      try {
        await new Promise((r) => setTimeout(r, 600));
        return await httpRequest<T>({ ...options, isRetry: true });
      } catch {
        // Fallback to normalized error
      }
    }

    // If mutation failed on network error and had an idempotencyKey, allow 1 retry with SAME key
    if (!isRetry && method !== 'GET' && idempotencyKey) {
      try {
        await new Promise((r) => setTimeout(r, 500));
        return await httpRequest<T>({ ...options, isRetry: true });
      } catch {
        // Fallback to normalized error
      }
    }

    throw normalizeApiError(err);
  }
}

function createCombinedSignal(s1: AbortSignal, s2: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (s1.aborted || s2.aborted) {
    controller.abort();
    return controller.signal;
  }
  s1.addEventListener('abort', onAbort, { once: true });
  s2.addEventListener('abort', onAbort, { once: true });
  return controller.signal;
}
