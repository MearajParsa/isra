import { ApiError } from '$lib/api/types';

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'خطای ناشناخته‌ای رخ داد. دوباره تلاش کنید.';
}

export function fieldErrors(e: unknown): Record<string, string> {
  if (e instanceof ApiError) {
    const f = e.details.fields;
    if (f && typeof f === 'object') return f as Record<string, string>;
  }
  return {};
}

export function isNetworkError(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'NETWORK_ERROR';
}
