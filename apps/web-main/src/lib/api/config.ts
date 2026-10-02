import { env } from '$env/dynamic/public';

/**
 * آدرس سرویس‌ها از env عمومی (runtime؛ بدون کلید/secret):
 *  - production: هر دو `https://api.israapp.ir` (مسیرها `/c/v1` و `/o/v1`)
 *  - توسعه: low روی 3001 و mid روی 3002
 */
const clean = (v: string | undefined, fallback: string) => (v ?? fallback).replace(/\/+$/, '');

export const LOW_URL = clean(env.PUBLIC_API_LOW_URL, 'http://localhost:3001');
export const MID_URL = clean(env.PUBLIC_API_MID_URL, 'http://localhost:3002');
export const CLIENT_ID = 'web-main';
export const CLIENT_VERSION = '1.0.0';
