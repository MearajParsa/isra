/**
 * قرارداد **internal** بین‌سرویسی برای مدیریت (خارج از OpenAPI عمومی؛ docs-v2/22 API9).
 * فقط `api-high` به‌عنوان فرستندهٔ احرازشده (secret جفتی + `X-Internal-Caller: high`) این مسیرها را صدا می‌زند.
 * قالب پاسخ همان envelope استاندارد `{ success, data, meta? }` است (لیست‌ها: meta.page/pageSize/total).
 */
export * from './admin';
export * from './events';
