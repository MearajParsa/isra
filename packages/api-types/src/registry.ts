import type { EndpointDef } from './core/endpoint';
import type { ServiceKey } from './core/version';
import { highEndpoints } from './high/endpoints';
import { lowEndpoints } from './low/endpoints';
import { midEndpoints } from './mid/endpoints';

/** همهٔ endpointها؛ منبع حقیقت برای OpenAPI، تست‌ها و docs */
export const ENDPOINTS: Record<ServiceKey, readonly EndpointDef[]> = {
  low: lowEndpoints,
  mid: midEndpoints,
  high: highEndpoints
};

export const ALL_ENDPOINTS: readonly EndpointDef[] = [...lowEndpoints, ...midEndpoints, ...highEndpoints];
