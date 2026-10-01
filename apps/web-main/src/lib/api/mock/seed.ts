import type { InboxItem, PublicSession } from '../types';

const TEHRAN_OFFSET_MIN = 210; // +03:30 (بدون DST)

/** اولین وقوع (بعد از `from`) برای یکی از روزهای هفته (۰=شنبه) و ساعت HH:mm به وقت تهران */
export function nextOccurrence(weekdays: number[], timeOfDay: string, from: Date): Date {
  const [h, m] = timeOfDay.split(':').map(Number);
  const local = new Date(from.getTime() + TEHRAN_OFFSET_MIN * 60_000);
  for (let i = 0; i < 15; i++) {
    const day = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + i, h, m)
    );
    const idx = (day.getUTCDay() + 1) % 7; // یکشنبه=0 ← شنبه=0
    if (!weekdays.includes(idx)) continue;
    const instant = new Date(day.getTime() - TEHRAN_OFFSET_MIN * 60_000);
    if (instant.getTime() > from.getTime()) return instant;
  }
  return from;
}

const DAY = 86_400_000;

/** جلسات نمونه؛ زمان‌ها بر پایهٔ «امروز» محاسبه می‌شوند (درون یک روز پایدار) */
export function seedSessions(now = new Date()): PublicSession[] {
  const dayStart = new Date(Math.floor(now.getTime() / DAY) * DAY);
  const iso = (ms: number) => new Date(ms).toISOString();
  const at = (days: number, hh: number, mm = 0) =>
    iso(dayStart.getTime() + days * DAY + (hh * 60 + mm - TEHRAN_OFFSET_MIN) * 60_000);

  const rec = (weekdays: number[], timeOfDay: string) =>
    nextOccurrence(weekdays, timeOfDay, dayStart).toISOString();

  return [
    {
      id: '6f3c2a10-0000-4000-8000-000000000001',
      title: 'جلسهٔ هفتگی تلاوت و تدبر',
      description:
        'تلاوت جمعی چند صفحه از قرآن به‌همراه یادداشت کوتاه تدبر. مناسب همهٔ سطوح؛ نوبت قرائت با ترتیب ثبت‌نام در صف است.',
      status: 'scheduled',
      schedule: { type: 'recurring', weekdays: [4], timeOfDay: '18:00', durationMin: 90 },
      nextStartsAt: rec([4], '18:00'),
      location: { label: 'حضوری · تهران، سالن اجتماعات' }
    },
    {
      id: '6f3c2a10-0000-4000-8000-000000000002',
      title: 'کارگاه تجوید مقدماتی',
      description:
        'آشنایی با قواعد پایهٔ تجوید با تمرین عملی. هر جلسه یک قاعده، مرور و ارزیابی صوت، لحن و تجوید توسط معلم.',
      status: 'started',
      schedule: {
        type: 'range',
        rangeFrom: at(-14, 0),
        rangeTo: at(35, 0),
        weekdays: [1, 3],
        timeOfDay: '17:30',
        durationMin: 75
      },
      nextStartsAt: null,
      location: { label: 'آنلاین · پیوند پس از عضویت' }
    },
    {
      id: '6f3c2a10-0000-4000-8000-000000000003',
      title: 'شب‌های قرآن؛ ویژهٔ نوجوانان',
      description:
        'جلسهٔ یک‌باره با تلاوت، پرسش و پاسخ و تمرین قرائت برای نوجوانان ۱۲ تا ۱۷ سال.',
      status: 'scheduled',
      schedule: { type: 'once', startsAt: at(6, 19, 30), endsAt: at(6, 21) },
      nextStartsAt: at(6, 19, 30),
      location: { label: 'حضوری · تهران، مرکز فرهنگی' }
    },
    {
      id: '6f3c2a10-0000-4000-8000-000000000004',
      title: 'حلقهٔ حفظ جزء سی‌ام',
      description:
        'مرور و حفظ سوره‌های جزء سی‌ام با رویکرد تکرار فاصله‌دار؛ هر هفته یک سوره.',
      status: 'scheduled',
      schedule: {
        type: 'range',
        rangeFrom: at(3, 0),
        rangeTo: at(75, 0),
        weekdays: [0],
        timeOfDay: '09:00',
        durationMin: 60
      },
      nextStartsAt: rec([0], '09:00'),
      location: { label: 'آنلاین · پیوند پس از عضویت' }
    },
    {
      id: '6f3c2a10-0000-4000-8000-000000000005',
      title: 'تمرین روخوانی برای تازه‌کارها',
      description:
        'جلسهٔ آرام برای کسانی که تازه شروع کرده‌اند: روخوانی با راهنمایی و بازخورد دوستانه.',
      status: 'started',
      schedule: { type: 'recurring', weekdays: [2, 5], timeOfDay: '20:00', durationMin: 60 },
      nextStartsAt: null,
      location: { label: 'آنلاین · پیوند پس از عضویت' }
    },
    {
      id: '6f3c2a10-0000-4000-8000-000000000006',
      title: 'مرور هفتگی لحن و مقام‌ها',
      description:
        'آشنایی با لحن‌های رایج تلاوت و تمرین گوش‌دادن فعال؛ مناسب کسانی که روخوانی را می‌دانند.',
      status: 'scheduled',
      schedule: { type: 'recurring', weekdays: [3], timeOfDay: '21:00', durationMin: 60 },
      nextStartsAt: rec([3], '21:00'),
      location: { label: 'حضوری · تهران، سالن اجتماعات' }
    },
    {
      id: '6f3c2a10-0000-4000-8000-000000000007',
      title: 'دورهٔ فشردهٔ تابستانه',
      description: 'دورهٔ فشردهٔ روخوانی و تجوید که پایان یافته است؛ جلسهٔ مشابه به‌زودی اعلام می‌شود.',
      status: 'ended',
      schedule: {
        type: 'range',
        rangeFrom: at(-120, 0),
        rangeTo: at(-60, 0),
        weekdays: [0, 2, 4],
        timeOfDay: '16:00',
        durationMin: 60
      },
      nextStartsAt: null,
      location: { label: 'حضوری · تهران، مرکز فرهنگی' }
    },
    {
      id: '6f3c2a10-0000-4000-8000-000000000008',
      title: 'همایش یک‌روزهٔ انس با قرآن',
      description: 'همایش یک‌روزه با کارگاه‌های کوتاه تلاوت و تجوید.',
      status: 'ended',
      schedule: { type: 'once', startsAt: at(-30, 9), endsAt: at(-30, 15) },
      nextStartsAt: null,
      location: { label: 'حضوری · تهران، سالن اجتماعات' }
    },
    {
      id: '6f3c2a10-0000-4000-8000-000000000009',
      title: 'حلقهٔ تلاوت پنجشنبه‌شب',
      description: 'تلاوت و دعای دسته‌جمعی؛ برگزاری این دوره به پایان رسیده است.',
      status: 'ended',
      schedule: { type: 'recurring', weekdays: [5], timeOfDay: '20:30', durationMin: 90 },
      nextStartsAt: null,
      location: { label: 'آنلاین · پیوند پس از عضویت' }
    },
    {
      id: '6f3c2a10-0000-4000-8000-000000000010',
      title: 'کارگاه وقف و ابتدا',
      description: 'آموزش قواعد وقف و ابتدا همراه با تمرین؛ دو هفته یک‌بار.',
      status: 'scheduled',
      schedule: {
        type: 'range',
        rangeFrom: at(7, 0),
        rangeTo: at(60, 0),
        weekdays: [5],
        timeOfDay: '10:00',
        durationMin: 90
      },
      nextStartsAt: rec([5], '10:00'),
      location: { label: 'آنلاین · پیوند پس از عضویت' }
    }
  ];
}

export function seedInbox(now = Date.now()): InboxItem[] {
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  const item = (
    n: number,
    kind: InboxItem['kind'],
    title: string,
    body: string,
    minAgo: number,
    read = false
  ): InboxItem => ({
    id: `inbox-${String(n).padStart(3, '0')}`,
    kind,
    title,
    body,
    createdAt: ago(minAgo),
    readAt: read ? ago(minAgo - 5) : null,
    ref: null
  });
  return [
    item(1, 'turn', 'نوبت شما نزدیک است', 'در «جلسهٔ هفتگی تلاوت و تدبر» دو نفر قبل از شما در صف هستند.', 12),
    item(2, 'evaluation', 'ارزیابی جدید ثبت شد', 'نتیجهٔ ارزیابی قرائت شما در «کارگاه تجوید مقدماتی» آماده است.', 95),
    item(3, 'membership', 'عضویت شما تأیید شد', 'اکنون عضو «تمرین روخوانی برای تازه‌کارها» هستید.', 60 * 7),
    item(4, 'system', 'به اسراء خوش آمدید', 'حساب شما ساخته شد. از بخش «جلسات» می‌توانید جلسهٔ مناسب خود را پیدا کنید.', 60 * 26, true),
    item(5, 'turn', 'نوبت قرائت شما شروع شد', 'اکنون نوبت شماست؛ به جلسه برگردید.', 60 * 30, true),
    item(6, 'evaluation', 'ارزیابی جدید ثبت شد', 'نتیجهٔ ارزیابی قرائت شما در «حلقهٔ حفظ جزء سی‌ام» آماده است.', 60 * 50, true),
    item(7, 'membership', 'درخواست عضویت ثبت شد', 'درخواست شما برای «کارگاه وقف و ابتدا» به مدیر جلسه ارسال شد.', 60 * 72, true),
    item(8, 'system', 'نشان ۵۰ امتیاز', 'تبریک! نشان «۵۰ امتیاز» به شما تعلق گرفت.', 60 * 96, true),
    item(9, 'turn', 'نوبت شما ثبت شد', 'در صف «جلسهٔ هفتگی تلاوت و تدبر» ثبت شدید.', 60 * 120, true),
    item(10, 'system', 'نگهداری برنامه‌ریزی‌شده', 'شب جمعه بین ساعت ۲ تا ۳ بامداد ممکن است سرویس لحظاتی در دسترس نباشد.', 60 * 24 * 6, true),
    item(11, 'membership', 'عضویت شما رد شد', 'درخواست عضویت شما در «دورهٔ فشردهٔ تابستانه» پذیرفته نشد.', 60 * 24 * 9, true),
    item(12, 'evaluation', 'ارزیابی جدید ثبت شد', 'نتیجهٔ ارزیابی قرائت شما آماده است.', 60 * 24 * 12, true),
    item(13, 'system', 'به‌روزرسانی برنامه', 'امکان مشاهدهٔ دستگاه‌های وارد شده به حساب اضافه شد.', 60 * 24 * 15, true),
    item(14, 'turn', 'نوبت شما ثبت شد', 'در صف «تمرین روخوانی برای تازه‌کارها» ثبت شدید.', 60 * 24 * 20, true)
  ];
}
