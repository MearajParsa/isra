import { z } from 'zod';
import { defineEndpoint } from './endpoint';
import type { ServiceKey } from './version';
import { named } from './primitives';

export const Health = named('Health', z.object({ status: z.enum(['ok', 'degraded', 'down']), version: z.string(), uptimeSec: z.number().int().min(0).optional() }));

/** liveness/readiness — بدون envelope، بدون auth، فقط شبکهٔ داخلی/لودبالانسر (لاگ نمی‌شود) */
export const healthEndpoints = (service: ServiceKey, tag: string) => {
  const letter = service === 'low' ? 'L' : service === 'mid' ? 'M' : 'H';
  return [
    defineEndpoint({
      id: `${letter}-OPS-01`,
      service,
      method: 'get',
      path: '/health/live',
      unversioned: true,
      raw: true,
      summary: 'liveness: پروسه زنده است',
      tags: [tag],
      auth: 'none',
      response: Health,
      cache: 'no-store',
      sloP95Ms: 20,
      since: '1.0.0',
      internalOnly: true
    }),
    defineEndpoint({
      id: `${letter}-OPS-02`,
      service,
      method: 'get',
      path: '/health/ready',
      unversioned: true,
      raw: true,
      summary: 'readiness: DB و وابستگی‌ها آماده‌اند (برای ترافیک)',
      tags: [tag],
      auth: 'none',
      response: Health,
      errors: ['SERVICE_UNAVAILABLE'],
      cache: 'no-store',
      sloP95Ms: 50,
      since: '1.0.0',
      internalOnly: true
    })
  ];
};
