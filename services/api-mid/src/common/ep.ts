import { HttpCode, RequestMapping, RequestMethod, SetMetadata, applyDecorators, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ENDPOINTS, type EndpointDef, type HttpMethod } from '@isra/api-types';
import type { IsraRequest } from './request-context';

const byId = new Map<string, EndpointDef>(ENDPOINTS.mid.map((e) => [e.id, e]));

/** تعریف endpoint از قرارداد؛ نبودن شناسه ⇒ خطا در boot (کنترلر و قرارداد از هم جدا نمی‌شوند) */
export function endpoint(id: string): EndpointDef {
  const e = byId.get(id);
  if (!e) throw new Error(`endpoint ${id} در قرارداد @isra/api-types نیست`);
  return e;
}

export const EP_KEY = 'isra:endpoint';

const METHODS: Record<HttpMethod, RequestMethod> = {
  get: RequestMethod.GET,
  post: RequestMethod.POST,
  put: RequestMethod.PUT,
  patch: RequestMethod.PATCH,
  delete: RequestMethod.DELETE
};

/** مسیر کامل از قرارداد: `/o/v1{path}` (یا `/o{path}` برای مسیرهای بدون نسخه) با `{id}` ⇒ `:id` */
export const fullPath = (def: EndpointDef): string => `${def.unversioned ? '/o' : '/o/v1'}${def.path.replace(/\{(\w+)\}/g, ':$1')}`;

/**
 * تنها منبع حقیقت route: متد و مسیر از `ENDPOINTS.mid` خوانده می‌شود.
 * guard/interceptor همه‌چیز (auth، rate-limit، cache، اعتبارسنجی) را از همین تعریف می‌خوانند.
 */
export const Route = (id: string): MethodDecorator => {
  const def = endpoint(id);
  return applyDecorators(RequestMapping({ path: fullPath(def), method: METHODS[def.method] }), HttpCode(200), SetMetadata(EP_KEY, id));
};

export const lowEndpointIds = (): string[] => [...byId.keys()];

export interface ValidatedInput<B = unknown, Q = unknown, P = unknown> {
  body: B;
  query: Q;
  params: P;
}

/** ورودی اعتبارسنجی‌شده با schema قرارداد (در EndpointGuard) */
export const In = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<IsraRequest>().input);
