/**
 * سناریوی mock برای دیدن حالت‌های UI (فقط توسعه/طراحی).
 * با افزودن ?mock=error | empty | slow | offline | maintenance به هر آدرس فعال می‌شود؛ ?mock=off پاک می‌کند.
 */
export type MockScenario = 'error' | 'empty' | 'slow' | 'offline' | 'maintenance';

const KEY = 'isra.mock.scenario';
const VALID: MockScenario[] = ['error', 'empty', 'slow', 'offline', 'maintenance'];

export function applyScenarioFromUrl(url: URL): void {
  if (typeof sessionStorage === 'undefined') return;
  const v = url.searchParams.get('mock');
  if (!v) return;
  try {
    if (v === 'off') sessionStorage.removeItem(KEY);
    else if ((VALID as string[]).includes(v)) sessionStorage.setItem(KEY, v);
  } catch {
    /* storage در دسترس نیست */
  }
}

export function getScenario(): MockScenario | null {
  if (typeof sessionStorage === 'undefined') return null;
  // load‌های صفحه و layout هم‌زمان اجرا می‌شوند؛ پارامتر آدرس را همین‌جا هم اعمال کن
  if (typeof location !== 'undefined') applyScenarioFromUrl(new URL(location.href));
  try {
    const v = sessionStorage.getItem(KEY);
    return v && (VALID as string[]).includes(v) ? (v as MockScenario) : null;
  } catch {
    return null;
  }
}

let ready = false;
/** پس از hydration true می‌شود؛ تا آن موقع mock بدون تأخیر پاسخ می‌دهد (بارگذاری اول سریع) */
export const markReady = () => {
  ready = true;
};
export const isReady = () => ready;
