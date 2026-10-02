import { CLIENT_ID, CLIENT_VERSION, LOW_URL, MID_URL } from './config';
import { createHttp } from './http';
import { createLowApi } from './lowClient';
import { createMidApi } from './midClient';

/** کلاینت‌های واقعی api-low (`/c/v1`) و api-mid (`/o/v1`)؛ بدون mock/seed */
export const api = createLowApi(createHttp({ base: LOW_URL, client: CLIENT_ID, version: CLIENT_VERSION }));
export const midApi = createMidApi(createHttp({ base: MID_URL, client: CLIENT_ID, version: CLIENT_VERSION }), { baseUrl: MID_URL });
export * from './types';
export * from './mid-types';
