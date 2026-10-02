import { z } from 'zod';
import { HHmm, Id, IsoDateTime, Weekday, named } from '../core/primitives';

/** وضعیت قابل‌نمایش عمومی؛ `draft` هرگز عمومی نیست */
export const PublicSessionStatus = named('PublicSessionStatus', z.enum(['scheduled', 'started', 'ended']));
/** چرخهٔ حیات کامل — فقط رو به جلو: draft → scheduled → started → ended (قفل #17) */
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

const sessionBase = {
  id: Id,
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().min(10).max(500),
  schedule: SessionSchedule,
  nextStartsAt: IsoDateTime.nullable(),
  location: SessionLocation
};

export const PublicSession = named('PublicSession', z.object({ ...sessionBase, status: PublicSessionStatus }).strict());
export const MidSession = named('MidSession', z.object({ ...sessionBase, status: SessionState }).strict());

/** ورودی ساخت/ویرایش جلسه (بدون id/status) */
export const SessionInput = named(
  'SessionInput',
  z
    .object({
      title: sessionBase.title,
      description: sessionBase.description,
      schedule: SessionSchedule,
      location: SessionLocation
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
