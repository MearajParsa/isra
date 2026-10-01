import { mockApi } from './mock/mockApi';
import type { LowApi } from './types';

/**
 * نقطهٔ تعویض: تا قفل قرارداد و آماده‌شدن سرور low، mock فعال است.
 * بعداً اینجا پیاده‌سازی fetch (base `/c/v1`) جایگزین می‌شود.
 */
export const api: LowApi = mockApi;
export * from './types';
