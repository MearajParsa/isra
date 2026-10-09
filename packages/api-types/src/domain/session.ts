import { z } from 'zod';
import { HHmm, Id, IsoDateTime, Weekday, named } from '../core/primitives';

/** نوبت برگزاری (occurrence): حضور، صف و ارزیابی به نوبت تعلق دارند؛ +۵ حضور یک‌بار per نوبت */
export const Occurrence = named(
  'Occurrence',
  z.object({
    id: Id,
    seq: z.number().int().min(1).meta({ description: 'شمارهٔ نوبت در جلسه (۱، ۲، …)' }),
    status: z.enum(['live', 'closed']),
    openedAt: IsoDateTime,
    closedAt: IsoDateTime.nullable(),
    counts: z.object({ attendance: z.number().int().min(0), evaluations: z.number().int().min(0) })
  })
);

/** وضعیت قابل‌نمایش عمومی؛ `draft` هرگز عمومی نیست */
export const PublicSessionStatus = named('PublicSessionStatus', z.enum(['scheduled', 'started', 'ended']));
/**
 * چرخهٔ حیات کامل — فقط رو به جلو: draft → scheduled → started → ended (قفل #17).
 * ۱.۶.۰ (docs-v2/30): برای جلسهٔ تکرارشونده `started` = «دوره در جریان»؛ هر برگزاری یک «نوبت» (occurrence) جدا دارد
 * که کادر باز/بسته می‌کند. جلسهٔ once: ورود به started نوبت #۱ را خودکار باز و ended آن را می‌بندد.
 */
export const SessionState = named('SessionState', z.enum(['draft', 'scheduled', 'started', 'ended']));

const Duration = z.number().int().min(15).max(360).meta({ description: 'مدت (دقیقه)' });
const Days = z.array(Weekday).min(1).max(7).meta({ description: 'روزهای هفته: ۰=شنبه … ۶=جمعه' });

export const SessionSchedule = named(
  'SessionSchedule',
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('once'), startsAt: IsoDateTime, endsAt: IsoDateTime }).strict(),
    z.object({ type: z.literal('recurring'), weekdays: Days, timeOfDay: HHmm, durationMin: Duration }).strict(),
    z
      .object({ type: z.literal('range'), rangeFrom: IsoDateTime, rangeTo: IsoDateTime, weekdays: Days, timeOfDay: HHmm, durationMin: Duration })
      .strict()
  ]),
  'زمان‌بندی انعطاف‌پذیر (Asia/Tehran؛ هفته شنبه–جمعه)'
);

/** آدرس متنی + (اختیاری) لینک مسیریابی که سازندهٔ جلسه می‌گذارد (نشان/بلد/گوگل‌مپ …؛ فقط https). */
export const SessionLocation = z
  .object({
    label: z.string().trim().min(2).max(120),
    routeUrl: z.url({ protocol: /^https$/, error: 'لینک مسیریابی باید با https شروع شود.' }).max(500).nullable().optional()
  })
  .strict();

/** سیاست پیوستن (۱.۶.۰): request = درخواست + تأیید کادر؛ open = عضویت فوری قرآن‌آموز؛ invite_only = فقط افزودن کادر/لینک دعوت */
export const JoinPolicy = named('JoinPolicy', z.enum(['request', 'open', 'invite_only']));
/** public = در فهرست عمومی؛ unlisted = فقط با لینک مستقیم/دعوت (در فهرست عمومی و جست‌وجو نمی‌آید) */
export const SessionVisibility = named('SessionVisibility', z.enum(['public', 'unlisted']));
/**
 * ۱.۷.۰ (docs-v2/31 §۵): دیدن کامنت‌ها. public = همهٔ کسانی که جلسه را می‌بینند؛
 * reciter_only = کامنتِ حین تلاوت فقط برای نویسنده، خوانندهٔ همان نوبت صف و کادر (صاحب/پشتیبان/ادمین)؛ کامنت عمومیِ نوبت برای اعضا و کادر.
 */
export const CommentVisibility = named('CommentVisibility', z.enum(['public', 'reciter_only']));
const Capacity = z.number().int().min(1).max(1000).nullable().meta({ description: 'سقف اعضای تأییدشده (null = بی‌سقف)' });

const sessionBase = {
  id: Id,
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().min(10).max(500),
  schedule: SessionSchedule,
  nextStartsAt: IsoDateTime.nullable(),
  location: SessionLocation
};

/** فیلدهای ۱.۶.۰ با default تا نسخهٔ قبلی سرویس‌ها (ترتیب استقرار) پاسخ را نشکند */
const sessionPolicy = {
  joinPolicy: JoinPolicy.default('request'),
  capacity: Capacity.default(null),
  memberCount: z.number().int().min(0).default(0).meta({ description: 'اعضای تأییدشده' })
};
export const PublicSession = named('PublicSession', z.object({ ...sessionBase, status: PublicSessionStatus, ...sessionPolicy }).strict());
/** ۱.۷.۰: تنظیمات کامنت جلسه (default تا پاسخ نسخهٔ قبلی سرویس نشکند) */
const sessionComments = {
  commentsEnabled: z.boolean().default(true),
  commentVisibility: CommentVisibility.default('public')
};
export const MidSession = named(
  'MidSession',
  z.object({ ...sessionBase, status: SessionState, ...sessionPolicy, visibility: SessionVisibility.default('public'), ...sessionComments }).strict()
);

/** ورودی ساخت/ویرایش جلسه (بدون id/status) */
export const SessionInput = named(
  'SessionInput',
  z
    .object({
      title: sessionBase.title,
      description: sessionBase.description,
      schedule: SessionSchedule,
      location: SessionLocation,
      joinPolicy: JoinPolicy.default('request'),
      visibility: SessionVisibility.default('public'),
      capacity: Capacity.optional().meta({ description: 'نبود = بدون تغییر (ویرایش) / بی‌سقف (ساخت)' }),
      commentsEnabled: z.boolean().default(true).meta({ description: '۱.۷.۰: false ⇒ ثبت کامنت تازه ممنوع (CONFLICT(COMMENTS_DISABLED))؛ کامنت‌های قبلی می‌مانند' }),
      commentVisibility: CommentVisibility.default('public')
    })
    .strict()
    .superRefine((v, ctx) => {
      const s = v.schedule;
      if (s.type === 'once' && Date.parse(s.endsAt) <= Date.parse(s.startsAt))
        ctx.addIssue({ code: 'custom', path: ['schedule', 'endsAt'], message: 'پایان باید بعد از شروع باشد.' });
      if (s.type === 'range' && Date.parse(s.rangeTo) < Date.parse(s.rangeFrom))
        ctx.addIssue({ code: 'custom', path: ['schedule', 'rangeTo'], message: 'پایان بازه قبل از شروع است.' });
    })
);
