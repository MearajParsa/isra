import { z } from 'zod';

/** شناسهٔ مات و امن برای path/query (در تولید UUID؛ فقط نویسه‌های بی‌خطر) */
export const Id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'شناسهٔ نامعتبر').meta({ description: 'شناسهٔ موجودیت (در تولید UUID)', example: '6f3c2a10-0000-4000-8000-000000000001' });
export const Uuid = z.uuid().meta({ description: 'UUID' });

/** موبایل ایرانی نرمال‌شده؛ نرمال‌سازی ارقام فارسی/+98 در مرز سرور (docs 15 §۸) و سپس این الگو */
export const IranMobile = z.string().regex(/^09\d{9}$/, 'فرمت شمارهٔ موبایل: 09xxxxxxxxx').meta({ example: '09121234567', description: 'شمارهٔ موبایل ایرانی' });

/** زمان ISO-8601 با offset (منطق کسب‌وکار Asia/Tehran) */
export const IsoDateTime = z.iso.datetime({ offset: true }).meta({ example: '2026-10-03T09:00:00+03:30' });

export const HHmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'ساعت HH:mm').meta({ example: '18:00' });

export const FaText = (min: number, max: number) => z.string().trim().min(min).max(max);

/** نویسه‌های کنترلی/جهت‌دهی (جعل نمایش) ممنوع؛ نیم‌فاصله (U+200C) مجاز است */
export const UNSAFE_TEXT = /[\u0000-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/;
export const SafeText = (min: number, max: number) =>
  z.string().trim().min(min).max(max).refine((s) => !UNSAFE_TEXT.test(s), { message: 'متن شامل نویسهٔ نامعتبر است.' });
export const PersonName = SafeText(2, 40);

/** روز هفته: ۰=شنبه … ۶=جمعه */
export const Weekday = z.number().int().min(0).max(6);

export const DeviceId = z.uuid().meta({ description: 'شناسهٔ دستگاه (UUID تصادفی سمت کلاینت)' });
export const DeviceLabel = z.string().trim().min(1).max(80);

export const OtpCode = z.string().regex(/^\d{5}$/, 'کد ۵ رقمی').meta({ example: '12345' });

/** سقف صفحه‌بندی (performance): پیش‌فرض ۲۰، سقف ۱۰۰ */
export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;

export const pageQuery = (maxPageSize = PAGE_SIZE_MAX) =>
  z.object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(maxPageSize).default(PAGE_SIZE_DEFAULT)
  });

/** برچسب‌گذاری هر response برای مستند‌سازی */
export const named = <T extends z.ZodType>(id: string, schema: T, description?: string) =>
  schema.meta(description ? { id, description } : { id });
