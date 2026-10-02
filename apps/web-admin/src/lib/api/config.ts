/**
 * آدرس سرویس‌ها: متغیرهای زمان build (Vite): `VITE_API_LOW_URL` و `VITE_API_HIGH_URL`.
 * production: هر دو `https://api.israapp.ir`؛ توسعه: low=3001، high=3003.
 * (SPA استاتیک است ⇒ مقدار هنگام build در bundle قرار می‌گیرد؛ هیچ secret/کلیدی اینجا نیست.)
 */
const clean = (v: string | undefined, fallback: string) => (v ?? fallback).replace(/\/+$/, '');

export const LOW_URL = clean(import.meta.env.VITE_API_LOW_URL, 'http://localhost:3001');
export const HIGH_URL = clean(import.meta.env.VITE_API_HIGH_URL, 'http://localhost:3003');
export const CLIENT_ID = 'web-admin';
export const CLIENT_VERSION = '1.0.0';
