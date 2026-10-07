import { z } from 'zod';
import { Id, IsoDateTime, named } from '../core/primitives';

/** کلید پایدار نشان (۱.۶.۰: نشان‌ها پویا و قابل مدیریت از high) */
export const BadgeKey = z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, 'کلید نشان: حروف کوچک انگلیسی/عدد/_').meta({ example: 'hafez_bronze' });
/** hash تصویر نشان؛ آدرس تصویر: `{LOW}/c/v1/public/badges/{id}/image?v={hash}` (L-34، کش immutable) */
export const BadgeImageRef = z.object({ hash: z.string().regex(/^[a-f0-9]{16,64}$/) });

export const BadgeView = named(
  'BadgeView',
  z.object({
    id: Id,
    key: BadgeKey,
    title: z.string().max(60),
    description: z.string().max(300),
    threshold: z.number().int().min(1).meta({ description: 'امتیاز لازم' }),
    image: BadgeImageRef.nullable(),
    awardedAt: IsoDateTime.nullable().meta({ description: 'null = هنوز کسب نشده (یا با افت امتیاز پس گرفته شده)' })
  })
);

export const PointsSummary = named(
  'PointsSummary',
  z.object({
    total: z.number().int().min(0),
    badges: z
      .array(BadgeView)
      .max(100)
      .meta({ description: 'همهٔ نشان‌های فعال به ترتیب آستانه؛ ۱.۶.۰: با افت امتیاز زیر آستانه، نشان پس گرفته می‌شود (تصمیم مالک — قفل #12 به‌روز شد)' })
  })
);

export const PointsReason = named(
  'PointsReason',
  z.enum(['attendance', 'evaluation', 'attendance_reversal', 'evaluation_adjust', 'evaluation_void', 'admin_adjust'])
);
export const PointsLedgerItem = named(
  'PointsLedgerItem',
  z.object({
    id: Id,
    points: z.number().int().meta({ description: 'مثبت یا منفی (اصلاحات)؛ مجموع کل هرگز زیر ۰ نمی‌رود' }),
    reason: PointsReason,
    session: z.object({ id: Id, title: z.string().max(80) }).nullable(),
    note: z.string().max(200).nullable(),
    createdAt: IsoDateTime
  })
);
