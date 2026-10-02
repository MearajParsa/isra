import { z } from 'zod';
import { ErrorBody } from './errors';
import { named } from './primitives';

export const MetaBase = named('ResponseMeta', z.object({ requestId: z.string().min(8).max(64) }));
export const MetaPage = named('PageMeta', z.object({
  requestId: z.string().min(8).max(64),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().min(0)
}));

/** پاسخ موفق تک‌منبع: `{ success, data, meta.requestId }` */
export const ok = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data, meta: MetaBase });
/** پاسخ موفق لیست: `data` آرایه + `meta` صفحه‌بندی */
export const okList = <T extends z.ZodType>(item: T) => z.object({ success: z.literal(true), data: z.array(item), meta: MetaPage });

export const ErrorEnvelope = z
  .object({ success: z.literal(false), error: ErrorBody, meta: MetaBase })
  .meta({ id: 'ErrorEnvelope', description: 'قالب یکسان همهٔ خطاها؛ stack trace هرگز نمی‌آید' });

/** بدنهٔ خالی موفق: `data: {}` */
export const Empty = z.object({}).strict();
