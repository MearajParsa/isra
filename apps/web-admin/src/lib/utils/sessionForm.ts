import type { SessionInput, SessionSchedule } from '$lib/api/high-types';

export type FormErrors = Record<string, string>;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** اعتبارسنجی سمت کلاینت هم‌راستا با `SessionInput` قرارداد (سرور مرجع نهایی است) */
export function validateSession(v: SessionInput): FormErrors {
  const e: FormErrors = {};
  const title = v.title.trim();
  if (title.length < 3 || title.length > 80) e.title = 'عنوان باید ۳ تا ۸۰ نویسه باشد.';
  const desc = v.description.trim();
  if (desc.length < 10 || desc.length > 500) e.description = 'توضیحات باید ۱۰ تا ۵۰۰ نویسه باشد.';
  const label = v.location.label.trim();
  if (label.length < 2 || label.length > 120) e.location = 'مکان باید ۲ تا ۱۲۰ نویسه باشد.';
  const url = (v.location.routeUrl ?? '').trim();
  if (url) {
    let ok = false;
    try {
      ok = new URL(url).protocol === 'https:' && url.length <= 500;
    } catch {
      ok = false;
    }
    if (!ok) e['location.routeUrl'] = 'لینک مسیریابی باید یک آدرس معتبر با https باشد.';
  }
  const s = v.schedule;
  if (s.type === 'once') {
    const a = Date.parse(s.startsAt);
    const b = Date.parse(s.endsAt);
    if (!Number.isFinite(a)) e.startsAt = 'زمان شروع را انتخاب کنید.';
    if (!Number.isFinite(b)) e.endsAt = 'زمان پایان را انتخاب کنید.';
    else if (Number.isFinite(a) && b <= a) e.endsAt = 'پایان باید بعد از شروع باشد.';
  } else {
    if (s.weekdays.length < 1) e.weekdays = 'دست‌کم یک روز هفته را انتخاب کنید.';
    if (!HHMM.test(s.timeOfDay)) e.timeOfDay = 'ساعت شروع معتبر نیست.';
    if (!Number.isInteger(s.durationMin) || s.durationMin < 15 || s.durationMin > 360) e.durationMin = 'مدت باید بین ۱۵ تا ۳۶۰ دقیقه باشد.';
    if (s.type === 'range') {
      const a = Date.parse(s.rangeFrom);
      const b = Date.parse(s.rangeTo);
      if (!Number.isFinite(a)) e.rangeFrom = 'تاریخ شروع بازه را انتخاب کنید.';
      if (!Number.isFinite(b)) e.rangeTo = 'تاریخ پایان بازه را انتخاب کنید.';
      else if (Number.isFinite(a) && b < a) e.rangeTo = 'پایان بازه قبل از شروع است.';
    }
  }
  return e;
}

/** ورودی نهایی با فاصله‌های اضافی حذف‌شده */
export function normalizeSession(v: SessionInput): SessionInput {
  const url = (v.location.routeUrl ?? '').trim();
  return { title: v.title.trim(), description: v.description.trim(), schedule: v.schedule, location: { label: v.location.label.trim(), routeUrl: url || null } };
}

/** خطای فیلدی سرور (`details.fields`) با کلید مسیر → کلید فرم (آخرین بخش مسیر برای schedule.*) */
export function mapServerFields(fields: Record<string, string>): FormErrors {
  const out: FormErrors = {};
  for (const [k, msg] of Object.entries(fields)) {
    out[k] = msg;
    if (k.startsWith('schedule.')) out[k.slice('schedule.'.length)] = msg;
    if (k === 'location.label') out.location = msg;
  }
  return out;
}

/** مقدار پیش‌فرض فرم ساخت جلسه: هفتهٔ بعد ساعت ۱۸ تا ۱۹ به وقت تهران */
export function defaultSchedule(kind: SessionSchedule['type'], now: number = Date.now()): SessionSchedule {
  const iso = (days: number, hh: number) => {
    const d = new Date(now + days * 86_400_000);
    d.setUTCHours(hh - 3, 30, 0, 0);
    return d.toISOString();
  };
  if (kind === 'once') return { type: 'once', startsAt: iso(7, 18), endsAt: iso(7, 19) };
  if (kind === 'recurring') return { type: 'recurring', weekdays: [4], timeOfDay: '18:00', durationMin: 60 };
  return { type: 'range', rangeFrom: iso(7, 0), rangeTo: iso(60, 0), weekdays: [4], timeOfDay: '18:00', durationMin: 60 };
}

export const emptySessionInput = (): SessionInput => ({ title: '', description: '', schedule: defaultSchedule('once'), location: { label: '', routeUrl: null } });
