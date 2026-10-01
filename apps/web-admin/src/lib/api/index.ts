import { adminMockApi } from './mock/adminMock';
import type { AdminApi } from './high-types';

/**
 * نقطهٔ تعویض: تا قفل قرارداد و آماده‌شدن api-high (+ auth به api-low)، mock فعال است.
 * بعداً پیاده‌سازی fetch (`/s/v1` و `/c/v1/auth`) جایگزین می‌شود.
 */
export const api: AdminApi = adminMockApi;
export * from './types';
export * from './high-types';
