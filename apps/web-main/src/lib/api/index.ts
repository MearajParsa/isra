import { mockApi } from './mock/mockApi';
import { midMockApi } from './mock/midMock';
import type { MidApi } from './mid-types';
import type { LowApi } from './types';

/**
 * نقطهٔ تعویض: تا قفل قرارداد و آماده‌شدن سرور low، mock فعال است.
 * بعداً اینجا پیاده‌سازی fetch (base `/c/v1`) جایگزین می‌شود.
 */
export const api: LowApi = mockApi;
/** mid (`/o/v1`) — mock تا آماده‌شدن api-mid */
export const midApi: MidApi = midMockApi;
export * from './types';
export * from './mid-types';
