/**
 * Service Worker Registration & Lifecycle
 */

type UpdateCallback = (reload: () => void) => void;
let onNeedRefreshCallback: UpdateCallback | null = null;

export function registerAppServiceWorker(onNeedRefresh?: UpdateCallback) {
  if (onNeedRefresh) {
    onNeedRefreshCallback = onNeedRefresh;
  }

  if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
    const swUrl = `${import.meta.env.BASE_URL || '/'}sw.js`;
    navigator.serviceWorker
      .register(swUrl, { scope: import.meta.env.BASE_URL || '/' })
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                if (onNeedRefreshCallback) {
                  onNeedRefreshCallback(() => {
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                    window.location.reload();
                  });
                }
              }
            });
          }
        });
      })
      .catch(() => {
        // PWA registration skipped or unsupported in environment
      });
  }
}
