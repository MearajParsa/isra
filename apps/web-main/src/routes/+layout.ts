import { applyScenarioFromUrl } from '$lib/api/mock/control';

export const trailingSlash = 'never';

export const load = ({ url }: { url: URL }) => {
  applyScenarioFromUrl(url);
};
