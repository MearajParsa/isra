import type { MembershipStatus, SessionRole, SessionState, UserStatus } from '$lib/api/high-types';

export const USER_STATUS: Record<UserStatus, string> = { active: 'فعال', disabled: 'غیرفعال', deleted: 'حذف‌شده' };
export const SESSION_STATE: Record<SessionState, string> = { draft: 'پیش‌نویس', scheduled: 'پیش‌رو', started: 'در حال برگزاری', ended: 'پایان‌یافته' };
export const SESSION_ROLE: Record<SessionRole, string> = { session_manager: 'مدیر جلسه', session_supporter: 'پشتیبان', teacher: 'استاد', quran_student: 'قرآن‌آموز' };
export const MEMBERSHIP: Record<MembershipStatus, string> = { pending: 'در انتظار', approved: 'تأییدشده', rejected: 'ردشده' };
export const SCHEDULE_TYPE: Record<string, string> = { once: 'یک‌باره', recurring: 'تکرارشونده', range: 'بازهٔ محدود' };

/** مرحلهٔ بعدی چرخهٔ حیات (فقط رو به جلو) */
export const NEXT_STATE: Record<SessionState, Exclude<SessionState, 'draft'> | null> = { draft: 'scheduled', scheduled: 'started', started: 'ended', ended: null };
export const TRANSITION_LABEL: Record<Exclude<SessionState, 'draft'>, string> = { scheduled: 'انتشار (پیش‌رو)', started: 'شروع جلسه', ended: 'پایان جلسه' };

/** نام کلاینت/پنل (X-Isra-Client) */
export function clientLabel(client: string | null): string {
  if (!client) return 'نامشخص';
  if (client === 'web-main') return 'وب‌سایت اسراء';
  if (client === 'web-admin') return 'پنل مدیریت';
  if (client.startsWith('android')) {
    const kind = client.split('-')[1];
    const tier = kind === 'low' ? 'عمومی' : kind === 'mid' ? 'جلسه‌ها' : kind === 'high' ? 'مدیریت' : '';
    return tier ? `اپ اندروید (${tier})` : 'اپ اندروید';
  }
  return client;
}

/** پیام فارسی دلیل CONFLICT؛ اگر ناشناخته بود پیام سرور استفاده می‌شود */
export const CONFLICT_MESSAGE: Record<string, string> = {
  PHONE_TAKEN: 'این شمارهٔ موبایل پیش‌تر برای کاربر دیگری ثبت شده است.',
  SELF_PROTECTED: 'این اقدام روی حساب خودتان مجاز نیست.',
  LAST_HOLDER: 'این کاربر آخرین دارندهٔ نقش توسعه‌دهنده است و نمی‌توان او را غیرفعال/حذف کرد.',
  USER_NOT_ACTIVE: 'کاربر فعال نیست (حذف‌شده است) و این اقدام ممکن نیست.',
  SESSION_LOCKED: 'در وضعیت فعلی جلسه این تغییر ممکن نیست.',
  ALREADY_DECIDED: 'دربارهٔ این درخواست پیش‌تر تصمیم گرفته شده است.',
  NOT_APPROVED: 'عضو هنوز تأیید نشده است.'
};
export function conflictMessage(reason: string | undefined, fallback: string): string {
  return (reason && CONFLICT_MESSAGE[reason]) || fallback;
}

export function isDeletedPhone(phone: string): boolean {
  return /^d[0-9a-f]{10}$/.test(phone);
}
