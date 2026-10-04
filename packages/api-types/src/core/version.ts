/**
 * نسخه‌گذاری قرارداد.
 *  - `API_VERSION` = نسخهٔ مسیر (`/c/v1` …): فقط با تغییر ناسازگار بالا می‌رود (v2 کنار v1 اجرا می‌شود).
 *  - `CONTRACT_VERSION` = semver خودِ این پکیج/OpenAPI: patch = اصلاح مستندات، minor = افزودن سازگار (endpoint/فیلد اختیاری)،
 *    major = تغییر ناسازگار (فقط همراه با API_VERSION جدید). جزئیات: docs-v2/22-api-engineering-standards.md §۵.
 */
export const CONTRACT_VERSION = '1.3.2';
export const API_VERSION = 'v1' as const;

export const SERVICES = {
  low: { name: 'api-low', prefix: '/c', title: 'اسراء — api-low (حساب، auth، پروفایل، اینباکس، محتوای عمومی)', cookie: 'isra_rt' },
  mid: { name: 'api-mid', prefix: '/o', title: 'اسراء — api-mid (جلسه، عضویت، حضور، صف، ارزیابی)', cookie: null },
  high: { name: 'api-high', prefix: '/s', title: 'اسراء — api-high (نقش‌ها، مجوزها، تنظیمات سراسری، audit)', cookie: null }
} as const;

export type ServiceKey = keyof typeof SERVICES;
export const versionedPrefix = (s: ServiceKey) => `${SERVICES[s].prefix}/${API_VERSION}`;
