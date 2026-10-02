import { type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** اعتبارسنجی ورودی با همان schema قرارداد؛ خطا را exception filter به VALIDATION_FAILED تبدیل می‌کند */
export class ZodPipe<T extends ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}
  transform(value: unknown): ReturnType<T['parse']> {
    return this.schema.parse(value ?? {}) as ReturnType<T['parse']>;
  }
}
