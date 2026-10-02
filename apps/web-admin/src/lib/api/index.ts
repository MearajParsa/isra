import { CLIENT_ID, CLIENT_VERSION, HIGH_URL, LOW_URL } from './config';
import { createAdminApi } from './highClient';
import { createHttp } from './http';

/** کلاینت واقعی: api-high (`/s/v1`) + auth api-low؛ بدون mock/seed */
export const api = createAdminApi(createHttp({ base: LOW_URL, client: CLIENT_ID, version: CLIENT_VERSION }), createHttp({ base: HIGH_URL, client: CLIENT_ID, version: CLIENT_VERSION }));
export * from './types';
export * from './high-types';
