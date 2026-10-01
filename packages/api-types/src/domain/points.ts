import { z } from 'zod';
import { IsoDateTime, named } from '../core/primitives';

export const BadgeKey = z.enum(['badge_50', 'badge_150', 'badge_300', 'badge_500']);
export const PointsSummary = named(
  'PointsSummary',
  z.object({
    total: z.number().int().min(0),
    badges: z
      .array(z.object({ key: BadgeKey, threshold: z.number().int().positive(), awardedAt: IsoDateTime.nullable() }))
      .length(4)
      .meta({ description: 'نشان‌ها با افت امتیاز باطل نمی‌شوند (قفل #12)' })
  })
);
