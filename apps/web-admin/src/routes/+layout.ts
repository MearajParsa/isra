import { applyScenarioFromUrl } from '$lib/api/mock/control';

export const trailingSlash = 'never';
// پنل مدیریت نیازی به SSR ندارد (همه‌چیز پشت ورود است)
export const ssr = false;

export const load = ({ url }: { url: URL }) => {
  applyScenarioFromUrl(url);
};
